class TransientFailureError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TransientFailureError';
  }
}

/**
 * Simulates external notification dispatch (email, SMS, push).
 * Supports simulated failures for testing.
 */
async function dispatchNotification(event) {
  // Simulate network latency (50ms)
  await new Promise((resolve) => setTimeout(resolve, 50));

  const payload = event.payload || {};
  const recipient = event.recipient || '';

  // Check for failure triggers
  const shouldFail =
    payload.simulate_failure === true ||
    event.simulate_failure === true ||
    recipient === 'fail@example.com' ||
    recipient.endsWith('@fail.com');

  if (shouldFail) {
    throw new TransientFailureError(
      `Failed to dispatch notification to ${recipient}: External service unavailable.`
    );
  }

  return {
    success: true,
    messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    dispatchedAt: new Date().toISOString(),
  };
}

module.exports = {
  dispatchNotification,
  TransientFailureError,
};
