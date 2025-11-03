import jwt from 'jsonwebtoken';
import pool from '../config/db.js';

// Store online users: { user_id: socket_id }
const onlineUsers = {};

export const setupSocketHandlers = (io) => {
  
  io.on('connection', async (socket) => {
    console.log('🔌 New socket connection:', socket.id);

    // Authenticate user from token
    const token = socket.handshake.auth.token;
    
    if (!token) {
      console.log('❌ No token provided');
      socket.disconnect();
      return;
    }

    try {
      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.user_id;
      
      // Store user as online
      onlineUsers[userId] = socket.id;
      console.log(`✅ User ${userId} is now ONLINE (socket: ${socket.id})`);

      // ============================================
      // 🆕 NEW: JOIN USER TO ALL THEIR GROUP ROOMS
      // ============================================
      try {
        const userGroups = await pool.query(
          'SELECT group_id FROM group_members WHERE user_id = $1',
          [userId]
        );

        if (userGroups.rows.length > 0) {
          userGroups.rows.forEach(row => {
            const roomName = `group_${row.group_id}`;
            socket.join(roomName);
            console.log(`📻 User ${userId} joined room: ${roomName}`);
          });
          console.log(`✅ User ${userId} joined ${userGroups.rows.length} group rooms`);
        } else {
          console.log(`ℹ️  User ${userId} has no groups yet`);
        }
      } catch (groupError) {
        console.error('❌ Error joining group rooms:', groupError);
      }

      // ============================================
      // EXISTING: Auto-deliver pending 1-to-1 messages
      // ============================================
      await deliverPendingMessages(userId, socket, io);

      // ============================================
      // EXISTING: Listen for 1-to-1 message delivery acknowledgment
      // ============================================
      socket.on('message_delivered', async (data) => {
        const { message_id } = data;
        console.log(`✅ Message ${message_id} delivered, deleting from DB`);
        
        try {
          // Delete message from database buffer
          await pool.query('DELETE FROM messages WHERE id = $1', [message_id]);
        } catch (error) {
          console.error('❌ Error deleting message:', error);
        }
      });

      // ============================================
      // 🆕 NEW: Listen for group message delivery acknowledgment
      // ============================================
      socket.on('group_message_delivered', async (data) => {
        const { message_id, group_id } = data;
        console.log(`✅ Group message ${message_id} delivered to user ${userId} in group ${group_id}`);
        
        // Note: We don't delete group messages from DB
        // They stay for history and for offline users
      });

      // ============================================
      // 🆕 NEW: User typing indicator in group
      // ============================================
      socket.on('typing_in_group', (data) => {
        const { group_id, username } = data;
        // Broadcast to everyone in group EXCEPT sender
        socket.to(`group_${group_id}`).emit('user_typing', {
          group_id,
          username,
          user_id: userId
        });
      });

      // ============================================
      // 🆕 NEW: User stopped typing in group
      // ============================================
      socket.on('stopped_typing_in_group', (data) => {
        const { group_id } = data;
        socket.to(`group_${group_id}`).emit('user_stopped_typing', {
          group_id,
          user_id: userId
        });
      });

      // ============================================
      // EXISTING: Handle disconnect
      // ============================================
      socket.on('disconnect', () => {
        delete onlineUsers[userId];
        console.log(`❌ User ${userId} is now OFFLINE (socket: ${socket.id})`);
        
        // Socket.IO automatically removes user from all rooms on disconnect
      });

    } catch (error) {
      console.error('❌ Socket authentication error:', error);
      socket.disconnect();
    }
  });
};

// ============================================
// EXISTING: Function to deliver pending 1-to-1 messages
// ============================================
async function deliverPendingMessages(userId, socket, io) {
  try {
    // Fetch all undelivered 1-to-1 messages for this user
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
      console.log(`📨 Delivering ${messages.length} pending 1-to-1 messages to user ${userId}`);
      
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
      console.log(`ℹ️  No pending 1-to-1 messages for user ${userId}`);
    }
  } catch (error) {
    console.error('❌ Error delivering pending messages:', error);
  }
}

// ============================================
// EXISTING: Function to send 1-to-1 message in real-time
// ============================================
export async function sendRealTimeMessage(receiverId, messageData, io) {
  const receiverSocketId = onlineUsers[receiverId];
  
  if (receiverSocketId) {
    // Receiver is online, send via Socket.io
    io.to(receiverSocketId).emit('new_message', messageData);
    console.log(`📨 Real-time 1-to-1 message sent to user ${receiverId}`);
    return true; // Message delivered
  }
  
  console.log(`ℹ️  User ${receiverId} is OFFLINE, message stays in buffer`);
  return false; // Receiver offline
}

// ============================================
// 🆕 NEW: Get online users count in a group
// ============================================
export function getOnlineGroupMembers(groupId, io) {
  const roomName = `group_${groupId}`;
  const room = io.sockets.adapter.rooms.get(roomName);
  
  if (room) {
    return room.size; // Number of sockets in this room
  }
  
  return 0;
}

// ============================================
// 🆕 NEW: Check if user is online
// ============================================
export function isUserOnline(userId) {
  return onlineUsers.hasOwnProperty(userId);
}

// ============================================
// EXPORT: Get online users (for debugging)
// ============================================
export function getOnlineUsers() {
  return Object.keys(onlineUsers).length;
}