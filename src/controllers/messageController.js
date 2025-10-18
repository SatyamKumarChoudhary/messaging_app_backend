import pool from '../config/db.js';
import { sendRealTimeMessage } from '../socket/socketHandler.js';
import { io } from '../server.js';

// Send a message (Phone-Based with Dual Table Routing)
export const sendMessage = async (req, res) => {
  try {
    const { receiver_phone, text } = req.body;
    const sender_id = req.user.user_id; // From JWT token (set by auth middleware)

    // Validate input
    if (!receiver_phone || !text) {
      return res.status(400).json({ error: 'Receiver phone and text are required' });
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

    // CASE 1: Receiver is REGISTERED → Insert into messages table
    if (receiver.rows.length > 0) {
      const receiver_id = receiver.rows[0].id;

      // Insert message into messages table
      const newMessage = await pool.query(
        'INSERT INTO messages (sender_id, receiver_id, text, is_delivered) VALUES ($1, $2, $3, $4) RETURNING *',
        [sender_id, receiver_id, text, false]
      );

      // Prepare message data for real-time delivery
      const messageData = {
        message_id: newMessage.rows[0].id,
        sender_name: sender_name,
        sender_phone: sender_phone,
        sender_id: sender_id,
        text: text,
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
        receiver_status: 'registered'
      });
    } 
    
    // CASE 2: Receiver is NOT REGISTERED → Insert into pending_invites table
    else {
      const pendingInvite = await pool.query(
        'INSERT INTO pending_invites (sender_id, receiver_phone, text, is_delivered) VALUES ($1, $2, $3, $4) RETURNING *',
        [sender_id, receiver_phone, text, false]
      );

      return res.status(201).json({
        success: true,
        message: 'Message sent to unregistered user. They will receive it when they sign up.',
        invite_id: pendingInvite.rows[0].id,
        delivered: false,
        receiver_status: 'unregistered',
        info: `Message saved for ${receiver_phone}. They'll get it when they register.`
      });
    }

  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get pending messages for logged-in user (No changes needed)
export const getPendingMessages = async (req, res) => {
  try {
    const user_id = req.user.user_id; // From JWT token

    // Get all undelivered messages for this user
    const messages = await pool.query(
      `SELECT m.id, m.text, m.created_at, u.username as sender_name, u.phone as sender_phone, u.id as sender_id
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