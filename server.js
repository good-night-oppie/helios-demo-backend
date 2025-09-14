#!/usr/bin/env node

/**
 * Helios Demo Backend Server
 *
 * Professional API server integrating with latest Helios Parallel Universe Engine
 * Features: Real-time analytics, WebSocket streaming, performance metrics
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const winston = require('winston');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// Import Helios integration modules
const HeliosEngine = require('./lib/helios-engine');
const PerformanceAnalytics = require('./lib/performance-analytics');
const UniverseManager = require('./lib/universe-manager');

// Configuration
const PORT = process.env.PORT || 8080;
const NODE_ENV = process.env.NODE_ENV || 'production';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

if (NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with CORS
const io = socketIo(server, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", "ws:", "wss:"]
    }
  }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

app.use(limiter);

// CORS and body parsing
app.use(cors({
  origin: CORS_ORIGIN,
  credentials: true
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  const requestId = uuidv4();
  req.requestId = requestId;
  logger.info('Request received', {
    requestId,
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });
  next();
});

// Initialize Helios Engine
const heliosEngine = new HeliosEngine({
  maxUniverses: 10000,
  performanceTracking: true,
  realTimeMetrics: true
});

const performanceAnalytics = new PerformanceAnalytics();
const universeManager = new UniverseManager(heliosEngine);

// Global metrics
const metrics = {
  totalRequests: 0,
  activeConnections: 0,
  universesCreated: 0,
  totalOperations: 0,
  averageResponseTime: 0,
  systemHealth: 'optimal'
};

// Health check endpoint
app.get('/health', (req, res) => {
  const healthCheck = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: require('./package.json').version,
    heliosStatus: heliosEngine.getStatus(),
    requestId: req.requestId
  };

  res.status(200).json(healthCheck);
});

// API Routes

// Get system metrics and statistics
app.get('/api/metrics', async (req, res) => {
  try {
    const startTime = process.hrtime();

    const systemMetrics = {
      ...metrics,
      helios: await heliosEngine.getMetrics(),
      performance: await performanceAnalytics.getLatestMetrics(),
      universes: await universeManager.getStatistics(),
      system: {
        memory: process.memoryUsage(),
        uptime: process.uptime(),
        cpu: process.cpuUsage(),
        platform: process.platform,
        nodeVersion: process.version
      },
      timestamp: new Date().toISOString()
    };

    const [seconds, nanoseconds] = process.hrtime(startTime);
    const responseTime = seconds * 1000 + nanoseconds / 1000000;

    // Update average response time
    metrics.averageResponseTime = (metrics.averageResponseTime + responseTime) / 2;
    metrics.totalRequests++;

    res.json({
      success: true,
      data: systemMetrics,
      responseTime: `${responseTime.toFixed(2)}ms`,
      requestId: req.requestId
    });

  } catch (error) {
    logger.error('Error getting metrics', { error: error.message, requestId: req.requestId });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve metrics',
      requestId: req.requestId
    });
  }
});

// Create parallel universes with performance tracking
app.post('/api/universes/create', async (req, res) => {
  try {
    const { count = 1, config = {} } = req.body;
    const startTime = process.hrtime();

    if (count > 1000) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 1000 universes per request',
        requestId: req.requestId
      });
    }

    const universes = await universeManager.createUniverses(count, config);

    const [seconds, nanoseconds] = process.hrtime(startTime);
    const executionTime = seconds * 1000 + nanoseconds / 1000000;

    metrics.universesCreated += count;
    metrics.totalOperations++;

    // Emit real-time update to connected clients
    io.emit('universes:created', {
      count,
      executionTime,
      universes: universes.map(u => u.getMetadata()),
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      data: {
        universes: universes.map(u => u.serialize()),
        performance: {
          executionTime: `${executionTime.toFixed(2)}ms`,
          averagePerUniverse: `${(executionTime / count).toFixed(2)}ms`,
          throughput: `${(count / executionTime * 1000).toFixed(0)} universes/second`
        }
      },
      requestId: req.requestId
    });

  } catch (error) {
    logger.error('Error creating universes', { error: error.message, requestId: req.requestId });
    res.status(500).json({
      success: false,
      error: 'Failed to create universes',
      requestId: req.requestId
    });
  }
});

// Get specific universe data
app.get('/api/universes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const universe = await universeManager.getUniverse(id);

    if (!universe) {
      return res.status(404).json({
        success: false,
        error: 'Universe not found',
        requestId: req.requestId
      });
    }

    res.json({
      success: true,
      data: universe.serialize(),
      requestId: req.requestId
    });

  } catch (error) {
    logger.error('Error getting universe', { error: error.message, requestId: req.requestId });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve universe',
      requestId: req.requestId
    });
  }
});

// Perform universe operations (snapshots, branches, etc.)
app.post('/api/universes/:id/operations', async (req, res) => {
  try {
    const { id } = req.params;
    const { operation, params = {} } = req.body;
    const startTime = process.hrtime();

    const result = await universeManager.performOperation(id, operation, params);

    const [seconds, nanoseconds] = process.hrtime(startTime);
    const executionTime = seconds * 1000 + nanoseconds / 1000000;

    metrics.totalOperations++;

    // Emit real-time update
    io.emit('universe:operation', {
      universeId: id,
      operation,
      result: result.metadata,
      executionTime,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      data: result,
      performance: {
        executionTime: `${executionTime.toFixed(2)}ms`
      },
      requestId: req.requestId
    });

  } catch (error) {
    logger.error('Error performing operation', { error: error.message, requestId: req.requestId });
    res.status(500).json({
      success: false,
      error: 'Operation failed',
      requestId: req.requestId
    });
  }
});

// Performance benchmarks endpoint
app.get('/api/benchmarks', async (req, res) => {
  try {
    const benchmarks = await performanceAnalytics.runBenchmarks();

    res.json({
      success: true,
      data: benchmarks,
      requestId: req.requestId
    });

  } catch (error) {
    logger.error('Error running benchmarks', { error: error.message, requestId: req.requestId });
    res.status(500).json({
      success: false,
      error: 'Benchmark failed',
      requestId: req.requestId
    });
  }
});

// WebSocket connection handling
io.on('connection', (socket) => {
  metrics.activeConnections++;
  logger.info('Client connected', { socketId: socket.id });

  socket.emit('welcome', {
    message: 'Connected to Helios Demo Backend',
    serverVersion: require('./package.json').version,
    capabilities: [
      'real-time-metrics',
      'universe-creation',
      'performance-analytics',
      'live-operations'
    ]
  });

  // Send initial metrics
  socket.emit('metrics:update', metrics);

  // Handle client requests
  socket.on('metrics:subscribe', () => {
    socket.join('metrics-subscribers');
  });

  socket.on('universes:subscribe', () => {
    socket.join('universe-subscribers');
  });

  socket.on('disconnect', () => {
    metrics.activeConnections--;
    logger.info('Client disconnected', { socketId: socket.id });
  });
});

// Real-time metrics broadcasting
setInterval(() => {
  io.to('metrics-subscribers').emit('metrics:update', {
    ...metrics,
    timestamp: new Date().toISOString()
  });
}, 1000);

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    requestId: req.requestId
  });

  res.status(500).json({
    success: false,
    error: NODE_ENV === 'production' ? 'Internal server error' : err.message,
    requestId: req.requestId
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /health',
      'GET /api/metrics',
      'POST /api/universes/create',
      'GET /api/universes/:id',
      'POST /api/universes/:id/operations',
      'GET /api/benchmarks'
    ],
    requestId: req.requestId
  });
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}, shutting down gracefully`);

  server.close(() => {
    logger.info('HTTP server closed');
    heliosEngine.shutdown();
    process.exit(0);
  });

  // Force close server after 10 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
server.listen(PORT, () => {
  logger.info('Helios Demo Backend started', {
    port: PORT,
    environment: NODE_ENV,
    version: require('./package.json').version,
    heliosVersion: heliosEngine.getVersion()
  });

  console.log(`🚀 Helios Demo Backend running on port ${PORT}`);
  console.log(`🌐 Environment: ${NODE_ENV}`);
  console.log(`📊 WebSocket enabled for real-time updates`);
  console.log(`🔧 Helios Engine integrated and ready`);
});

module.exports = { app, server, io };