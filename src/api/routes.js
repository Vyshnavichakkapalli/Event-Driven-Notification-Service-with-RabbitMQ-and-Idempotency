const express = require('express');
const { validateNotificationEvent } = require('./validator');
const { publishEvent } = require('../queue/rabbitmq');

const router = express.Router();

router.post('/publish-notification-event', validateNotificationEvent, async (req, res, next) => {
  try {
    const eventPayload = {
      event_id: req.body.event_id,
      type: req.body.type || 'email',
      recipient: req.body.recipient,
      payload: req.body.payload || {},
      timestamp: req.body.timestamp || new Date().toISOString(),
      simulate_failure: req.body.simulate_failure || false,
    };

    await publishEvent(eventPayload);

    return res.status(202).json({
      status: 'accepted',
      message: 'Notification event accepted for processing',
      event_id: eventPayload.event_id,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
