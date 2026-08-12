import * as vscode from 'vscode';
import * as path from 'path';
import { log, logError } from './logger';
import { ActivityTracker } from './activityTracker';
import { TrackingRepo } from './trackingRepo';
import { PendingQueue } from './pendingQueue';
import { StatusBar } from './statusBar';
import { settledStatus } from './statusState';
import { FlauntConfig, ActivityEntry } from './types';
import { buildCommitMessage, writeJournal } from './journal';
import { MetricsService } from './metricsService';

const MILESTONE_KEY = 'codeTracking.commitMilestone';
const ERROR_DWELL_MS = 5000;

/** Why a tick ended, so `Commit Now` can report what actually happened. */
export type TickOutcome =
  | 'committed'
  | 'no-activity'
  | 'busy'
  | 'paused'
  | 'failed';

export interface IntervalRunnerDeps {
  tracker: ActivityTracker;
  repo: TrackingRepo;
  pending: PendingQueue;
  status: StatusBar;
  metrics: MetricsService;
  getConfig: () => FlauntConfig;
  context: vscode.ExtensionContext;
}

export class IntervalRunner {
  private timer?: NodeJS.Timeout;
  private errorTimer?: NodeJS.Timeout;
  private errorSince = 0;
  private stopped = false;
  private running = false;
  private nextAt = 0;

  constructor(private deps: IntervalRunnerDeps) {
    const leftover = deps.pending.load();
    if (leftover.length) {
      log(`Restored ${leftover.length} pending activity entries.`);
      deps.tracker.restore(leftover);
    }
  }

  start(): void {
    this.stopped = false;
    this.schedule();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (this.errorTimer) {
      clearTimeout(this.errorTimer);
      this.errorTimer = undefined;
    }
  }

  intervalChanged(): void {
    if (this.timer) {clearTimeout(this.timer);}
    this.schedule();
  }

  async runOnce(force = false): Promise<TickOutcome> {
    return this.tick(force);
  }

  private schedule(): void {
    if (this.stopped) {return;}
    const intervalMs = this.deps.getConfig().commitIntervalMinutes * 60_000;
    this.nextAt = Date.now() + intervalMs;
    this.settleStatus();

    this.timer = setTimeout(async () => {
      await this.tick(false);
      if (!this.stopped) {this.schedule();}
    }, intervalMs);
  }

  /**
   * Return the bar to a resting state. Every path that leaves `committing`
   * showing has to come through here — a forced tick has no scheduling
   * continuation behind it, so nothing else would ever clear it.
   *
   * The error dwell is measured, not timer-driven: if the dwell timer fires
   * while a tick happens to be running it is dropped, and a stale error would
   * otherwise persist forever. Any later settle clears it instead.
   */
  private settleStatus(): void {
    // `running` is cleared before the tick's own settle call, so this only
    // suppresses outside callers (a config change, the error dwell) from
    // replacing 'committing' while a commit is genuinely in flight.
    if (this.stopped || this.running) {return;}
    const { status } = this.deps;
    const current = status.getState();
    status.setState(
      settledStatus(current, {
        paused: this.deps.getConfig().paused,
        nextAt: this.nextAt,
        clearError:
          current.kind === 'error' &&
          Date.now() - this.errorSince >= ERROR_DWELL_MS
      })
    );
  }

  private async tick(forced: boolean): Promise<TickOutcome> {
    if (this.running) {
      log('Skipping tick: previous commit still in progress.');
      return 'busy';
    }
    const cfg = this.deps.getConfig();
    if (cfg.paused && !forced) {
      log('Tracker is paused; skipping tick.');
      this.deps.status.setState({ kind: 'paused' });
      return 'paused';
    }

    this.running = true;
    try {
      return await this.executeTick(cfg);
    } finally {
      this.running = false;
      this.settleStatus();
    }
  }

  private async executeTick(cfg: FlauntConfig): Promise<TickOutcome> {
    const { tracker, repo, pending, status, metrics } = this.deps;

    if (!tracker.hadSave() && tracker.isEmpty()) {
      const captured = await tracker.captureDirtyDocs();
      if (!captured) {
        const ws = await tracker.captureWorkspaceDiff();
        if (!ws && tracker.isEmpty()) {
          log('No activity this interval; skipping commit.');
          return 'no-activity';
        }
      }
    }

    const entries = tracker.drain();
    if (entries.length === 0) {return 'no-activity';}

    status.setState({ kind: 'committing' });

    try {
      await repo.fetch();
      await repo.mergeRemote();

      const result = writeJournal(repo.localPath, entries, cfg.timeZone);
      if (result.files.length === 0) {
        log('No journal files produced; skipping commit.');
        return 'no-activity';
      }

      const diff = await repo.diffSummary();
      const message = buildCommitMessage(
        cfg.commitMessagePrefix,
        entries,
        diff,
        cfg.timeZone
      );

      const committed = await repo.commit(message, result.files);
      if (!committed) {
        log('Nothing staged after journal write; skipping push.');
        return 'no-activity';
      }

      await repo.push();
      log(`Pushed commit: "${message}"`);
      pending.clear();
      await this.noteMilestone();
      return 'committed';
    } catch (e) {
      logError('Commit/push failed; persisting activity for retry', e);
      tracker.restore(entries);
      pending.persist([...pending.load(), ...entries.filter(Boolean)]);
      status.setState({ kind: 'error', message: 'push failed — will retry' });
      this.errorSince = Date.now();
      if (this.errorTimer) {clearTimeout(this.errorTimer);}
      this.errorTimer = setTimeout(() => {
        this.errorTimer = undefined;
        this.settleStatus();
      }, ERROR_DWELL_MS);
      return 'failed';
    }
  }

  private async noteMilestone(): Promise<void> {
    const current =
      this.deps.context.globalState.get<number>(MILESTONE_KEY, 0) + 1;
    await this.deps.context.globalState.update(MILESTONE_KEY, current);
    if (current % 10 === 0) {
      vscode.window.showInformationMessage(
        `🎉 Flaunt GitHub: ${current} commits tracked!`
      );
    }
  }

  getNextAt(): number {
    return this.nextAt;
  }
}

export function summaryFilePath(repoPath: string): string {
  return path.join(repoPath, 'journal');
}

export { ActivityEntry };
