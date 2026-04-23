import * as path from 'path';
import * as vscode from 'vscode';
import { setLogSink, log, logError, showLogChannel } from './logger';
import { readConfig, onConfigChanged } from './config';
import { ensureConsent } from './consent';
import { FileLock } from './lockfile';
import { resolveCredentials } from './auth';
import {
  TrackingRepo,
  REPO_NAME,
  ensureLocalClone,
  ensureRemoteRepo
} from './trackingRepo';
import { PendingQueue } from './pendingQueue';
import { IgnoreMatcher } from './ignore';
import { MetricsService } from './metricsService';
import { ActivityTracker } from './activityTracker';
import { StatusBar } from './statusBar';
import { IntervalRunner } from './intervalRunner';
import { Dashboard } from './dashboard';
import { registerCommands } from './commands';
import { migrateLegacySummary } from './journal';
import { Octokit } from '@octokit/rest';
import { PushCredentials } from './types';

let cleanup: (() => void)[] = [];

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const channel = vscode.window.createOutputChannel('FlauntGitHubLog');
  context.subscriptions.push(channel);
  setLogSink(
    (line) => channel.appendLine(line),
    (preserve) => channel.show(preserve)
  );
  log('Flaunt GitHub activating...');

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    log('No workspace folder open; extension will not start.');
    return;
  }

  const status = new StatusBar();
  context.subscriptions.push(status);

  const lock = new FileLock(context.globalStorageUri.fsPath);
  if (!lock.tryAcquire()) {
    log('Another VS Code window owns the Flaunt lock. Disabling commits here.');
    status.setState({
      kind: 'error',
      message: 'another window is tracking'
    });
    return;
  }
  cleanup.push(() => lock.release());

  let cfg = readConfig();

  const samplePreview = [
    '[2026-04-22 10:15:03] Saved src/app.ts',
    '[2026-04-22 10:15:48] Auto-snapshot README.md',
    '[Flaunt] 2026-04-22 · +14/−3 · flaunt-github · typescript · 3 saves'
  ].join('\n');
  const accepted = await ensureConsent(context, samplePreview);
  if (!accepted) {
    status.setState({ kind: 'paused' });
    log('Tracking not started: user declined consent.');
    return;
  }

  let creds: PushCredentials;
  try {
    creds = await resolveCredentials(context);
  } catch (e) {
    logError('Credential resolution failed', e);
    vscode.window.showErrorMessage(
      'Flaunt GitHub: GitHub sign-in failed. Use the "Refresh GitHub auth" command to retry.'
    );
    status.setState({ kind: 'error', message: 'auth failed' });
    return;
  }

  const octokit = new Octokit({ auth: creds.token });
  const repoOk = await ensureRemoteRepo(octokit, creds.username);
  if (!repoOk) {
    status.setState({ kind: 'error', message: 'remote repo unavailable' });
    return;
  }

  const localRepoPath = path.join(context.globalStorageUri.fsPath, REPO_NAME);
  await ensureLocalClone(localRepoPath, creds);
  const migrated = migrateLegacySummary(localRepoPath);
  if (migrated) {
    log(`Migrated legacy coding_summary.txt to ${migrated}.`);
  }

  const repo = new TrackingRepo(localRepoPath, creds);
  const pending = new PendingQueue(context.globalStorageUri.fsPath);
  const metrics = new MetricsService(context);
  const ignore = new IgnoreMatcher(cfg.ignoreGlobs);

  const tracker = new ActivityTracker(metrics, ignore, () => cfg);
  tracker.start(context);

  const runner = new IntervalRunner({
    tracker,
    repo,
    pending,
    status,
    metrics,
    getConfig: () => cfg,
    context
  });
  cleanup.push(() => runner.stop());

  const dashboard = new Dashboard(metrics, repo);

  registerCommands({
    ctx: context,
    runner,
    dashboard,
    metrics,
    repo,
    creds: () => creds,
    onCredsRefreshed: (next) => {
      creds = next;
      repo.updateCreds(next);
    }
  });

  context.subscriptions.push(
    onConfigChanged((next) => {
      const intervalChanged =
        next.commitIntervalMinutes !== cfg.commitIntervalMinutes;
      const ignoreChanged =
        JSON.stringify(next.ignoreGlobs) !== JSON.stringify(cfg.ignoreGlobs);
      const trackOpensChanged = next.trackFileOpens !== cfg.trackFileOpens;
      const pausedChanged = next.paused !== cfg.paused;

      cfg = next;

      if (ignoreChanged) {
        tracker.updateIgnoreMatcher(new IgnoreMatcher(cfg.ignoreGlobs));
      }
      if (trackOpensChanged) {
        tracker.refreshOpenListener();
      }
      if (intervalChanged) {
        runner.intervalChanged();
      }
      if (pausedChanged) {
        status.setState(
          cfg.paused
            ? { kind: 'paused' }
            : { kind: 'waiting', nextAt: runner.getNextAt() }
        );
      }
    })
  );

  if (cfg.paused) {
    status.setState({ kind: 'paused' });
  }
  runner.start();
  log(`Flaunt GitHub ready. Local repo: ${localRepoPath}`);
}

export function deactivate(): void {
  log('Flaunt GitHub deactivating...');
  for (const fn of cleanup) {
    try {
      fn();
    } catch (e) {
      logError('Cleanup error', e);
    }
  }
  cleanup = [];
}

export { showLogChannel };
