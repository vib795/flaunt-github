import * as assert from 'assert';
import { settledStatus, StatusState } from '../statusState';

suite('settledStatus', () => {
  test('clears committing back to the countdown', () => {
    // The v3.0.13 bug: a forced tick set 'committing' and nothing ever reset it,
    // because only the scheduler's continuation restored 'waiting'.
    const next = settledStatus(
      { kind: 'committing' },
      { paused: false, nextAt: 1234 }
    );
    assert.deepStrictEqual(next, { kind: 'waiting', nextAt: 1234 });
  });

  test('settles to paused when tracking is paused', () => {
    const next = settledStatus(
      { kind: 'committing' },
      { paused: true, nextAt: 1234 }
    );
    assert.deepStrictEqual(next, { kind: 'paused' });
  });

  test('preserves an error so its dwell is visible', () => {
    const error: StatusState = { kind: 'error', message: 'push failed' };
    assert.deepStrictEqual(
      settledStatus(error, { paused: false, nextAt: 1234 }),
      error
    );
  });

  test('clears an error once the dwell has elapsed', () => {
    const next = settledStatus(
      { kind: 'error', message: 'push failed' },
      { paused: false, nextAt: 1234, clearError: true }
    );
    assert.deepStrictEqual(next, { kind: 'waiting', nextAt: 1234 });
  });

  test('settles from initializing on the first schedule', () => {
    const next = settledStatus(
      { kind: 'initializing' },
      { paused: false, nextAt: 99 }
    );
    assert.deepStrictEqual(next, { kind: 'waiting', nextAt: 99 });
  });
});
