function validateNotificationEvent(req, res, next) {
  const { event_id, recipient, type } = req.body || {};

  const errors = [];

  if (!event_id || typeof event_id !== 'string' || event_id.trim() === '') {
    errors.push('Field "event_id" is required and must be a non-empty string');
  }

  if (!recipient || typeof recipient !== 'string' || recipient.trim() === '') {
    errors.push('Field "recipient" is required and must be a non-empty string');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      status: 'error',
      message: 'Validation failed',
      errors,
    });
  }

  next();
}

module.exports = {
  validateNotificationEvent,
};
