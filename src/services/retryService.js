const config = require('../config');
const { publishEvent, publishToDLQ } = require('../queue/rabbitmq');
const { updateEventStatusAndLog } = require('./idempotencyService');

/**
 * Calculates exponential backoff delay in milliseconds for a given retry attempt (1-indexed).
 * 1 -> 1000ms (1s)
 * 2 -> 5000ms (5s)
 * 3 -> 25000ms (25s)
 */
function calculateBackoffDelay(retryCount) {
  const delays = [1000, 5000, 25000];
  if (retryCount <= delays.length) {
    return delays[retryCount - 1];
  }
  return Math.min(1000 * Math.pow(5, retryCount - 1), 300000);
}

/**
 * Handles processing failures by scheduling a retry with backoff,
 * or moving the message to the Dead-Letter Queue (DLQ) if max retries are exhausted.
 */
async function handleFailure(event, currentRetryCount, error, msgChannel, originalMsg) {
  const maxRetries = config.maxRetries; // Default: 3

  if (currentRetryCount < maxRetries) {
    const nextRetryCount = currentRetryCount + 1;
    const delayMs = calculateBackoffDelay(nextRetryCount);
    console.warn(
      `[Retry] Event ${event.event_id} failed attempt ${nextRetryCount}/${maxRetries}. Delaying retry by ${delayMs}ms. Error: ${error.message}`
    );

    // Schedule re-publishing back to main queue after delay
    setTimeout(async () => {
      try {
        await publishEvent(event, {
          'x-retry-count': nextRetryCount,
          'x-first-failed-at': new Date().toISOString(),
        });
        console.log(`[Retry] Successfully re-queued event ${event.event_id} for retry attempt ${nextRetryCount}`);
      } catch (err) {
        console.error(`[Retry] Failed to re-queue event ${event.event_id}:`, err.message);
      }
    }, delayMs);

    // ACK original message so it doesn't block the queue during backoff delay
    msgChannel.ack(originalMsg);
    return { status: 'RETRIED', nextRetryCount, delayMs };
  } else {
    // Max retries exhausted -> Move to DLQ
    console.error(
      `[DLQ] Event ${event.event_id} exhausted all ${maxRetries} retries. Routing to Dead-Letter Queue.`
    );

    // 1. Update processed_events to FAILED and log DLQ_MOVED
    await updateEventStatusAndLog(event, 'FAILED', 'DLQ_MOVED');

    // 2. Publish message payload to DLQ
    await publishToDLQ(event, {
      'x-retry-count': currentRetryCount,
      'x-dlq-reason': error.message,
      'x-moved-at': new Date().toISOString(),
    });

    // 3. ACK original message from main queue
    msgChannel.ack(originalMsg);
    return { status: 'DLQ_MOVED', retriesExhausted: true };
  }
}

module.exports = {
  calculateBackoffDelay,
  handleFailure,
};
