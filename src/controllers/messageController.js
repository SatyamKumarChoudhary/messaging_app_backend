import pool from '../config/db.js';
import { sendRealTimeMessage } from '../socket/socketHandler.js';
import { io } from '../server.js';
import { sendSMSNotification } from '../services/awsSnsService.js';

// Send a message (Phone-Based with Dual Table Routing + SMS + Media Support)
export const sendMessage = async (req, res) => {
  try {
    const { 
      receiver_phone, 
      text,
      message_type = 'text',  // NEW: Default to 'text'
      media_url = null,       // NEW: S3 URL
      file_name = null,       // NEW: Original filename
      file_size = null        // NEW: File size in bytes
    } = req.body;
    
    const sender_id = req.user.user_id; // From JWT token (set by auth middleware)

    // Validate input
    if (!receiver_phone) {
      return res.status(400).json({ error: 'Receiver phone is required' });
    }

    // NEW: Validate that either text OR media is provided
    if (!text && !media_url) {
      return res.status(400).json({ error: 'Either text or media is required' });
    }

    // Phone validation (Indian format: +919876543210)
    const phoneRegex = /^\+91[6-9]\d{9}$/;
    if (!phoneRegex.test(receiver_phone)) {
      return res.status(400).json({ 
        error: 'Invalid phone format. Use: +919876543210' 
      });
    }

    // Get sender info
    const sender = await pool.query(
      'SELECT username, phone FROM users WHERE id = $1',
      [sender_id]
    );
    const sender_name = sender.rows[0].username || sender.rows[0].phone;
    const sender_phone = sender.rows[0].phone;

    // 🔥 CHECK IF RECEIVER EXISTS (by phone)
    const receiver = await pool.query(
      'SELECT id, username, phone FROM users WHERE phone = $1',
      [receiver_phone]
    );

    // ✅ CASE 1: Receiver is REGISTERED → Insert into messages table
    if (receiver.rows.length > 0) {
      const receiver_id = receiver.rows[0].id;

      // Insert message into messages table (with media fields)
      const newMessage = await pool.query(
        `INSERT INTO messages 
         (sender_id, receiver_id, text, message_type, media_url, file_name, file_size, is_delivered) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
         RETURNING *`,
        [sender_id, receiver_id, text || '', message_type, media_url, file_name, file_size, false]
      );

      // Prepare message data for real-time delivery
      const messageData = {
        message_id: newMessage.rows[0].id,
        sender_name: sender_name,
        sender_phone: sender_phone,
        sender_id: sender_id,
        text: text || '',
        message_type: message_type,        // NEW
        media_url: media_url,              // NEW
        file_name: file_name,              // NEW
        file_size: file_size,              // NEW
        created_at: newMessage.rows[0].created_at
      };

      // 🔥 Try real-time delivery if receiver is online
      const delivered = await sendRealTimeMessage(receiver_id, messageData, io);

      return res.status(201).json({
        success: true,
        message: delivered 
          ? 'Message sent and delivered in real-time' 
          : 'Message sent (user offline, will be delivered when online)',
        message_id: newMessage.rows[0].id,
        delivered: delivered,
        receiver_status: 'registered',
        message_type: message_type         // NEW
      });
    } 
    
    // ❌ CASE 2: Receiver is NOT REGISTERED → Insert into pending_invites + Send SMS via AWS SNS
    else {
      console.log(`📞 User not registered: ${receiver_phone}. Saving to pending_invites...`);

      const pendingInvite = await pool.query(
        `INSERT INTO pending_invites 
         (sender_id, receiver_phone, text, message_type, media_url, file_name, file_size, is_delivered) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
         RETURNING *`,
        [sender_id, receiver_phone, text || '', message_type, media_url, file_name, file_size, false]
      );

      console.log(`✅ Message saved to pending_invites (ID: ${pendingInvite.rows[0].id})`);

      // 📲 SEND SMS NOTIFICATION via AWS SNS
      console.log(`📲 Sending SMS via AWS SNS to: ${receiver_phone}`);
      
      // NEW: Adjust SMS text based on message type
      let smsText;
      if (message_type === 'text') {
        const messagePreview = text.length > 40 ? text.substring(0, 40) + '...' : text;
        smsText = messagePreview;
      } else {
        smsText = `sent you a ${message_type}`; // "sent you a image/video/file"
      }
      
      const smsResult = await sendSMSNotification(receiver_phone, sender_name, smsText);

      if (smsResult.success) {
        console.log(`✅ SMS sent successfully via AWS SNS. MessageId: ${smsResult.messageId}`);
      } else {
        console.error(`❌ SMS failed:`, smsResult.error);
      }

      return res.status(201).json({
        success: true,
        message: 'Message sent to unregistered user. SMS notification sent via AWS SNS!',
        invite_id: pendingInvite.rows[0].id,
        delivered: false,
        receiver_status: 'unregistered',
        message_type: message_type,        // NEW
        sms_sent: smsResult.success,
        sms_details: {
          provider: 'AWS SNS',
          messageId: smsResult.messageId,
          error: smsResult.error
        },
        info: `Message saved for ${receiver_phone}. They'll receive SMS and get the message when they register.`
      });
    }

  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get pending messages for logged-in user (Updated to include media fields)
export const getPendingMessages = async (req, res) => {
  try {
    const user_id = req.user.user_id; // From JWT token

    // Get all undelivered messages for this user (including media fields)
    const messages = await pool.query(
      `SELECT m.id, m.text, m.message_type, m.media_url, m.file_name, m.file_size, m.created_at, 
              u.username as sender_name, u.phone as sender_phone, u.id as sender_id
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.receiver_id = $1 AND m.is_delivered = false
       ORDER BY m.created_at ASC`,
      [user_id]
    );

    res.json({
      success: true,
      count: messages.rows.length,
      messages: messages.rows
    });
  } catch (error) {
    console.error('Get pending messages error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};