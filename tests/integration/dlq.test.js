const { processMessage } = require('../../src/consumer/worker');
const config = require('../../src/config');
const dispatcher = require('../../src/services/dispatcherService');

jest.mock('../../src/queue/rabbitmq', () => ({
  publishEvent: jest.fn().mockResolvedValue(true),
  publishToDLQ: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../src/db', () => {
  const processedEventsStore = new Map();
  const notificationLogsStore = [];

  return {
    getClient: jest.fn().mockImplementation(async () => ({
      query: jest.fn().mockImplementation(async (sql, params) => {
        const sqlUpper = sql.toUpperCase();
        if (sqlUpper.includes('BEGIN') || sqlUpper.includes('COMMIT') || sqlUpper.includes('ROLLBACK')) {
          return { rows: [] };
        }
        if (sqlUpper.includes('SELECT EVENT_ID, STATUS FROM PROCESSED_EVENTS')) {
          const eventId = params[0];
          const existing = processedEventsStore.get(eventId);
          if (existing) {
            return { rows: [{ event_id: eventId, status: existing.status }] };
          }
          return { rows: [] };
        }
        if (sqlUpper.includes('INSERT INTO PROCESSED_EVENTS')) {
          const eventId = params[0];
          const status = params[1];
          processedEventsStore.set(eventId, { status });
          return { rows: [] };
        }
        if (sqlUpper.includes('INSERT INTO NOTIFICATION_LOGS')) {
          const [eventId, recipient, type, payloadStr, status] = params;
          notificationLogsStore.push({
            log_id: notificationLogsStore.length + 1,
            event_id: eventId,
            recipient,
            type,
            message_payload: payloadStr,
            status,
          });
          return { rows: [] };
        }
        return { rows: [] };
      }),
      release: jest.fn(),
    })),
    query: jest.fn().mockImplementation(async (sql, params) => {
      if (sql.includes('processed_events')) {
        const eventId = params[0];
        const record = processedEventsStore.get(eventId);
        return { rows: record ? [record] : [] };
      }
      if (sql.includes('notification_logs')) {
        const eventId = params[0];
        const logs = notificationLogsStore.filter((l) => l.event_id === eventId);
        return { rows: logs };
      }
      return { rows: [] };
    }),
    __store: { processedEventsStore, notificationLogsStore },
  };
});

describe('DLQ Routing & Max Retries Integration Tests', () => {
  const rabbitmq = require('../../src/queue/rabbitmq');
  const dbMock = require('../../src/db');

  beforeEach(() => {
    jest.clearAllMocks();
    dbMock.__store.processedEventsStore.clear();
    dbMock.__store.notificationLogsStore.length = 0;
    // Mock dispatchNotification to throw instantly without latency delay
    jest.spyOn(dispatcher, 'dispatchNotification').mockImplementation(async () => {
      throw new dispatcher.TransientFailureError('Simulated external service failure');
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should retry failing event until MAX_RETRIES (3) and route to Dead-Letter Queue (DLQ)', async () => {
    const eventPayload = {
      event_id: 'failing-event-dlq-999',
      type: 'email',
      recipient: 'fail@example.com',
      payload: { simulate_failure: true },
    };

    const maxRetries = config.maxRetries; // Default: 3

    // Initial Attempt (retry count: 0) -> Fails, schedules retry 1
    const mockChannel0 = { ack: jest.fn() };
    const mockMsg0 = {
      content: Buffer.from(JSON.stringify(eventPayload)),
      properties: { headers: { 'x-retry-count': '0' } },
    };
    await processMessage(mockMsg0, mockChannel0);
    expect(mockChannel0.ack).toHaveBeenCalledWith(mockMsg0);

    // Retry Attempt 1 (retry count: 1) -> Fails, schedules retry 2
    const mockChannel1 = { ack: jest.fn() };
    const mockMsg1 = {
      content: Buffer.from(JSON.stringify(eventPayload)),
      properties: { headers: { 'x-retry-count': '1' } },
    };
    await processMessage(mockMsg1, mockChannel1);
    expect(mockChannel1.ack).toHaveBeenCalledWith(mockMsg1);

    // Retry Attempt 2 (retry count: 2) -> Fails, schedules retry 3
    const mockChannel2 = { ack: jest.fn() };
    const mockMsg2 = {
      content: Buffer.from(JSON.stringify(eventPayload)),
      properties: { headers: { 'x-retry-count': '2' } },
    };
    await processMessage(mockMsg2, mockChannel2);
    expect(mockChannel2.ack).toHaveBeenCalledWith(mockMsg2);

    // Final Attempt (retry count: 3 = MAX_RETRIES) -> Exhausted! Moves to DLQ
    const mockChannel3 = { ack: jest.fn() };
    const mockMsg3 = {
      content: Buffer.from(JSON.stringify(eventPayload)),
      properties: { headers: { 'x-retry-count': '3' } },
    };
    await processMessage(mockMsg3, mockChannel3);
    expect(mockChannel3.ack).toHaveBeenCalledWith(mockMsg3);

    // Verify DLQ publishing was triggered
    expect(rabbitmq.publishToDLQ).toHaveBeenCalledWith(
      eventPayload,
      expect.objectContaining({
        'x-retry-count': 3,
      })
    );

    // Verify DB processed_events status is updated to FAILED
    const processedEvent = dbMock.__store.processedEventsStore.get('failing-event-dlq-999');
    expect(processedEvent).toBeDefined();
    expect(processedEvent.status).toBe('FAILED');

    // Verify notification_logs entry status is DLQ_MOVED
    const logs = dbMock.__store.notificationLogsStore.filter(l => l.event_id === 'failing-event-dlq-999');
    expect(logs.length).toBe(1);
    expect(logs[0].status).toBe('DLQ_MOVED');
  });
});
