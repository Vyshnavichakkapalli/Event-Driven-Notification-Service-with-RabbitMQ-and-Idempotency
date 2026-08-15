const db = require('../db');

/**
 * Checks or inserts an event in processed_events.
 * Returns { status: 'COMPLETED' | 'PROCESSING' | 'NEW', isDuplicate: boolean }
 */
async function checkOrInsertEvent(eventId) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Query current status for this event_id
    const selectRes = await client.query(
      'SELECT event_id, status FROM processed_events WHERE event_id = $1 FOR UPDATE',
      [eventId]
    );

    if (selectRes.rows.length > 0) {
      const currentStatus = selectRes.rows[0].status;
      await client.query('COMMIT');
      return {
        status: currentStatus,
        isDuplicate: currentStatus === 'COMPLETED',
      };
    }

    // Insert new event with status PROCESSING
    await client.query(
      'INSERT INTO processed_events (event_id, status) VALUES ($1, $2)',
      [eventId, 'PROCESSING']
    );

    await client.query('COMMIT');
    return {
      status: 'PROCESSING',
      isDuplicate: false,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Updates processed_events status and inserts an audit log into notification_logs atomically.
 */
async function updateEventStatusAndLog(event, eventStatus, logStatus) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Update status in processed_events
    await client.query(
      `INSERT INTO processed_events (event_id, status, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (event_id)
       DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()`,
      [event.event_id, eventStatus]
    );

    // Insert audit log
    await client.query(
      `INSERT INTO notification_logs (event_id, recipient, type, message_payload, status)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        event.event_id,
        event.recipient,
        event.type || 'email',
        JSON.stringify(event.payload || {}),
        logStatus,
      ]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getProcessedEvent(eventId) {
  const res = await db.query(
    'SELECT event_id, status, created_at, updated_at FROM processed_events WHERE event_id = $1',
    [eventId]
  );
  return res.rows[0] || null;
}

async function getNotificationLogs(eventId) {
  const res = await db.query(
    'SELECT * FROM notification_logs WHERE event_id = $1 ORDER BY log_id ASC',
    [eventId]
  );
  return res.rows;
}

module.exports = {
  checkOrInsertEvent,
  updateEventStatusAndLog,
  getProcessedEvent,
  getNotificationLogs,
};
