require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT || '8080', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'user',
    password: process.env.DB_PASS || 'password',
    database: process.env.DB_NAME || 'notifications',
  },
  rabbitmq: {
    host: process.env.MQ_HOST || 'localhost',
    port: parseInt(process.env.MQ_PORT || '5672', 10),
    user: process.env.MQ_USER || 'guest',
    password: process.env.MQ_PASS || 'guest',
    queues: {
      notificationEvents: 'notification_events',
      deadLetter: 'notification_dead_letter_queue',
    },
  },
};
