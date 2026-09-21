# Retry Budget

A shared retry budget so a failing dependency cannot amplify load.

```js
import { RetryBudget } from 'retry-budget';

const budget = new RetryBudget({ limit: 5, windowMs: 60_000 });

async function callWithRetry(fn) {
  try {
    return await fn();
  } catch (err) {
    if (budget.tryReserve()) {
      return callWithRetry(fn);
    }
    throw err;
  }
}
```

The package exports exactly one class: `RetryBudget`.

## Why this exists

When many clients share a downstream service, a brief outage can trigger a flood of retries. Each caller retrying independently multiplies the original request rate, often making the outage worse. A retry budget caps the total number of retries that a process will perform during a fixed time window, so a failure cannot become a self-inflicted load spike.

The implementation uses a fixed window rather than a sliding one. That means the allowed retry count resets completely when the window ends, even if all retries were used in the final millisecond of the previous window. This is a deliberate trade-off: it keeps the state tiny (one timestamp and one counter) and the check O(1), at the cost of allowing a brief burst at window boundaries.

## Awkward edge

The window is advanced lazily on the next `tryReserve()` or `remaining()` call. If a budget sits unused for several window lengths, the first call after that gap starts a fresh window. Also, if the clock moves backwards, the budget treats it as still being inside the original window, so a backwards clock jump does not grant extra retries.
