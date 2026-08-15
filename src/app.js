const express = require('express');
const config = require('./config');
const apiRoutes = require('./api/routes');
const { connectWithRetry, closeConnection } = require('./queue/rabbitmq');
const { startConsumerWorker } = require('./consumer/worker');
const { closePool } = require('./db');

const app = express();

app.use(express.json());

// API Routes
app.use('/api/v1', apiRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', timestamp: new Date().toISOString() });
});

// Centralized error handler
app.use((err, req, res, next) => {
  console.error('Unhandled API Error:', err);
  res.status(500).json({
    status: 'error',
    message: err.message || 'Internal Server Error',
  });
});

let server = null;
let isShuttingDown = false;

async function bootstrap() {
  try {
    console.log('Initializing Notification Service...');

    // Initialize RabbitMQ connection and start consumer worker
    await connectWithRetry();
    await startConsumerWorker();

    server = app.listen(config.port, () => {
      console.log(`Notification Service running on port ${config.port} (${config.nodeEnv})`);
    });
  } catch (err) {
    console.error('Failed to start application:', err);
    process.exit(1);
  }
}

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\nReceived ${signal}. Initiating graceful shutdown...`);

  // Stop accepting new HTTP requests
  if (server) {
    server.close(() => {
      console.log('HTTP server closed.');
    });
  }

  try {
    // Close RabbitMQ connection and consumer
    await closeConnection();

    // Close Database Pool
    await closePool();

    console.log('Graceful shutdown completed successfully. Exiting.');
    process.exit(0);
  } catch (err) {
    console.error('Error during graceful shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

if (require.main === module) {
  bootstrap();
}

module.exports = app;
