import jwt from 'jsonwebtoken';
import pool from '../config/db.js';
import crypto from 'crypto';

// Store active calls
const activeCalls = {};

export const setupCallHandlers = (io, onlineUsers) => {
  
  io.on('connection', async (socket) => {
    
    // Authenticate user from token
    const token = socket.handshake.auth.token;
    
    if (!token) {
      console.log('❌ No token for call handler');
      return;
    }

    try {
      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Extract user_id (try multiple field names for flexibility)
      const userId = decoded.user_id || decoded.id || decoded.userId;
      
      console.log('🔍 Decoded JWT:', decoded);
      console.log('✅ User ID extracted:', userId);
      
      if (!userId) {
        console.log('❌ No user_id found in token');
        return;
      }
      
      // Get user's ghost name
      const userResult = await pool.query(
        'SELECT ghost_name FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        console.log('❌ User not found in database');
        return;
      }

      const userGhostName = userResult.rows[0].ghost_name;
      console.log(`📞 Call handler connected for user ${userId} (${userGhostName})`);

      // ============================================
      // CALL-USER EVENT (Initiate Call)
      // ============================================
      socket.on('call-user', async ({ targetGhostName }) => {
        try {
          console.log(`📞 User ${userId} (${userGhostName}) wants to call ${targetGhostName}`);

          // Find receiver by ghost name
          const receiverResult = await pool.query(
            'SELECT id, ghost_name FROM users WHERE ghost_name = $1',
            [targetGhostName]
          );

          if (receiverResult.rows.length === 0) {
            console.log(`❌ User ${targetGhostName} not found in database`);
            socket.emit('call-error', { error: 'User not found' });
            return;
          }

          const receiverId = receiverResult.rows[0].id;
          const receiverGhostName = receiverResult.rows[0].ghost_name;

          console.log(`📞 Found receiver: ID ${receiverId} (${receiverGhostName})`);
          console.log(`👥 Online users:`, Object.keys(onlineUsers).length, 'users');
          console.log(`🔍 Checking if user ${receiverId} is online...`);

          // Check if receiver is online
          const receiverSocketId = onlineUsers[receiverId];
          
          if (!receiverSocketId) {
            console.log(`❌ User ${receiverGhostName} (ID: ${receiverId}) is OFFLINE`);
            console.log(`📋 Online user IDs:`, Object.keys(onlineUsers));
            socket.emit('call-error', { error: 'User is offline' });
            return;
          }

          console.log(`✅ User ${receiverGhostName} is ONLINE (socket: ${receiverSocketId})`);

          // Generate unique call ID
          const callId = crypto.randomBytes(16).toString('hex');

          // Store call info
          activeCalls[callId] = {
            caller_id: userId,
            receiver_id: receiverId,
            caller_ghost_name: userGhostName,
            receiver_ghost_name: receiverGhostName,
            status: 'ringing',
            created_at: new Date()
          };

          console.log(`📞 Call ${callId} created: ${userGhostName} → ${receiverGhostName}`);

          // Send incoming-call event to receiver
          io.to(receiverSocketId).emit('incoming-call', {
            callId: callId,
            callerGhostName: userGhostName
          });

          console.log(`📤 Incoming call sent to ${receiverGhostName} (socket: ${receiverSocketId})`);

        } catch (error) {
          console.error('❌ Error in call-user:', error);
          socket.emit('call-error', { error: 'Failed to initiate call' });
        }
      });

      // ============================================
      // CALL-ACCEPTED EVENT
      // ============================================
      socket.on('call-accepted', ({ callId }) => {
        try {
          const call = activeCalls[callId];

          if (!call) {
            console.log(`❌ Call ${callId} not found`);
            return;
          }

          console.log(`✅ Call ${callId} accepted by ${call.receiver_ghost_name}`);

          call.status = 'active';

          // Notify caller that call was accepted
          const callerSocketId = onlineUsers[call.caller_id];
          if (callerSocketId) {
            io.to(callerSocketId).emit('call-accepted', {
              callId: callId,
              receiverGhostName: call.receiver_ghost_name
            });
          }

        } catch (error) {
          console.error('❌ Error in call-accepted:', error);
        }
      });

      // ============================================
      // CALL-DECLINED EVENT
      // ============================================
      socket.on('call-declined', ({ callId }) => {
        try {
          const call = activeCalls[callId];

          if (!call) {
            console.log(`❌ Call ${callId} not found`);
            return;
          }

          console.log(`❌ Call ${callId} declined by ${call.receiver_ghost_name}`);

          // Notify caller that call was declined
          const callerSocketId = onlineUsers[call.caller_id];
          if (callerSocketId) {
            io.to(callerSocketId).emit('call-declined', {
              callId: callId,
              receiverGhostName: call.receiver_ghost_name
            });
          }

          // Remove call
          delete activeCalls[callId];

        } catch (error) {
          console.error('❌ Error in call-declined:', error);
        }
      });

      // ============================================
      // WEBRTC-OFFER EVENT
      // ============================================
      socket.on('webrtc-offer', ({ callId, offer }) => {
        try {
          const call = activeCalls[callId];

          if (!call) {
            console.log(`❌ Call ${callId} not found`);
            return;
          }

          console.log(`📤 Relaying WebRTC offer for call ${callId}`);

          // Send offer to receiver
          const receiverSocketId = onlineUsers[call.receiver_id];
          if (receiverSocketId) {
            io.to(receiverSocketId).emit('webrtc-offer', {
              callId: callId,
              offer: offer
            });
          }

        } catch (error) {
          console.error('❌ Error in webrtc-offer:', error);
        }
      });

      // ============================================
      // WEBRTC-ANSWER EVENT
      // ============================================
      socket.on('webrtc-answer', ({ callId, answer }) => {
        try {
          const call = activeCalls[callId];

          if (!call) {
            console.log(`❌ Call ${callId} not found`);
            return;
          }

          console.log(`📤 Relaying WebRTC answer for call ${callId}`);

          // Send answer to caller
          const callerSocketId = onlineUsers[call.caller_id];
          if (callerSocketId) {
            io.to(callerSocketId).emit('webrtc-answer', {
              callId: callId,
              answer: answer
            });
          }

        } catch (error) {
          console.error('❌ Error in webrtc-answer:', error);
        }
      });

      // ============================================
      // ICE-CANDIDATE EVENT
      // ============================================
      socket.on('ice-candidate', ({ callId, candidate }) => {
        try {
          const call = activeCalls[callId];

          if (!call) {
            console.log(`❌ Call ${callId} not found`);
            return;
          }

          // Determine if this user is caller or receiver
          const isCallerSender = userId === call.caller_id;
          
          // Send to the other party
          const targetUserId = isCallerSender ? call.receiver_id : call.caller_id;
          const targetSocketId = onlineUsers[targetUserId];

          if (targetSocketId) {
            io.to(targetSocketId).emit('ice-candidate', {
              callId: callId,
              candidate: candidate
            });
            console.log(`🧊 ICE candidate relayed for call ${callId}`);
          }

        } catch (error) {
          console.error('❌ Error in ice-candidate:', error);
        }
      });

      // ============================================
      // CALL-ENDED EVENT
      // ============================================
      socket.on('call-ended', ({ callId }) => {
        try {
          const call = activeCalls[callId];

          if (!call) {
            console.log(`❌ Call ${callId} not found`);
            return;
          }

          console.log(`📴 Call ${callId} ended`);

          // Notify both parties
          const callerSocketId = onlineUsers[call.caller_id];
          const receiverSocketId = onlineUsers[call.receiver_id];

          if (callerSocketId) {
            io.to(callerSocketId).emit('call-ended', {
              callId: callId,
              endedBy: userId === call.caller_id ? 'you' : 'other'
            });
          }

          if (receiverSocketId) {
            io.to(receiverSocketId).emit('call-ended', {
              callId: callId,
              endedBy: userId === call.receiver_id ? 'you' : 'other'
            });
          }

          // Remove call
          delete activeCalls[callId];

        } catch (error) {
          console.error('❌ Error in call-ended:', error);
        }
      });

      // ============================================
      // DISCONNECT - Cleanup active calls
      // ============================================
      socket.on('disconnect', () => {
        // Find and end any active calls for this user
        Object.keys(activeCalls).forEach(callId => {
          const call = activeCalls[callId];
          
          if (call.caller_id === userId || call.receiver_id === userId) {
            console.log(`📴 User ${userId} disconnected, ending call ${callId}`);
            
            // Notify the other party
            const otherUserId = call.caller_id === userId ? call.receiver_id : call.caller_id;
            const otherSocketId = onlineUsers[otherUserId];
            
            if (otherSocketId) {
              io.to(otherSocketId).emit('call-ended', {
                callId: callId,
                endedBy: 'disconnect'
              });
            }
            
            delete activeCalls[callId];
          }
        });
      });

    } catch (error) {
      console.error('❌ Call handler authentication error:', error);
      console.error('Error details:', error.message);
      socket.disconnect();
    }
  });
};

// Export helper to get active calls (if needed elsewhere)
export const getActiveCalls = () => activeCalls;