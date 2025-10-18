import express from 'express';
import { sendMessage, getPendingMessages } from '../controllers/messageController.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// All message routes require authentication
router.use(verifyToken);

// POST /api/messages/send
router.post('/send', sendMessage);

// GET /api/messages/pending
router.get('/pending', getPendingMessages);

export default router;