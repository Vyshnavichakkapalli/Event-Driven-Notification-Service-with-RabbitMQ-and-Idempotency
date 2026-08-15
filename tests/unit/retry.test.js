const { calculateBackoffDelay } = require('../../src/services/retryService');

describe('Retry Backoff Math Unit Tests', () => {
  it('should calculate 1000ms for attempt 1', () => {
    expect(calculateBackoffDelay(1)).toBe(1000);
  });

  it('should calculate 5000ms for attempt 2', () => {
    expect(calculateBackoffDelay(2)).toBe(5000);
  });

  it('should calculate 25000ms for attempt 3', () => {
    expect(calculateBackoffDelay(3)).toBe(25000);
  });
});
