/**
 * Status bar state, kept free of `vscode` imports so the settle rules can be
 * unit tested in plain Node (same split as ignore.ts / ignoreMatcher.ts).
 */
export type StatusState =
  | { kind: 'initializing' }
  | { kind: 'paused' }
  | { kind: 'waiting'; nextAt: number }
  | { kind: 'committing' }
  | { kind: 'error'; message: string };

export interface SettleOptions {
  paused: boolean;
  nextAt: number;
  /** Clear a displayed error instead of preserving it (error dwell elapsed). */
  clearError?: boolean;
}

/**
 * Where the status bar has to land once a tick stops running.
 *
 * `committing` is transient: nothing else clears it, so every exit path out of
 * a tick — success, no-op, early return, throw — must route through here or the
 * bar sticks on "committing" until the next scheduled tick happens to reset it.
 * `error` is preserved so its dwell time is visible; the runner clears it on a
 * timer by passing `clearError`.
 */
export function settledStatus(
  current: StatusState,
  opts: SettleOptions
): StatusState {
  if (current.kind === 'error' && !opts.clearError) {
    return current;
  }
  return opts.paused
    ? { kind: 'paused' }
    : { kind: 'waiting', nextAt: opts.nextAt };
}
