/**
 * Commit-interval resolution and per-tick draw, kept free of `vscode` imports
 * so the rules can be unit tested in plain Node (same split as
 * statusState.ts / statusBar.ts).
 *
 * Why randomize at all: a fixed cadence makes every coding day produce nearly
 * the same commit count, which is what renders a contribution graph as one flat
 * shade of green. Drawing a fresh interval each tick spreads the daily count
 * out, so the graph varies the way hand-made commits do. The width of the range
 * is the dial — 25-35 barely moves, 15-90 is visibly textured.
 */

/** Bounds, in minutes, that each tick's delay is drawn from. */
export interface IntervalRange {
  minMinutes: number;
  maxMinutes: number;
}

/**
 * Raw settings plus whether the user actually set each one, as opposed to
 * receiving the packaged default. The distinction is what lets the legacy fixed
 * setting keep working without freezing everyone else at a fixed cadence.
 */
export interface RawIntervalSettings {
  min: number;
  max: number;
  /** Legacy fixed `codeTracking.commitInterval`. */
  legacy: number;
  minSet: boolean;
  maxSet: boolean;
  legacySet: boolean;
}

export const DEFAULT_MIN_MINUTES = 20;
export const DEFAULT_MAX_MINUTES = 45;

/** Under a minute the scheduler would tick faster than a push can finish. */
const FLOOR_MINUTES = 1;

/**
 * Node clamps a `setTimeout` delay above 2^31-1 ms down to 1 ms and warns, so
 * an absurdly large setting would invert into a commit every millisecond —
 * the opposite of what it asks for. Cap below the overflow instead.
 */
const CEILING_MINUTES = Math.floor((2 ** 31 - 1) / 60_000);

/**
 * Decide the range to draw from, most-specific-wins:
 *
 * 1. An explicit min/max is the clearest statement of intent, so it wins even
 *    when a legacy fixed interval is also present.
 * 2. A deliberately chosen `commitInterval` from before this setting existed
 *    pins both ends, reproducing that user's old behaviour exactly.
 * 3. Otherwise the packaged range, so a fresh install gets a varied graph
 *    without configuring anything.
 */
export function resolveIntervalRange(raw: RawIntervalSettings): IntervalRange {
  if (raw.minSet || raw.maxSet) {
    return normalize(raw.min, raw.max);
  }
  if (raw.legacySet) {
    return normalize(raw.legacy, raw.legacy);
  }
  return normalize(DEFAULT_MIN_MINUTES, DEFAULT_MAX_MINUTES);
}

/**
 * Reversed bounds are a typo, not a request for a zero-length window, so swap
 * rather than collapse — that keeps the width the user implied.
 */
function normalize(min: number, max: number): IntervalRange {
  const lo = clamp(min, DEFAULT_MIN_MINUTES);
  const hi = clamp(max, DEFAULT_MAX_MINUTES);
  return lo <= hi
    ? { minMinutes: lo, maxMinutes: hi }
    : { minMinutes: hi, maxMinutes: lo };
}

/** A garbage value must never become a 0 ms timer that spins on git. */
function clamp(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(CEILING_MINUTES, Math.max(FLOOR_MINUTES, value));
}

export function sameRange(a: IntervalRange, b: IntervalRange): boolean {
  return a.minMinutes === b.minMinutes && a.maxMinutes === b.maxMinutes;
}

/**
 * Draw one tick's delay, uniform over the range. `rng` is injectable so the
 * bounds can be tested at the extremes instead of by sampling.
 */
export function pickIntervalMs(
  range: IntervalRange,
  rng: () => number = Math.random
): number {
  const { minMinutes, maxMinutes } = range;
  const span = maxMinutes - minMinutes;
  const minutes = span <= 0 ? minMinutes : minMinutes + rng() * span;
  return Math.round(minutes * 60_000);
}
