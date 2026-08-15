-- Database Schema for Event-Driven Notification Service

-- Tracks the current processing state of an event to prevent duplicates (Idempotency)
CREATE TABLE IF NOT EXISTS processed_events (
    event_id VARCHAR(255) PRIMARY KEY,
    status VARCHAR(50) NOT NULL, -- 'PROCESSING', 'COMPLETED', 'FAILED'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Maintains an audit trail of all attempted or successful notifications
CREATE TABLE IF NOT EXISTS notification_logs (
    log_id SERIAL PRIMARY KEY,
    event_id VARCHAR(255) NOT NULL,
    recipient VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    message_payload JSONB,
    status VARCHAR(50) NOT NULL, -- 'SENT', 'FAILED_EXTERNAL', 'DLQ_MOVED'
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_event_id FOREIGN KEY (event_id) REFERENCES processed_events(event_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_processed_events_status ON processed_events(status);
CREATE INDEX IF NOT EXISTS idx_notification_logs_event_id ON notification_logs(event_id);
