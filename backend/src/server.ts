// @ts-nocheck
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';

// Import middleware
import { authenticateToken } from './middleware/auth';

// Import routers
import agentsRouter from './routes/agents';
import wafeqRouter from './routes/integrations/wafeq';
import quickBooksRouter from './routes/integrations/quickbooks';

// Import WebSocket broadcaster
import { initializeWebSocket, broadcastSystemStatus } from './websocket/agentStatusBroadcaster';

// Import services
import { db } from './db';
import { redis } from './cache/redis';
import syncScheduler from './services/sync-scheduler';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Middleware setup
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// Health check endpoint (no auth required)
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    uptime: process.uptime()
  });
});

// Apply authentication to all API routes
app.use('/api', authenticateToken);

// API Routes
app.use('/api/agents', agentsRouter);
app.use('/api/integrations/wafeq', wafeqRouter);
app.use('/api/integrations/quickbooks', quickBooksRouter);

// Root API endpoint
app.get('/api', (req: Request, res: Response) => {
  res.json({
    message: 'Ledgr Multi-Agent Platform API',
    version: '1.0.0',
    endpoints: {
      agents: '/api/agents',
      integrations: {
        wafeq: '/api/integrations/wafeq',
        quickbooks: '/api/integrations/quickbooks'
      },
      health: '/health',
      websocket: 'ws://localhost:3000/ws/agents'
    }
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
    method: req.method
  });
});

// Error handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(`[ERROR] ${new Date().toISOString()}:`, err);

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Invalid token' });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Token expired' });
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }

  // Database errors
  if (err.code === 'ECONNREFUSED') {
    return res.status(503).json({ error: 'Database connection failed' });
  }

  // Generic server error
  res.status(500).json({
    error: 'Internal server error',
    message: NODE_ENV === 'development' ? err.message : 'An error occurred'
  });
});

// Create HTTP server
const server = createServer(app);

// Initialize WebSocket server
initializeWebSocket(server);

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('\n[SIGTERM] Shutting down gracefully...');
  syncScheduler.stop();
  console.log('Sync scheduler stopped');
  server.close(async () => {
    console.log('HTTP server closed');
    await redis.close();
    console.log('Redis connection closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('\n[SIGINT] Shutting down gracefully...');
  syncScheduler.stop();
  console.log('Sync scheduler stopped');
  server.close(async () => {
    console.log('HTTP server closed');
    await redis.close();
    console.log('Redis connection closed');
    process.exit(0);
  });
});

// Start server
server.listen(PORT, '0.0.0.0', async () => {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║   Ledgr Multi-Agent Platform Backend                 ║
║   Environment: ${NODE_ENV.padEnd(34)} ║
║   Port: ${String(PORT).padEnd(47)} ║
║   WebSocket: ws://localhost:${String(PORT).padEnd(36)} ║
║   Health: http://localhost:${String(PORT)}/health${' '.padEnd(19)} ║
╚═══════════════════════════════════════════════════════╝
  `);

  // Start sync scheduler for periodic integrations sync
  try {
    await syncScheduler.start();
    console.log('[Sync Scheduler] Started successfully');
  } catch (error) {
    console.error('[Sync Scheduler] Failed to start:', error);
  }

  // Broadcast system startup to all connected clients
  broadcastSystemStatus('startup', {
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    port: PORT
  });
});

// Unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[UNCAUGHT EXCEPTION]', error);
  process.exit(1);
});

export default app;
