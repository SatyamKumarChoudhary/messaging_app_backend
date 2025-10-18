import jwt from 'jsonwebtoken';
import pool from '../config/db.js';

// Store online users: { user_id: socket_id }
const onlineUsers = {};

export const setupSocketHandlers = (io) => {
  
  io.on('connection', async (socket) => {
    console.log('New socket connection:', socket.id);

    // Authenticate user from token
    const token = socket.handshake.auth.token;
    
    if (!token) {
      console.log('No token provided');
      socket.disconnect();
      return;
    }

    try {
      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.user_id;
      
      // Store user as online
      onlineUsers[userId] = socket.id;
      console.log(`✅ User ${userId} is now ONLINE`);

      // Auto-deliver pending messages
      await deliverPendingMessages(userId, socket, io);

      // Listen for message delivery acknowledgment
      socket.on('message_delivered', async (data) => {
        const { message_id } = data;
        console.log(`✅ Message ${message_id} delivered, deleting from DB`);
        
        // Delete message from database buffer
        await pool.query('DELETE FROM messages WHERE id = $1', [message_id]);
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        delete onlineUsers[userId];
        console.log(`❌ User ${userId} is now OFFLINE`);
      });

    } catch (error) {
      console.error('Socket authentication error:', error);
      socket.disconnect();
    }
  });
};

// Function to deliver pending messages
async function deliverPendingMessages(userId, socket, io) {
  try {
    // Fetch all undelivered messages for this user
    const result = await pool.query(
      `SELECT m.id, m.text, m.created_at, u.username as sender_name, u.id as sender_id
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.receiver_id = $1 AND m.is_delivered = false
       ORDER BY m.created_at ASC`,
      [userId]
    );

    const messages = result.rows;

    if (messages.length > 0) {
      console.log(`📨 Delivering ${messages.length} pending messages to user ${userId}`);
      
      // Send each message via Socket.io
      for (const msg of messages) {
        socket.emit('new_message', {
          message_id: msg.id,
          sender_name: msg.sender_name,
          sender_id: msg.sender_id,
          text: msg.text,
          created_at: msg.created_at
        });
      }
    } else {
      console.log(`No pending messages for user ${userId}`);
    }
  } catch (error) {
    console.error('Error delivering pending messages:', error);
  }
}

// Function to send message in real-time (when both users online)
export async function sendRealTimeMessage(receiverId, messageData, io) {
  const receiverSocketId = onlineUsers[receiverId];
  
  if (receiverSocketId) {
    // Receiver is online, send via Socket.io
    io.to(receiverSocketId).emit('new_message', messageData);
    console.log(`📨 Real-time message sent to user ${receiverId}`);
    return true; // Message delivered
  }
  
  console.log(`User ${receiverId} is OFFLINE, message stays in buffer`);
  return false; // Receiver offline
}