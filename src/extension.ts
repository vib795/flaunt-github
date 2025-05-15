import * as vscode from 'vscode';
import { Octokit } from '@octokit/rest';
import simpleGit, { SimpleGit } from 'simple-git';
import * as fs from 'fs';
import * as path from 'path';
import { MetricsService } from './metricsService';

const SUMMARY_FILENAME = 'coding_summary.txt';
const REPO_NAME = 'code-tracking';

let git: SimpleGit;
let codingSummary = '';
let outputChannel: vscode.OutputChannel;
let commitTimer: NodeJS.Timeout;
let countdownTimer: NodeJS.Timeout;
let statusBarItem: vscode.StatusBarItem;
let nextCommitTime = 0;
let commitCount = 0;
let metricsService: MetricsService;

export async function activate(context: vscode.ExtensionContext) {
  metricsService = new MetricsService(context);

  // Create and show output channel
  outputChannel = vscode.window.createOutputChannel('FlauntGitHubLog');
  outputChannel.show(true);
  logMessage('Flaunt GitHub: Extension Activated!');

  // Create status bar item for countdown
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.tooltip = 'Time until next commit';
  statusBarItem.show();

  // Initial GitHub OAuth authentication
  let githubToken: string;
  let githubUsername: string;
  try {
    const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: true });
    githubToken = session.accessToken;
    githubUsername = session.account.label;
    logMessage(`Authenticated as ${githubUsername}`);
  } catch (e: any) {
    vscode.window.showErrorMessage('GitHub sign‑in failed. Please sign in.');
    logMessage(`Authentication error: ${e.message}`);
    return;
  }

  // Read configuration
  const config = vscode.workspace.getConfiguration('codeTracking');
  const commitInterval = config.get<number>('commitInterval', 30);
  const commitMessagePrefix = config.get<string>('commitMessagePrefix', '');
  const timeZone = config.get<string>(
    'timeZone',
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const trackFileOpens = config.get<boolean>('trackFileOpens', false);

  // Ensure GitHub repository exists
  const octokit = new Octokit({ auth: githubToken });
  if (!(await ensureRepoExists(octokit, githubUsername, REPO_NAME))) {
    return;
  }

  // Clone or set up local repo
  const localRepoPath = path.join(context.globalStoragePath, REPO_NAME);
  await ensureLocalClone(localRepoPath, githubUsername, REPO_NAME, githubToken);
  git = simpleGit(localRepoPath);

  // Track file saves (only file:// URIs)
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(doc => {
      if (doc.uri.scheme !== 'file') {
        return;
      }
      const ts = new Date().toLocaleString(undefined, { timeZone });
      const relPath = vscode.workspace.workspaceFolders?.[0]
        ? path.relative(vscode.workspace.workspaceFolders[0].uri.fsPath, doc.uri.fsPath)
        : doc.fileName;
      const line = `[${ts}]: Saved ${relPath}`;
      codingSummary += line + '\n';
      logMessage(line);
      metricsService.trackLanguage(doc);
    })
  );

  // Optionally track file opens (only file:// URIs)
  if (trackFileOpens) {
    context.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument(doc => {
        if (doc.uri.scheme !== 'file') {
          return;
        }
        const ts = new Date().toLocaleString(undefined, { timeZone });
        const relPath = vscode.workspace.workspaceFolders?.[0]
          ? path.relative(vscode.workspace.workspaceFolders[0].uri.fsPath, doc.uri.fsPath)
          : doc.fileName;
        const line = `[${ts}]: Opened ${relPath}`;
        codingSummary += line + '\n';
        logMessage(line);
      })
    );
  }

  // Track editing sessions (only file:// URIs)
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(doc => {
      if (doc.uri.scheme === 'file') {
        metricsService.startSession(doc.uri);
      }
    }),
    vscode.workspace.onDidCloseTextDocument(doc => {
      if (doc.uri.scheme === 'file') {
        metricsService.endSession(doc.uri);
      }
    })
  );

  // Start periodic commits and countdown
  createOrUpdateCommitTimer(commitInterval, localRepoPath, commitMessagePrefix, timeZone);

  // React to configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (
        e.affectsConfiguration('codeTracking.commitInterval') ||
        e.affectsConfiguration('codeTracking.commitMessagePrefix') ||
        e.affectsConfiguration('codeTracking.trackFileOpens')
      ) {
        const nc = vscode.workspace.getConfiguration('codeTracking');
        const ni = nc.get<number>('commitInterval', 30);
        const np = nc.get<string>('commitMessagePrefix', '');
        const nt = nc.get<boolean>('trackFileOpens', false);
        logMessage(`Settings updated → interval=${ni}, prefix="${np}", trackOpens=${nt}`);
        createOrUpdateCommitTimer(ni, localRepoPath, np, timeZone);
        if (nt !== trackFileOpens) {
          vscode.window.showInformationMessage('Reload to apply file-open tracking change.');
        }
      }
    })
  );

  // Manual commit command
  context.subscriptions.push(
    vscode.commands.registerCommand('codeTracking.start', async () => {
      await commitAndPush(localRepoPath, commitMessagePrefix, timeZone);
      vscode.window.showInformationMessage('Manual commit executed.');
    })
  );

  // Show metrics command
  context.subscriptions.push(
    vscode.commands.registerCommand('codeTracking.showMetrics', async () => {
      const languageCounts = context.globalState.get<Record<string, number>>('languageCounts', {});
      const sessionDurations = context.globalState.get<Record<string, number>>('sessionDurations', {});
      const summaryDiff = await metricsService.computeDiffStats(localRepoPath);

      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      let workspaceDiff = { added: 0, removed: 0 };
      if (workspaceFolder) {
        workspaceDiff = await metricsService.computeDiffStats(workspaceFolder);
      }

      const fmtDuration = (sec: number) => {
        const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.round(sec % 60);
        return [h > 0 ? `${h}h` : null, m > 0 ? `${m}m` : null, s > 0 ? `${s}s` : null]
          .filter(Boolean)
          .join(' ') || '0s';
      };

      const friendlyName = (uriString: string) => {
        try {
          const uri = vscode.Uri.parse(uriString);
          if (uri.scheme === 'file' && workspaceFolder) {
            return path.relative(workspaceFolder, uri.fsPath);
          }
          return path.basename(uri.fsPath || uriString);
        } catch {
          return uriString;
        }
      };

      const dedup = new Map<string, number>();
      for (const [uri, secs] of Object.entries(sessionDurations)) {
        const name = friendlyName(uri);
        dedup.set(name, (dedup.get(name) || 0) + secs);
      }

      outputChannel.appendLine('=== 📊 Flaunt GitHub Metrics ===');
      outputChannel.appendLine('• Language save counts:');
      for (const [lang, count] of Object.entries(languageCounts)) {
        outputChannel.appendLine(`    ${lang}: ${count}`);
      }
      outputChannel.appendLine('• Session durations:');
      for (const [name, secs] of dedup) {
        outputChannel.appendLine(`    ${name}: ${fmtDuration(secs)}`);
      }
      outputChannel.appendLine(`• Summary repo diff: +${summaryDiff.added}/−${summaryDiff.removed}`);
      if (workspaceFolder) {
        outputChannel.appendLine(`• Workspace diff: +${workspaceDiff.added}/−${workspaceDiff.removed}`);
      }
      outputChannel.appendLine('=== End Metrics ===\n');
      outputChannel.show(true);
    })
  );

  logMessage(`Extension ready. Local repo at ${localRepoPath}`);
}

export function deactivate() {
  logMessage('Flaunt GitHub: Extension Deactivated');
  statusBarItem.dispose();
  clearInterval(commitTimer);
  clearInterval(countdownTimer);
}

function createOrUpdateCommitTimer(
  intervalMinutes: number,
  repoPath: string,
  prefix: string,
  timeZone: string
) {
  if (commitTimer) {
    clearInterval(commitTimer);
    logMessage('Cleared previous commit timer.');
  }
  const ms = intervalMinutes * 60_000;
  nextCommitTime = Date.now() + ms;
  commitTimer = setInterval(() => {
    commitAndPush(repoPath, prefix, timeZone);
  }, ms);
  logMessage(`Created new commit timer: every ${intervalMinutes} minute(s).`);

  if (countdownTimer) {
    clearInterval(countdownTimer);
  }
  countdownTimer = setInterval(() => {
    const diff = Math.max(nextCommitTime - Date.now(), 0);
    const m = Math.floor(diff / 60000), s = Math.floor((diff % 60000) / 1000);
    statusBarItem.text = `Next commit in ${m}m ${s}s`;
    if (diff <= 0) {
      nextCommitTime = Date.now() + ms;
    }
  }, 1000);
}

async function commitAndPush(
  repoPath: string,
  prefix: string,
  timeZone: string
) {
  if (!codingSummary) {
    return;
  }
  try {
    const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: true });
    const freshToken = session.accessToken;
    const freshOwner = session.account.label;
    const authRemote = `https://${freshOwner}:${freshToken}@github.com/${freshOwner}/${REPO_NAME}.git`;
    await git.remote(['set-url', 'origin', authRemote]);
    logMessage('🔄 Refreshed origin remote');

    await git.fetch();
    logMessage('Fetched origin/main');
    await git.merge(['origin/main', '--strategy-option=theirs']);
    logMessage('Merged remote changes');

    const summaryFile = path.join(repoPath, SUMMARY_FILENAME);
    fs.appendFileSync(summaryFile, codingSummary, { encoding: 'utf8' });
    await git.add(SUMMARY_FILENAME);

    const badge = await metricsService.getDiffBadge(repoPath);
    const ts = new Date().toLocaleString(undefined, { timeZone });
    const msg = `${prefix} ${badge}Coding activity summary - ${ts}`.trim();
    await git.commit(msg);
    logMessage(`Committed: "${msg}"`);

    await git.push('origin', 'main');
    logMessage('Pushed to origin/main successfully');

    commitCount++;
    if (commitCount % 10 === 0) {
      vscode.window.showInformationMessage(`🎉 Milestone reached: ${commitCount} commits!`);
    }
  } catch (err: any) {
    vscode.window.showErrorMessage(`Error during commit/push: ${err.message}`);
    logMessage(`Error during commit/push: ${err.message}`);
  } finally {
    codingSummary = '';
  }
}

async function ensureRepoExists(octokit: Octokit, owner: string, repo: string): Promise<boolean> {
  try {
    await octokit.repos.get({ owner, repo });
    logMessage(`Repo "${repo}" exists for "${owner}".`);
    return true;
  } catch (e: any) {
    if (e.status === 404) {
      logMessage(`Creating repo "${repo}"...`);
      await octokit.repos.createForAuthenticatedUser({ name: repo, private: true, auto_init: true });
      logMessage(`Repo "${repo}" created.`);
      return true;
    }
    vscode.window.showErrorMessage(`Error checking repo: ${e.message}`);
    return false;
  }
}

async function ensureLocalClone(
  localRepoPath: string,
  owner: string,
  repo: string,
  token: string
): Promise<void> {
  const authRemote = `https://${owner}:${token}@github.com/${owner}/${repo}.git`;

  if (!fs.existsSync(localRepoPath)) {
    fs.mkdirSync(localRepoPath, { recursive: true });
    logMessage(`Cloning ${authRemote} into ${localRepoPath}...`);
    await simpleGit().clone(authRemote, localRepoPath);
    logMessage('Clone successful.');
  }

  git = simpleGit(localRepoPath);
  await git.remote(['set-url', 'origin', authRemote]);
  logMessage('Authenticated remote URL set.');
}

function logMessage(message: string) {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('FlauntGitHubLog');
    outputChannel.show(true);
  }
  const time = new Date().toLocaleTimeString();
  outputChannel.appendLine(`[${time}] ${message}`);
}
