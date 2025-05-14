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
  // Initialize MetricsService
  metricsService = new MetricsService(context);

  // Create and show output channel
  outputChannel = vscode.window.createOutputChannel('FlauntGitHubLog');
  outputChannel.show(true);
  logMessage('Flaunt GitHub: Extension Activated!');

  // Create status bar item for countdown
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.tooltip = 'Time until next commit';
  statusBarItem.show();

  // Initial authentication
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

  // Track file saves
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      const timestamp = new Date().toLocaleString(undefined, { timeZone });
      const line = `[${timestamp}]: Saved ${doc.fileName}`;
      codingSummary += line + '\n';
      logMessage(line);
      metricsService.trackLanguage(doc);
    })
  );

  // Optionally track file opens
  if (trackFileOpens) {
    context.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument((doc) => {
        const timestamp = new Date().toLocaleString(undefined, { timeZone });
        const line = `[${timestamp}]: Opened ${doc.fileName}`;
        codingSummary += line + '\n';
        logMessage(line);
      })
    );
  }

  // Track editing sessions
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => metricsService.startSession(doc.uri)),
    vscode.workspace.onDidCloseTextDocument((doc) => metricsService.endSession(doc.uri))
  );

  // Start periodic commits
  createOrUpdateCommitTimer(commitInterval, localRepoPath, commitMessagePrefix, timeZone);

  // React to configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration('codeTracking.commitInterval') ||
        e.affectsConfiguration('codeTracking.commitMessagePrefix') ||
        e.affectsConfiguration('codeTracking.trackFileOpens')
      ) {
        const newCfg = vscode.workspace.getConfiguration('codeTracking');
        const newInterval = newCfg.get<number>('commitInterval', 30);
        const newPrefix = newCfg.get<string>('commitMessagePrefix', '');
        const newTrack = newCfg.get<boolean>('trackFileOpens', false);
        logMessage(`Settings updated → interval=${newInterval}, prefix="${newPrefix}", trackOpens=${newTrack}`);
        createOrUpdateCommitTimer(newInterval, localRepoPath, newPrefix, timeZone);
        if (newTrack !== trackFileOpens) {
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

  logMessage(`Extension ready. Local repo at: ${localRepoPath}`);
}

export function deactivate() {
  logMessage('Flaunt GitHub: Extension Deactivated');
  statusBarItem.dispose();
  clearInterval(commitTimer);
  clearInterval(countdownTimer);
}

/**
 * Schedules periodic commits and status bar countdown.
 */
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
    const m = Math.floor(diff / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    statusBarItem.text = `Next commit in ${m}m ${s}s`;
    if (diff <= 0) {
      nextCommitTime = Date.now() + ms;
    }
  }, 1000);
}

/**
 * Performs a commit-and-push, always refreshing the OAuth token first.
 */
async function commitAndPush(
  repoPath: string,
  prefix: string,
  timeZone: string
) {
  if (!codingSummary) {
    return;
  }

  try {
    // 1) Refresh session and reset remote URL
    const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: true });
    const freshToken = session.accessToken;
    const freshOwner = session.account.label;
    const authRemote = `https://${freshOwner}:${freshToken}@github.com/${freshOwner}/${REPO_NAME}.git`;
    await git.remote(['set-url', 'origin', authRemote]);
    logMessage('🔄 Refreshed origin remote with latest token');

    // 2) Fetch & merge remote
    await git.fetch();
    logMessage('Fetched origin/main');
    await git.merge(['origin/main', '--strategy-option=theirs']);
    logMessage('Merged remote changes');

    // 3) Append summary
    const summaryFile = path.join(repoPath, SUMMARY_FILENAME);
    fs.appendFileSync(summaryFile, codingSummary, { encoding: 'utf8' });
    await git.add(SUMMARY_FILENAME);

    // 4) Commit with diff badge
    const badge = await metricsService.getDiffBadge(repoPath);
    const ts = new Date().toLocaleString(undefined, { timeZone });
    const commitMessage = `${prefix} ${badge}Coding activity summary - ${ts}`.trim();
    await git.commit(commitMessage);
    logMessage(`Committed: "${commitMessage}"`);

    // 5) Push using refreshed credentials
    await git.push('origin', 'main');
    logMessage('Pushed to origin/main successfully');

    // 6) Milestone notification
    commitCount++;
    if (commitCount % 10 === 0) {
      vscode.window.showInformationMessage(`🎉 Milestone reached: ${commitCount} commits!`);
    }
  } catch (err: any) {
    vscode.window.showErrorMessage(`Error during commit/push: ${err.message}`);
    logMessage(`Error during commit/push: ${err.message}`);
  } finally {
    // Reset in-memory summary
    codingSummary = '';
  }
}

/**
 * Ensures the GitHub repository exists.
 */
async function ensureRepoExists(octokit: Octokit, owner: string, repo: string): Promise<boolean> {
  try {
    await octokit.repos.get({ owner, repo });
    logMessage(`Repository "${repo}" exists for "${owner}".`);
    return true;
  } catch (e: any) {
    if (e.status === 404) {
      logMessage(`Creating repository "${repo}"...`);
      await octokit.repos.createForAuthenticatedUser({ name: repo, private: true, auto_init: true });
      logMessage(`Repository "${repo}" created.`);
      return true;
    }
    vscode.window.showErrorMessage(`Error checking repository: ${e.message}`);
    logMessage(`Error checking repository: ${e.message}`);
    return false;
  }
}

/**
 * Clones the repository if needed, and sets the authenticated remote URL.
 */
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

/**
 * Logs messages to the FlauntGitHubLog output channel.
 */
function logMessage(message: string) {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('FlauntGitHubLog');
    outputChannel.show(true);
  }
  const time = new Date().toLocaleTimeString();
  outputChannel.appendLine(`[${time}] ${message}`);
}