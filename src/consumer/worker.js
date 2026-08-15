const { checkOrInsertEvent, updateEventStatusAndLog } = require('../services/idempotencyService');
const { dispatchNotification } = require('../services/dispatcherService');
const { handleFailure } = require('../services/retryService');
const { subscribeConsumer } = require('../queue/rabbitmq');

async function processMessage(msg, channel) {
  let event = null;
  try {
    const contentStr = msg.content.toString();
    event = JSON.parse(contentStr);
  } catch (parseErr) {
    console.error('Failed to parse incoming message JSON:', parseErr.message);
    // Malformed JSON is permanent failure -> ACK to prevent blocking
    channel.ack(msg);
    return;
  }

  const headers = msg.properties.headers || {};
  const currentRetryCount = parseInt(headers['x-retry-count'] || '0', 10);

  console.log(`[Consumer] Processing event ${event.event_id} (Attempt ${currentRetryCount + 1})`);

  try {
    // 1. Idempotency Check
    const { status, isDuplicate } = await checkOrInsertEvent(event.event_id);

    if (isDuplicate || status === 'COMPLETED') {
      console.log(`[Consumer] Event ${event.event_id} is already COMPLETED. Skipping duplicate.`);
      channel.ack(msg);
      return;
    }

    // 2. Mock External Dispatch
    await dispatchNotification(event);

    // 3. Dispatch Success -> Update DB to COMPLETED and audit log SENT
    await updateEventStatusAndLog(event, 'COMPLETED', 'SENT');
    console.log(`[Consumer] Event ${event.event_id} processed successfully. Status: SENT`);

    // 4. Acknowledge message on queue
    channel.ack(msg);
  } catch (err) {
    console.error(`[Consumer] Error processing event ${event.event_id || 'unknown'}:`, err.message);

    if (!event || !event.event_id) {
      channel.ack(msg);
      return;
    }

    // 5. Handle Retry / Dead-Letter Queue routing
    await handleFailure(event, currentRetryCount, err, channel, msg);
  }
}

async function startConsumerWorker() {
  console.log('Subscribing consumer worker to RabbitMQ queue...');
  const consumerTag = await subscribeConsumer(processMessage);
  console.log(`Consumer worker active with consumer tag: ${consumerTag}`);
  return consumerTag;
}

module.exports = {
  processMessage,
  startConsumerWorker,
};
