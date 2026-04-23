import * as vscode from 'vscode';
import { log, showLogChannel } from './logger';
import { setPaused, readConfig } from './config';
import { refreshCredentials } from './auth';
import { resetConsent } from './consent';
import { IntervalRunner } from './intervalRunner';
import { Dashboard } from './dashboard';
import { generateBadge } from './badge';
import { exportMetrics } from './exporter';
import { MetricsService, fmtDuration } from './metricsService';
import { TrackingRepo, REPO_NAME } from './trackingRepo';
import { PushCredentials } from './types';

export interface CommandDeps {
  ctx: vscode.ExtensionContext;
  runner: IntervalRunner;
  dashboard: Dashboard;
  metrics: MetricsService;
  repo: TrackingRepo;
  creds: () => PushCredentials;
  onCredsRefreshed: (creds: PushCredentials) => void;
}

export function registerCommands(deps: CommandDeps): void {
  const { ctx, runner, dashboard, metrics, repo } = deps;

  ctx.subscriptions.push(
    vscode.commands.registerCommand('codeTracking.start', async () => {
      await runner.runOnce(true);
      vscode.window.showInformationMessage('Flaunt GitHub: commit attempted.');
    }),

    vscode.commands.registerCommand('codeTracking.showMetrics', async () => {
      await showMetricsChannel(metrics, repo);
    }),

    vscode.commands.registerCommand('codeTracking.showDashboard', () =>
      dashboard.show()
    ),

    vscode.commands.registerCommand('codeTracking.pause', async () => {
      await setPaused(true);
      vscode.window.showInformationMessage('Flaunt GitHub: tracking paused.');
    }),

    vscode.commands.registerCommand('codeTracking.resume', async () => {
      await setPaused(false);
      vscode.window.showInformationMessage('Flaunt GitHub: tracking resumed.');
    }),

    vscode.commands.registerCommand('codeTracking.refreshAuth', async () => {
      try {
        const creds = await refreshCredentials(ctx);
        deps.onCredsRefreshed(creds);
        vscode.window.showInformationMessage(
          `Flaunt GitHub: refreshed auth for ${creds.username}.`
        );
      } catch (e) {
        vscode.window.showErrorMessage(
          `Flaunt GitHub: auth refresh failed — ${(e as Error).message}`
        );
      }
    }),

    vscode.commands.registerCommand('codeTracking.resetConsent', async () => {
      await resetConsent(ctx);
      vscode.window.showInformationMessage(
        'Flaunt GitHub: consent reset. Reload window to re-prompt.'
      );
    }),

    vscode.commands.registerCommand('codeTracking.openTrackingRepo', async () => {
      const creds = deps.creds();
      await vscode.env.openExternal(
        vscode.Uri.parse(`https://github.com/${creds.username}/${REPO_NAME}`)
      );
    }),

    vscode.commands.registerCommand('codeTracking.generateBadge', async () => {
      try {
        const result = await generateBadge(repo, metrics, deps.creds());
        await vscode.env.clipboard.writeText(result.markdown);
        vscode.window.showInformationMessage(
          'Flaunt badge generated and copied to clipboard. Next commit will push it.'
        );
      } catch (e) {
        vscode.window.showErrorMessage(
          `Flaunt GitHub: badge generation failed — ${(e as Error).message}`
        );
      }
    }),

    vscode.commands.registerCommand('codeTracking.exportMetrics', async () => {
      const uri = await exportMetrics(metrics, repo);
      if (uri) {
        vscode.window.showInformationMessage(`Exported metrics to ${uri.fsPath}`);
      }
    }),

    vscode.commands.registerCommand('codeTracking.showLog', () => {
      showLogChannel();
    }),

    vscode.commands.registerCommand('codeTracking.showMenu', () =>
      showQuickMenu(readConfig().paused)
    )
  );
}

async function showQuickMenu(paused: boolean): Promise<void> {
  const items: Array<vscode.QuickPickItem & { command: string }> = [
    { label: '$(cloud-upload) Commit now', command: 'codeTracking.start' },
    paused
      ? { label: '$(debug-start) Resume tracking', command: 'codeTracking.resume' }
      : { label: '$(debug-pause) Pause tracking', command: 'codeTracking.pause' },
    { label: '$(graph) Open dashboard', command: 'codeTracking.showDashboard' },
    {
      label: '$(output) Show metrics (log)',
      command: 'codeTracking.showMetrics'
    },
    { label: '$(tag) Generate profile badge', command: 'codeTracking.generateBadge' },
    { label: '$(save) Export metrics', command: 'codeTracking.exportMetrics' },
    {
      label: '$(link-external) Open tracking repo',
      command: 'codeTracking.openTrackingRepo'
    },
    { label: '$(key) Refresh GitHub auth', command: 'codeTracking.refreshAuth' },
    { label: '$(terminal) Show Flaunt log', command: 'codeTracking.showLog' }
  ];
  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: 'Flaunt GitHub'
  });
  if (pick) {await vscode.commands.executeCommand(pick.command);}
}

async function showMetricsChannel(
  metrics: MetricsService,
  repo: TrackingRepo
): Promise<void> {
  showLogChannel();
  log('=== Flaunt GitHub Metrics ===');

  const languages = metrics.getLanguageCounts();
  log('Language save counts:');
  for (const [lang, count] of Object.entries(languages)) {
    log(`  ${lang}: ${count}`);
  }

  log('Session durations (top 15):');
  const top = metrics
    .getSessions()
    .sort((a, b) => b.totalSeconds - a.totalSeconds)
    .slice(0, 15);
  for (const s of top) {
    log(`  ${s.fileName}: ${fmtDuration(s.totalSeconds)}`);
  }

  const diff = await repo.diffSummary();
  log(`Tracking repo uncommitted: +${diff.added}/−${diff.removed}`);

  log('=== End Metrics ===');
}
