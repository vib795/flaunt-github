import * as vscode from 'vscode';
import * as path from 'path';
import { log, logError } from './logger';
import { ActivityTracker } from './activityTracker';
import { TrackingRepo } from './trackingRepo';
import { PendingQueue } from './pendingQueue';
import { StatusBar } from './statusBar';
import { FlauntConfig, ActivityEntry } from './types';
import { buildCommitMessage, writeJournal } from './journal';
import { MetricsService } from './metricsService';

const MILESTONE_KEY = 'codeTracking.commitMilestone';

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
  }

  intervalChanged(): void {
    if (this.timer) {clearTimeout(this.timer);}
    this.schedule();
  }

  async runOnce(force = false): Promise<void> {
    await this.tick(force);
  }

  private schedule(): void {
    if (this.stopped) {return;}
    const intervalMs = this.deps.getConfig().commitIntervalMinutes * 60_000;
    this.nextAt = Date.now() + intervalMs;
    this.deps.status.setState({ kind: 'waiting', nextAt: this.nextAt });

    this.timer = setTimeout(async () => {
      await this.tick(false);
      if (!this.stopped) {this.schedule();}
    }, intervalMs);
  }

  private async tick(forced: boolean): Promise<void> {
    if (this.running) {
      log('Skipping tick: previous commit still in progress.');
      return;
    }
    const cfg = this.deps.getConfig();
    if (cfg.paused && !forced) {
      log('Tracker is paused; skipping tick.');
      this.deps.status.setState({ kind: 'paused' });
      return;
    }

    this.running = true;
    try {
      await this.executeTick(cfg);
    } finally {
      this.running = false;
    }
  }

  private async executeTick(cfg: FlauntConfig): Promise<void> {
    const { tracker, repo, pending, status, metrics } = this.deps;

    if (!tracker.hadSave() && tracker.isEmpty()) {
      const captured = await tracker.captureDirtyDocs();
      if (!captured) {
        const ws = await tracker.captureWorkspaceDiff();
        if (!ws && tracker.isEmpty()) {
          log('No activity this interval; skipping commit.');
          return;
        }
      }
    }

    const entries = tracker.drain();
    if (entries.length === 0) {return;}

    status.setState({ kind: 'committing' });

    try {
      await repo.fetch();
      await repo.mergeRemote();

      const result = writeJournal(repo.localPath, entries, cfg.timeZone);
      if (result.files.length === 0) {
        log('No journal files produced; skipping commit.');
        return;
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
        return;
      }

      await repo.push();
      log(`Pushed commit: "${message}"`);
      pending.clear();
      await this.noteMilestone();
    } catch (e) {
      logError('Commit/push failed; persisting activity for retry', e);
      tracker.restore(entries);
      pending.persist([...pending.load(), ...entries.filter(Boolean)]);
      status.setState({ kind: 'error', message: 'push failed — will retry' });
      setTimeout(() => {
        status.setState({ kind: 'waiting', nextAt: this.nextAt });
      }, 5000);
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
