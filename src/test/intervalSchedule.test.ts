import * as assert from 'assert';
import {
  DEFAULT_MAX_MINUTES,
  DEFAULT_MIN_MINUTES,
  pickIntervalMs,
  resolveIntervalRange,
  sameRange
} from '../intervalSchedule';

/** Nothing configured: every flag false, values at their packaged defaults. */
function unset(over: Partial<Parameters<typeof resolveIntervalRange>[0]> = {}) {
  return {
    min: DEFAULT_MIN_MINUTES,
    max: DEFAULT_MAX_MINUTES,
    legacy: 30,
    minSet: false,
    maxSet: false,
    legacySet: false,
    ...over
  };
}

suite('resolveIntervalRange', () => {
  test('a fresh install gets the randomized default range', () => {
    assert.deepStrictEqual(resolveIntervalRange(unset()), {
      minMinutes: DEFAULT_MIN_MINUTES,
      maxMinutes: DEFAULT_MAX_MINUTES
    });
  });

  test('an explicitly set legacy commitInterval still pins the cadence', () => {
    // Someone who chose 15 before the range existed must keep getting 15, not
    // silently drift into the new default window.
    assert.deepStrictEqual(
      resolveIntervalRange(unset({ legacy: 15, legacySet: true })),
      { minMinutes: 15, maxMinutes: 15 }
    );
  });

  test('explicit min/max wins over a legacy commitInterval', () => {
    // Both present means the user has migrated; the range is the newer intent.
    assert.deepStrictEqual(
      resolveIntervalRange(
        unset({
          min: 10,
          max: 90,
          minSet: true,
          maxSet: true,
          legacy: 15,
          legacySet: true
        })
      ),
      { minMinutes: 10, maxMinutes: 90 }
    );
  });

  test('setting only one bound keeps the other at its default', () => {
    assert.deepStrictEqual(
      resolveIntervalRange(unset({ min: 5, minSet: true })),
      { minMinutes: 5, maxMinutes: DEFAULT_MAX_MINUTES }
    );
  });

  test('reversed bounds are swapped, preserving the implied width', () => {
    assert.deepStrictEqual(
      resolveIntervalRange(
        unset({ min: 90, max: 30, minSet: true, maxSet: true })
      ),
      { minMinutes: 30, maxMinutes: 90 }
    );
  });

  test('zero and negative bounds clamp to a minute', () => {
    // A 0 ms timer would re-enter the scheduler faster than a push can finish.
    assert.deepStrictEqual(
      resolveIntervalRange(
        unset({ min: 0, max: -5, minSet: true, maxSet: true })
      ),
      { minMinutes: 1, maxMinutes: 1 }
    );
  });

  test('an absurd bound clamps below the setTimeout overflow', () => {
    // Node turns a delay above 2^31-1 ms into 1 ms, so an uncapped value would
    // invert a "commit once a year" setting into a commit every millisecond.
    const range = resolveIntervalRange(
      unset({ min: 1, max: 5_000_000, minSet: true, maxSet: true })
    );
    assert.ok(
      pickIntervalMs(range, () => 1) <= 2 ** 31 - 1,
      'drawn delay would overflow setTimeout'
    );
  });

  test('a non-numeric bound falls back to its default', () => {
    assert.deepStrictEqual(
      resolveIntervalRange(
        unset({ min: NaN, max: NaN, minSet: true, maxSet: true })
      ),
      { minMinutes: DEFAULT_MIN_MINUTES, maxMinutes: DEFAULT_MAX_MINUTES }
    );
  });
});

suite('pickIntervalMs', () => {
  const range = { minMinutes: 20, maxMinutes: 45 };

  test('the low end of the draw is the configured minimum', () => {
    assert.strictEqual(pickIntervalMs(range, () => 0), 20 * 60_000);
  });

  test('the high end of the draw approaches the configured maximum', () => {
    const ms = pickIntervalMs(range, () => 0.999999);
    assert.ok(ms <= 45 * 60_000, `${ms} exceeded the maximum`);
    assert.ok(ms > 44.9 * 60_000, `${ms} fell short of the maximum`);
  });

  test('a pinned range always returns exactly that interval', () => {
    const pinned = { minMinutes: 30, maxMinutes: 30 };
    assert.strictEqual(pickIntervalMs(pinned, () => 0), 30 * 60_000);
    assert.strictEqual(pickIntervalMs(pinned, () => 0.5), 30 * 60_000);
  });

  test('every draw stays inside the range and is never zero', () => {
    // The scheduler chains on this value, so a 0 or out-of-range draw would
    // either spin or silently stop honouring the setting.
    for (let i = 0; i < 500; i++) {
      const ms = pickIntervalMs(range);
      assert.ok(
        ms >= 20 * 60_000 && ms <= 45 * 60_000,
        `${ms} outside the configured range`
      );
    }
  });

  test('successive draws differ, which is the whole point', () => {
    const draws = new Set(
      Array.from({ length: 50 }, () => pickIntervalMs(range))
    );
    assert.ok(draws.size > 1, 'interval never varied across 50 draws');
  });
});

suite('sameRange', () => {
  test('detects an unchanged range so a config edit does not reschedule', () => {
    assert.strictEqual(
      sameRange(
        { minMinutes: 20, maxMinutes: 45 },
        { minMinutes: 20, maxMinutes: 45 }
      ),
      true
    );
  });

  test('detects a changed bound', () => {
    assert.strictEqual(
      sameRange(
        { minMinutes: 20, maxMinutes: 45 },
        { minMinutes: 20, maxMinutes: 60 }
      ),
      false
    );
  });
});
