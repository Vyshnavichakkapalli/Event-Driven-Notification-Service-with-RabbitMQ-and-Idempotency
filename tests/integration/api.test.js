const request = require('supertest');
const app = require('../../src/app');

jest.mock('../../src/queue/rabbitmq', () => ({
  connectWithRetry: jest.fn().mockResolvedValue(),
  publishEvent: jest.fn().mockResolvedValue(true),
  publishToDLQ: jest.fn().mockResolvedValue(true),
  subscribeConsumer: jest.fn().mockResolvedValue('consumer-tag-mock'),
  closeConnection: jest.fn().mockResolvedValue(),
}));

describe('API Routes Integration Tests', () => {
  it('GET /health should return 200 UP', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toEqual(200);
    expect(res.body.status).toEqual('UP');
  });

  it('POST /api/v1/publish-notification-event should return 202 Accepted for valid payload', async () => {
    const payload = {
      event_id: 'b0b4a496-d245-4299-8d83-4a1801267592',
      type: 'email',
      recipient: 'user@example.com',
      payload: { subject: 'Welcome!' },
    };

    const res = await request(app)
      .post('/api/v1/publish-notification-event')
      .send(payload);

    expect(res.statusCode).toEqual(202);
    expect(res.body.status).toEqual('accepted');
    expect(res.body.event_id).toEqual(payload.event_id);
  });

  it('POST /api/v1/publish-notification-event should return 400 Bad Request if missing recipient', async () => {
    const payload = {
      event_id: 'b0b4a496-d245-4299-8d83-4a1801267592',
      type: 'email',
    };

    const res = await request(app)
      .post('/api/v1/publish-notification-event')
      .send(payload);

    expect(res.statusCode).toEqual(400);
    expect(res.body.status).toEqual('error');
  });
});
