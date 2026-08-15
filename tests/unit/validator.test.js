const { validateNotificationEvent } = require('../../src/api/validator');

describe('Payload Validation Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = { body: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  it('should call next() for a valid payload', () => {
    req.body = {
      event_id: 'b0b4a496-d245-4299-8d83-4a1801267592',
      type: 'email',
      recipient: 'user@example.com',
      payload: { subject: 'Test' },
    };

    validateNotificationEvent(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should return 400 Bad Request if event_id is missing', () => {
    req.body = {
      type: 'email',
      recipient: 'user@example.com',
    };

    validateNotificationEvent(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        message: 'Validation failed',
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 400 Bad Request if recipient is missing', () => {
    req.body = {
      event_id: 'b0b4a496-d245-4299-8d83-4a1801267592',
      type: 'email',
    };

    validateNotificationEvent(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        message: 'Validation failed',
      })
    );
    expect(next).not.toHaveBeenCalled();
  });
});
