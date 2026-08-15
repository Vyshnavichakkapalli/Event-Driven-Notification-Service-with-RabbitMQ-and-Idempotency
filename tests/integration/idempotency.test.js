const { processMessage } = require('../../src/consumer/worker');

// Mock dependencies for controllable integration testing of idempotency flow
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

describe('Idempotency Integration Tests', () => {
  const dbMock = require('../../src/db');

  beforeEach(() => {
    dbMock.__store.processedEventsStore.clear();
    dbMock.__store.notificationLogsStore.length = 0;
  });

  it('should process a new event and log status SENT', async () => {
    const eventPayload = {
      event_id: 'unique-event-001',
      type: 'email',
      recipient: 'user@example.com',
      payload: { subject: 'Welcome' },
    };

    const mockChannel = {
      ack: jest.fn(),
      nack: jest.fn(),
    };

    const mockMsg = {
      content: Buffer.from(JSON.stringify(eventPayload)),
      properties: { headers: {} },
    };

    await processMessage(mockMsg, mockChannel);

    expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);

    // Verify processed_events store
    const processedEvent = dbMock.__store.processedEventsStore.get('unique-event-001');
    expect(processedEvent).toBeDefined();
    expect(processedEvent.status).toBe('COMPLETED');

    // Verify notification_logs store
    const logs = dbMock.__store.notificationLogsStore.filter(l => l.event_id === 'unique-event-001');
    expect(logs.length).toBe(1);
    expect(logs[0].status).toBe('SENT');
  });

  it('should skip duplicate event submission and maintain exactly ONE SENT log record', async () => {
    const eventPayload = {
      event_id: 'duplicate-event-002',
      type: 'email',
      recipient: 'user@example.com',
      payload: { subject: 'Welcome Duplicate Test' },
    };

    const mockChannel = {
      ack: jest.fn(),
      nack: jest.fn(),
    };

    const mockMsg = {
      content: Buffer.from(JSON.stringify(eventPayload)),
      properties: { headers: {} },
    };

    // First processing attempt
    await processMessage(mockMsg, mockChannel);
    expect(mockChannel.ack).toHaveBeenCalledTimes(1);

    // Duplicate processing attempt with exact same payload & event_id
    const mockChannel2 = {
      ack: jest.fn(),
      nack: jest.fn(),
    };
    await processMessage(mockMsg, mockChannel2);
    expect(mockChannel2.ack).toHaveBeenCalledTimes(1);

    // Assert only ONE record exists in notification_logs for this event_id
    const logs = dbMock.__store.notificationLogsStore.filter(l => l.event_id === 'duplicate-event-002');
    expect(logs.length).toBe(1);
    expect(logs[0].status).toBe('SENT');
  });
});
