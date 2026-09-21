import test from 'node:test';
import assert from 'node:assert/strict';

import { RetryBudget } from '../src/core.js';

function makeClock(start = 0) {
  let now = start;
  const clock = () => now;
  clock.advance = (ms) => {
    now += ms;
  };
  clock.set = (value) => {
    now = value;
  };
  return clock;
}

test('constructor accepts positive integer limit and window', () => {
  const clock = makeClock(1000);
  const budget = new RetryBudget({ limit: 3, windowMs: 100, clock });
  assert.equal(budget.limit, 3);
  assert.equal(budget.windowMs, 100);
  assert.equal(budget.used, 0);
  assert.equal(budget.windowStart, 1000);
});

test('constructor rejects non-positive or non-integer limit', () => {
  assert.throws(() => new RetryBudget({ limit: 0, windowMs: 100 }), RangeError);
  assert.throws(() => new RetryBudget({ limit: -1, windowMs: 100 }), RangeError);
  assert.throws(() => new RetryBudget({ limit: 1.5, windowMs: 100 }), RangeError);
  assert.throws(() => new RetryBudget({ limit: NaN, windowMs: 100 }), RangeError);
});

test('constructor rejects non-positive or non-integer windowMs', () => {
  assert.throws(() => new RetryBudget({ limit: 1, windowMs: 0 }), RangeError);
  assert.throws(() => new RetryBudget({ limit: 1, windowMs: -10 }), RangeError);
  assert.throws(() => new RetryBudget({ limit: 1, windowMs: 10.5 }), RangeError);
  assert.throws(() => new RetryBudget({ limit: 1, windowMs: NaN }), RangeError);
});

test('constructor rejects non-function clock', () => {
  assert.throws(() => new RetryBudget({ limit: 1, windowMs: 100, clock: 42 }), TypeError);
  assert.throws(() => new RetryBudget({ limit: 1, windowMs: 100, clock: 'now' }), TypeError);
});

test('tryReserve allows up to the limit within one window', () => {
  const clock = makeClock(0);
  const budget = new RetryBudget({ limit: 2, windowMs: 100, clock });

  assert.equal(budget.tryReserve(), true);
  assert.equal(budget.used, 1);
  assert.equal(budget.tryReserve(), true);
  assert.equal(budget.used, 2);
  assert.equal(budget.tryReserve(), false);
  assert.equal(budget.used, 2);
});

test('tryReserve resets after the window has fully elapsed', () => {
  const clock = makeClock(0);
  const budget = new RetryBudget({ limit: 2, windowMs: 100, clock });

  budget.tryReserve();
  budget.tryReserve();
  assert.equal(budget.tryReserve(), false);

  clock.advance(99);
  assert.equal(budget.tryReserve(), false);

  clock.advance(1); // now - windowStart = 100, window expired
  assert.equal(budget.tryReserve(), true);
  assert.equal(budget.used, 1);
});

test('tryReserve resets if clock jumps far beyond a window', () => {
  const clock = makeClock(0);
  const budget = new RetryBudget({ limit: 3, windowMs: 50, clock });

  budget.tryReserve();
  budget.tryReserve();
  budget.tryReserve();
  assert.equal(budget.tryReserve(), false);

  clock.advance(5000);
  assert.equal(budget.tryReserve(), true);
  assert.equal(budget.used, 1);
});

test('remaining reports correct count and advances expired windows', () => {
  const clock = makeClock(0);
  const budget = new RetryBudget({ limit: 5, windowMs: 100, clock });

  assert.equal(budget.remaining(), 5);
  budget.tryReserve();
  budget.tryReserve();
  assert.equal(budget.remaining(), 3);

  clock.advance(100);
  assert.equal(budget.remaining(), 5);
  assert.equal(budget.windowStart, 100);
});

test('limit of 1 behaves as a single-shot budget per window', () => {
  const clock = makeClock(0);
  const budget = new RetryBudget({ limit: 1, windowMs: 1000, clock });

  assert.equal(budget.tryReserve(), true);
  assert.equal(budget.tryReserve(), false);
  clock.advance(1000);
  assert.equal(budget.tryReserve(), true);
  assert.equal(budget.tryReserve(), false);
});

test('clock moving backwards does not extend the window', () => {
  const clock = makeClock(5000);
  const budget = new RetryBudget({ limit: 2, windowMs: 100, clock });

  budget.tryReserve();
  clock.set(4000); // backwards: now - windowStart is negative
  assert.equal(budget.tryReserve(), true); // still within original window
  assert.equal(budget.used, 2);
  assert.equal(budget.tryReserve(), false);
});

test('index re-exports RetryBudget', async () => {
  const index = await import('../src/index.js');
  assert.equal(index.RetryBudget, RetryBudget);
});
