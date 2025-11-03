// Load environment variables
import dotenv from 'dotenv';
import './config/db.js';

dotenv.config();

import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';

// Import routes
import authRoutes from './routes/authRoutes.js';
import messageRoutes from './routes/messageRoutes.js';
import mediaRoutes from './routes/mediaRoutes.js';
import groupRoutes from './routes/groupRoutes.js';  // 🆕 NEW: Group routes

import { setupSocketHandlers } from './socket/socketHandler.js';

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for now (we'll restrict in production)
    methods: ["GET", "POST"]
  }
});

// Setup Socket.io handlers
setupSocketHandlers(io);

// Middleware
app.use(cors());
app.use(express.json()); // Parse JSON request bodies

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/groups', groupRoutes);  // 🆕 NEW: Group chat routes

// Test route
app.get('/', (req, res) => {
  res.json({ message: 'Ghost API is running with Group Chat!' });
});

// Server port
const PORT = process.env.PORT || 3001;

export { io };

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Socket.IO enabled`);
  console.log(`✅ Group chat enabled`);
});