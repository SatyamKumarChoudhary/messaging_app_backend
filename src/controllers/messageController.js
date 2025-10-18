import pool from '../config/db.js';
import { sendRealTimeMessage } from '../socket/socketHandler.js';
import { io } from '../server.js';

// Send a message
export const sendMessage = async (req, res) => {
  try {
    const { receiver_username, text } = req.body;
    const sender_id = req.user.user_id; // From JWT token (set by auth middleware)

    // Validate input
    if (!receiver_username || !text) {
      return res.status(400).json({ error: 'Receiver username and text are required' });
    }

    // Find receiver by username
    const receiver = await pool.query(
      'SELECT id, username FROM users WHERE username = $1',
      [receiver_username]
    );

    if (receiver.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const receiver_id = receiver.rows[0].id;

    // Get sender info
    const sender = await pool.query(
      'SELECT username FROM users WHERE id = $1',
      [sender_id]
    );
    const sender_name = sender.rows[0].username;

    // Insert message into database (buffer/queue)
    const newMessage = await pool.query(
      'INSERT INTO messages (sender_id, receiver_id, text, is_delivered) VALUES ($1, $2, $3, $4) RETURNING *',
      [sender_id, receiver_id, text, false]
    );

    // Prepare message data
    const messageData = {
      message_id: newMessage.rows[0].id,
      sender_name: sender_name,
      sender_id: sender_id,
      text: text,
      created_at: newMessage.rows[0].created_at
    };

    // 🔥 Check if receiver is online and push real-time
    const delivered = await sendRealTimeMessage(receiver_id, messageData, io);

    res.status(201).json({
      success: true,
      message: delivered ? 'Message sent and delivered in real-time' : 'Message sent (user offline)',
      message_id: newMessage.rows[0].id,
      delivered: delivered
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get pending messages for logged-in user
export const getPendingMessages = async (req, res) => {
  try {
    const user_id = req.user.user_id; // From JWT token

    // Get all undelivered messages for this user
    const messages = await pool.query(
      `SELECT m.id, m.text, m.created_at, u.username as sender_name, u.id as sender_id
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