import pool from '../config/db.js';
import { io } from '../server.js';

// ============================================
// 1. CREATE GROUP (NO CHANGES - ALREADY GOOD)
// ============================================
export const createGroup = async (req, res) => {
  try {
    const { name, description, member_phones } = req.body;
    const creator_id = req.user.user_id;

    console.log('📝 Creating group:', { name, creator_id, member_phones });

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const newGroup = await client.query(
        'INSERT INTO groups (name, description, created_by) VALUES ($1, $2, $3) RETURNING *',
        [name.trim(), description || null, creator_id]
      );

      const group = newGroup.rows[0];
      console.log('✅ Group created:', group.id);

      await client.query(
        'INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, $3)',
        [group.id, creator_id, 'admin']
      );
      console.log('✅ Creator added as admin');

      let addedMembers = 0;
      if (member_phones && Array.isArray(member_phones) && member_phones.length > 0) {
        for (const phone of member_phones) {
          if (!phone || phone.trim().length === 0) continue;

          const userResult = await client.query(
            'SELECT id FROM users WHERE phone = $1',
            [phone.trim()]
          );

          if (userResult.rows.length > 0) {
            const userId = userResult.rows[0].id;
            
            if (userId !== creator_id) {
              await client.query(
                'INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, $3)',
                [group.id, userId, 'member']
              );
              addedMembers++;
            }
          } else {
            console.log(`⚠️  User not found: ${phone}`);
          }
        }
      }

      await client.query('COMMIT');
      console.log(`✅ Added ${addedMembers} members to group`);

      res.status(201).json({
        success: true,
        message: 'Group created successfully',
        group: {
          id: group.id,
          name: group.name,
          description: group.description,
          created_by: group.created_by,
          created_at: group.created_at,
          members_added: addedMembers + 1
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Create group error:', error);
    res.status(500).json({ error: 'Failed to create group' });
  }
};

// ============================================
// 2. GET USER'S GROUPS (NO CHANGES NEEDED)
// ============================================
export const getUserGroups = async (req, res) => {
  try {
    const user_id = req.user.user_id;

    console.log('📂 Fetching groups for user:', user_id);

    const groups = await pool.query(
      `SELECT 
         g.id,
         g.name,
         g.description,
         g.group_avatar_url,
         g.created_at,
         COUNT(DISTINCT gm_users.user_id) as member_count,
         COALESCE(rs.last_read_message_id, 0) as last_read_message_id,
         (SELECT COUNT(*) 
          FROM group_messages 
          WHERE group_id = g.id 
          AND id > COALESCE(rs.last_read_message_id, 0)) as unread_count,
         (SELECT text FROM group_messages 
          WHERE group_id = g.id 
          ORDER BY created_at DESC LIMIT 1) as last_message,
         (SELECT created_at FROM group_messages 
          WHERE group_id = g.id 
          ORDER BY created_at DESC LIMIT 1) as last_message_time
       FROM groups g
       JOIN group_members gm ON g.id = gm.group_id
       LEFT JOIN group_members gm_users ON g.id = gm_users.group_id
       LEFT JOIN group_member_read_status rs 
         ON g.id = rs.group_id AND rs.user_id = $1
       WHERE gm.user_id = $1
       GROUP BY g.id, rs.last_read_message_id
       ORDER BY last_message_time DESC NULLS LAST, g.created_at DESC`,
      [user_id]
    );

    console.log(`✅ Found ${groups.rows.length} groups`);

    res.json({
      success: true,
      count: groups.rows.length,
      groups: groups.rows
    });
  } catch (error) {
    console.error('❌ Get groups error:', error);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
};

// ============================================
// 3. SEND GROUP MESSAGE (WITH GHOST NAMES) ← UPDATED
// ============================================
export const sendGroupMessage = async (req, res) => {
  try {
    const { group_id, text, message_type = 'text', media_url, file_name, file_size } = req.body;
    const sender_id = req.user.user_id;

    console.log('💬 Sending message to group:', { group_id, sender_id, message_type });

    if (!group_id) {
      return res.status(400).json({ error: 'Group ID is required' });
    }

    if (!text && !media_url) {
      return res.status(400).json({ error: 'Message text or media is required' });
    }

    // Check if user is member of group
    const memberCheck = await pool.query(
      'SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2',
      [group_id, sender_id]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'You are not a member of this group' });
    }

    // Insert message into database
    const newMessage = await pool.query(
      `INSERT INTO group_messages 
       (group_id, sender_id, text, message_type, media_url, file_name, file_size) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING *`,
      [group_id, sender_id, text, message_type, media_url, file_name, file_size]
    );

    const message = newMessage.rows[0];
    console.log('✅ Message saved to DB:', message.id);

    // Get sender info WITH GHOST NAME
    const senderInfo = await pool.query(
      'SELECT username, phone, ghost_name FROM users WHERE id = $1',  // ← ADDED ghost_name
      [sender_id]
    );

    const sender = senderInfo.rows[0];

    // Prepare message data with GHOST NAME
    const messageData = {
      id: message.id,
      group_id: message.group_id,
      sender_id: message.sender_id,
      sender_name: sender.ghost_name,        // ← GHOST NAME HERE
      sender_phone: sender.phone,
      text: message.text,
      message_type: message.message_type,
      media_url: message.media_url,
      file_name: message.file_name,
      file_size: message.file_size,
      created_at: message.created_at
    };

    // Broadcast to all group members via Socket.IO
    io.to(`group_${group_id}`).emit('new_group_message', messageData);
    console.log(`📡 Broadcast to room: group_${group_id}`);

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: messageData
    });
  } catch (error) {
    console.error('❌ Send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
};

// ============================================
// 4. GET GROUP MESSAGES (WITH GHOST NAMES) ← UPDATED
// ============================================
export const getGroupMessages = async (req, res) => {
  try {
    const { group_id } = req.params;
    const { limit = 100, before_id } = req.query;
    const user_id = req.user.user_id;

    console.log('📨 Fetching messages for group:', { group_id, user_id, limit, before_id });

    // Check if user is member
    const memberCheck = await pool.query(
      'SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2',
      [group_id, user_id]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'You are not a member of this group' });
    }

    // Build query with GHOST NAMES
    let query;
    let params;

    if (before_id) {
      query = `
        SELECT gm.*, u.ghost_name as sender_name, u.phone as sender_phone
        FROM group_messages gm
        JOIN users u ON gm.sender_id = u.id
        WHERE gm.group_id = $1 AND gm.id < $2
        ORDER BY gm.created_at DESC
        LIMIT $3
      `;
      params = [group_id, before_id, limit];
    } else {
      query = `
        SELECT gm.*, u.ghost_name as sender_name, u.phone as sender_phone
        FROM group_messages gm
        JOIN users u ON gm.sender_id = u.id
        WHERE gm.group_id = $1
        ORDER BY gm.created_at DESC
        LIMIT $2
      `;
      params = [group_id, limit];
    }

    const messages = await pool.query(query, params);

    console.log(`✅ Found ${messages.rows.length} messages`);

    res.json({
      success: true,
      count: messages.rows.length,
      messages: messages.rows.reverse()
    });
  } catch (error) {
    console.error('❌ Get messages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
};

// ============================================
// 5. GET UNREAD MESSAGES (WITH GHOST NAMES) ← UPDATED
// ============================================
export const getUnreadMessages = async (req, res) => {
  try {
    const { group_id } = req.params;
    const user_id = req.user.user_id;

    console.log('📬 Fetching unread messages:', { group_id, user_id });

    const memberCheck = await pool.query(
      'SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2',
      [group_id, user_id]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'You are not a member of this group' });
    }

    const readStatus = await pool.query(
      'SELECT last_read_message_id FROM group_member_read_status WHERE group_id = $1 AND user_id = $2',
      [group_id, user_id]
    );

    const lastReadId = readStatus.rows.length > 0 
      ? readStatus.rows[0].last_read_message_id 
      : 0;

    console.log('📖 Last read message ID:', lastReadId);

    // Get unread messages with GHOST NAMES
    const messages = await pool.query(
      `SELECT gm.*, u.ghost_name as sender_name, u.phone as sender_phone
       FROM group_messages gm
       JOIN users u ON gm.sender_id = u.id
       WHERE gm.group_id = $1 AND gm.id > $2
       ORDER BY gm.created_at ASC`,
      [group_id, lastReadId]
    );

    console.log(`✅ Found ${messages.rows.length} unread messages`);

    res.json({
      success: true,
      unread_count: messages.rows.length,
      last_read_id: lastReadId,
      messages: messages.rows
    });
  } catch (error) {
    console.error('❌ Get unread messages error:', error);
    res.status(500).json({ error: 'Failed to fetch unread messages' });
  }
};

// ============================================
// 6. MARK MESSAGES AS READ (NO CHANGES)
// ============================================
export const markMessagesAsRead = async (req, res) => {
  try {
    const { group_id, message_id } = req.body;
    const user_id = req.user.user_id;

    console.log('✓ Marking as read:', { group_id, user_id, message_id });

    if (!group_id || !message_id) {
      return res.status(400).json({ error: 'Group ID and message ID are required' });
    }

    await pool.query(
      `INSERT INTO group_member_read_status (group_id, user_id, last_read_message_id, last_read_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (group_id, user_id)
       DO UPDATE SET 
         last_read_message_id = $3,
         last_read_at = NOW()`,
      [group_id, user_id, message_id]
    );

    console.log('✅ Marked as read');

    res.json({ success: true, message: 'Messages marked as read' });
  } catch (error) {
    console.error('❌ Mark as read error:', error);
    res.status(500).json({ error: 'Failed to mark messages as read' });
  }
};

// ============================================
// 7. ADD MEMBER TO GROUP (WITH GHOST NAMES) ← UPDATED
// ============================================
export const addGroupMember = async (req, res) => {
  try {
    const { group_id, phone } = req.body;
    const user_id = req.user.user_id;

    console.log('👥 Adding member to group:', { group_id, phone });

    if (!group_id || !phone) {
      return res.status(400).json({ error: 'Group ID and phone number are required' });
    }

    // Check if requester is admin
    const adminCheck = await pool.query(
      'SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2 AND role = $3',
      [group_id, user_id, 'admin']
    );

    if (adminCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Only admins can add members' });
    }

    // Find user by phone WITH GHOST NAME
    const userResult = await pool.query(
      'SELECT id, username, ghost_name FROM users WHERE phone = $1',  // ← ADDED ghost_name
      [phone.trim()]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found with this phone number' });
    }

    const newMemberId = userResult.rows[0].id;
    const newMemberGhostName = userResult.rows[0].ghost_name;  // ← USE GHOST NAME

    // Add member
    await pool.query(
      'INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, $3)',
      [group_id, newMemberId, 'member']
    );

    console.log('✅ Member added:', newMemberGhostName);

    res.json({
      success: true,
      message: `${newMemberGhostName} added to group`,  // ← GHOST NAME
      member: {
        id: newMemberId,
        username: newMemberGhostName,  // ← GHOST NAME
        phone: phone
      }
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'User is already a member of this group' });
    }
    console.error('❌ Add member error:', error);
    res.status(500).json({ error: 'Failed to add member' });
  }
};

// ============================================
// 8. GET GROUP DETAILS (WITH GHOST NAMES) ← UPDATED
// ============================================
export const getGroupDetails = async (req, res) => {
  try {
    const { group_id } = req.params;
    const user_id = req.user.user_id;

    console.log('ℹ️  Fetching group details:', { group_id, user_id });

    // Check membership
    const memberCheck = await pool.query(
      'SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2',
      [group_id, user_id]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'You are not a member of this group' });
    }

    const userRole = memberCheck.rows[0].role;

    // Get group info WITH GHOST NAME
    const groupInfo = await pool.query(
      `SELECT g.*, u.ghost_name as creator_name
       FROM groups g
       JOIN users u ON g.created_by = u.id
       WHERE g.id = $1`,
      [group_id]
    );

    // Get members WITH GHOST NAMES
    const members = await pool.query(
      `SELECT u.id, u.ghost_name as username, u.phone, gm.role, gm.joined_at
       FROM group_members gm
       JOIN users u ON gm.user_id = u.id
       WHERE gm.group_id = $1
       ORDER BY gm.role DESC, gm.joined_at ASC`,
      [group_id]
    );

    console.log('✅ Group details fetched');

    res.json({
      success: true,
      group: groupInfo.rows[0],
      members: members.rows,
      your_role: userRole,
      member_count: members.rows.length
    });
  } catch (error) {
    console.error('❌ Get group details error:', error);
    res.status(500).json({ error: 'Failed to fetch group details' });
  }
};