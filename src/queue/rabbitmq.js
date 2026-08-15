const amqp = require('amqplib');
const config = require('../config');

let connection = null;
let channel = null;

async function connectWithRetry(retries = 10, delayMs = 3000) {
  const amqpUrl = `amqp://${config.rabbitmq.user}:${config.rabbitmq.password}@${config.rabbitmq.host}:${config.rabbitmq.port}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Connecting to RabbitMQ (attempt ${attempt}/${retries})...`);
      connection = await amqp.connect(amqpUrl);
      channel = await connection.createChannel();

      // Assert main and DLQ queues
      await channel.assertQueue(config.rabbitmq.queues.notificationEvents, { durable: true });
      await channel.assertQueue(config.rabbitmq.queues.deadLetter, { durable: true });

      // Set prefetch to 1 for fair dispatch across consumers
      await channel.prefetch(1);

      console.log('Successfully connected to RabbitMQ and asserted queues.');

      connection.on('error', (err) => {
        console.error('RabbitMQ connection error:', err);
      });

      connection.on('close', () => {
        console.warn('RabbitMQ connection closed.');
      });

      return { connection, channel };
    } catch (err) {
      console.warn(`Failed to connect to RabbitMQ: ${err.message}`);
      if (attempt === retries) {
        throw new Error(`Unable to connect to RabbitMQ after ${retries} attempts: ${err.message}`);
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function getChannel() {
  if (!channel) {
    await connectWithRetry();
  }
  return channel;
}

async function publishEvent(eventPayload, headers = {}) {
  const ch = await getChannel();
  const queue = config.rabbitmq.queues.notificationEvents;
  const messageBuffer = Buffer.from(JSON.stringify(eventPayload));
  return ch.sendToQueue(queue, messageBuffer, {
    persistent: true,
    headers,
  });
}

async function publishToDLQ(eventPayload, headers = {}) {
  const ch = await getChannel();
  const queue = config.rabbitmq.queues.deadLetter;
  const messageBuffer = Buffer.from(JSON.stringify(eventPayload));
  return ch.sendToQueue(queue, messageBuffer, {
    persistent: true,
    headers,
  });
}

async function subscribeConsumer(consumerHandler) {
  const ch = await getChannel();
  const queue = config.rabbitmq.queues.notificationEvents;

  const { consumerTag } = await ch.consume(queue, async (msg) => {
    if (msg) {
      await consumerHandler(msg, ch);
    }
  });

  return consumerTag;
}

async function closeConnection() {
  try {
    if (channel) {
      await channel.close();
      channel = null;
    }
    if (connection) {
      await connection.close();
      connection = null;
    }
    console.log('RabbitMQ connection and channel closed cleanly.');
  } catch (err) {
    console.error('Error closing RabbitMQ connection:', err.message);
  }
}

module.exports = {
  connectWithRetry,
  getChannel,
  publishEvent,
  publishToDLQ,
  subscribeConsumer,
  closeConnection,
};
