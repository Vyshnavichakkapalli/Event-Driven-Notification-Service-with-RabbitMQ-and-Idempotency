const { dispatchNotification, TransientFailureError } = require('../../src/api/../services/dispatcherService');

describe('Dispatcher Service Unit Tests', () => {
  it('should dispatch successfully for standard valid payload', async () => {
    const event = {
      event_id: 'evt-123',
      recipient: 'valid@example.com',
      type: 'email',
      payload: { subject: 'Hello' },
    };

    const result = await dispatchNotification(event);
    expect(result.success).toBe(true);
    expect(result.dispatchedAt).toBeDefined();
  });

  it('should throw TransientFailureError when simulate_failure is true in payload', async () => {
    const event = {
      event_id: 'evt-fail',
      recipient: 'valid@example.com',
      payload: { simulate_failure: true },
    };

    await expect(dispatchNotification(event)).rejects.toThrow(TransientFailureError);
  });

  it('should throw TransientFailureError when recipient is fail@example.com', async () => {
    const event = {
      event_id: 'evt-fail-2',
      recipient: 'fail@example.com',
      payload: {},
    };

    await expect(dispatchNotification(event)).rejects.toThrow(TransientFailureError);
  });
});
