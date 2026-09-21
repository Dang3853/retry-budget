/**
 * A shared retry budget.
 *
 * The purpose of a retry budget is to cap the total amount of retry activity
 * that a service can perform in a fixed window. This prevents a failing
 * downstream dependency from amplifying load: if many callers each retry
 * independently, a small outage can turn into a thundering herd.
 *
 * The budget is deliberately simple. It tracks a window start time and a
 * counter of retries used in that window. When the window expires, the counter
 * resets. This means the limit is a hard ceiling over the window length, not a
 * sliding rate limiter. That trade-off is intentional: a sliding window would
 * be smoother but would require storing individual timestamps, which is more
 * state and more CPU under contention.
 *
 * Time is injected as a clock function so tests are deterministic.
 */
export class RetryBudget {
  /**
   * @param {Object} options
   * @param {number} options.limit - Maximum retries allowed per window.
   * @param {number} options.windowMs - Window length in milliseconds.
   * @param {() => number} [options.clock] - Function returning current time in
   *   milliseconds. Defaults to Date.now.
   */
  constructor({ limit, windowMs, clock = Date.now }) {
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new RangeError('limit must be a positive integer');
    }
    if (!Number.isInteger(windowMs) || windowMs <= 0) {
      throw new RangeError('windowMs must be a positive integer');
    }
    if (typeof clock !== 'function') {
      throw new TypeError('clock must be a function');
    }

    this.limit = limit;
    this.windowMs = windowMs;
    this.clock = clock;
    this.used = 0;
    this.windowStart = clock();
  }

  /**
   * Attempt to reserve one retry from the budget.
   *
   * If the current window has expired, a new window is started and the used
   * count is reset before attempting the reservation. This means that a
   * reservation after a long quiet period always succeeds if the limit is
   * greater than zero.
   *
   * @returns {boolean} true if the retry was reserved, false if the budget is
   *   exhausted for the current window.
   */
  tryReserve() {
    const now = this.clock();
    if (now - this.windowStart >= this.windowMs) {
      this.windowStart = now;
      this.used = 0;
    }

    if (this.used >= this.limit) {
      return false;
    }

    this.used += 1;
    return true;
  }

  /**
   * Return the number of retries remaining in the current window.
   *
   * The window is first advanced if necessary, so the result always reflects
   * the current state at the time of the call.
   *
   * @returns {number} remaining retries, from 0 up to limit.
   */
  remaining() {
    const now = this.clock();
    if (now - this.windowStart >= this.windowMs) {
      this.windowStart = now;
      this.used = 0;
    }
    return this.limit - this.used;
  }
}
