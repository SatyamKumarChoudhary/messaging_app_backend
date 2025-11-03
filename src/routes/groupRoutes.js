import express from 'express';
import { 
  createGroup, 
  getUserGroups, 
  sendGroupMessage, 
  getGroupMessages,
  getUnreadMessages,
  markMessagesAsRead,
  addGroupMember,
  getGroupDetails
} from '../controllers/groupController.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// ============================================
// ALL ROUTES REQUIRE AUTHENTICATION
// ============================================
router.use(verifyToken);

// ============================================
// GROUP MANAGEMENT ROUTES
// ============================================

/**
 * @route   POST /api/groups/create
 * @desc    Create a new group
 * @access  Private (any authenticated user)
 * @body    { name, description?, member_phones?: [] }
 */
router.post('/create', createGroup);

/**
 * @route   GET /api/groups/my-groups
 * @desc    Get all groups user is member of
 * @access  Private
 * @returns Array of groups with unread counts
 */
router.get('/my-groups', getUserGroups);

/**
 * @route   GET /api/groups/:group_id/details
 * @desc    Get group details and members
 * @access  Private (group members only)
 * @returns Group info and member list
 */
router.get('/:group_id/details', getGroupDetails);

/**
 * @route   POST /api/groups/add-member
 * @desc    Add a member to group
 * @access  Private (admins only)
 * @body    { group_id, phone }
 */
router.post('/add-member', addGroupMember);

// ============================================
// GROUP MESSAGING ROUTES
// ============================================

/**
 * @route   POST /api/groups/send-message
 * @desc    Send a message in group
 * @access  Private (group members only)
 * @body    { group_id, text, message_type?, media_url?, file_name?, file_size? }
 */
router.post('/send-message', sendGroupMessage);

/**
 * @route   GET /api/groups/:group_id/messages
 * @desc    Get group message history (latest 100 or paginated)
 * @access  Private (group members only)
 * @query   ?limit=100&before_id=123
 * @returns Array of messages
 */
router.get('/:group_id/messages', getGroupMessages);

/**
 * @route   GET /api/groups/:group_id/unread-messages
 * @desc    Get only unread messages for user
 * @access  Private (group members only)
 * @returns Array of unread messages
 */
router.get('/:group_id/unread-messages', getUnreadMessages);

/**
 * @route   POST /api/groups/mark-read
 * @desc    Mark messages as read up to a message ID
 * @access  Private (group members only)
 * @body    { group_id, message_id }
 */
router.post('/mark-read', markMessagesAsRead);

// ============================================
// EXPORT ROUTER
// ============================================
export default router;