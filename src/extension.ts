import * as vscode from 'vscode';
import { Octokit } from '@octokit/rest';
import simpleGit, { SimpleGit } from 'simple-git';
import * as fs from 'fs';
import * as path from 'path';

let git: SimpleGit;
let codingSummary = '';
let outputChannel: vscode.OutputChannel | undefined;
let commitTimer: NodeJS.Timeout | undefined;
let countdownTimer: NodeJS.Timeout | undefined;
let statusBarItem: vscode.StatusBarItem;
let nextCommitTime: number = 0;
let commitCount: number = 0;

const SUMMARY_FILENAME = 'coding_summary.txt';

export async function activate(context: vscode.ExtensionContext) {
  // Create the output channel and show it automatically
  outputChannel = vscode.window.createOutputChannel('FlauntGitHubLog');
  outputChannel.show(true);
  logMessage('Flaunt GitHub: Extension Activated!');

  // Create a status bar item to show the countdown until the next commit
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.tooltip = 'Time until next commit';
  statusBarItem.show();

  // Get GitHub authentication session using the built-in GitHub provider.
  let githubToken: string | undefined;
  let githubUsername: string | undefined;
  try {
    const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: true });
    if (session) {
      githubToken = session.accessToken;
      githubUsername = session.account.label;
      logMessage(`Authenticated as ${githubUsername}`);
    }
  } catch (authError: any) {
    vscode.window.showErrorMessage('GitHub authentication failed. Please sign in.');
    logMessage(`GitHub authentication failed: ${authError.message}`);
    return;
  }

  if (!githubToken || !githubUsername) {
    vscode.window.showErrorMessage('GitHub token or username is missing. Please sign in.');
    return;
  }

  // Retrieve additional user settings
  const config = vscode.workspace.getConfiguration('codeTracking');
  const commitInterval = config.get<number>('commitInterval', 30);
  const commitMessagePrefix = config.get<string>('commitMessagePrefix', '');
  const timeZone = config.get<string>('timeZone', Intl.DateTimeFormat().resolvedOptions().timeZone);
  const trackFileOpens = config.get<boolean>('trackFileOpens', false);

  // Initialize Octokit and repository info
  const octokit = new Octokit({ auth: githubToken });
  const repoName = 'code-tracking';
  const owner = githubUsername;

  const repoExists = await ensureRepoExists(octokit, owner, repoName);
  if (!repoExists) return;

  const localRepoPath = path.join(context.globalStoragePath, repoName);
  await ensureLocalClone(localRepoPath, owner, repoName);

  git = simpleGit(localRepoPath);

  // Listen for file save events
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(document => {
      const timestamp = new Date().toLocaleString(undefined, { timeZone });
      const logLine = `[${timestamp}]: Saved ${document.fileName}`;
      codingSummary += logLine + '\n';
      logMessage(`Captured save event: ${logLine}`);
    })
  );

  // Optionally, listen for file open events
  if (trackFileOpens) {
    context.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument(document => {
        const timestamp = new Date().toLocaleString(undefined, { timeZone });
        const logLine = `[${timestamp}]: Opened ${document.fileName}`;
        codingSummary += logLine + '\n';
        logMessage(`Captured open event: ${logLine}`);
      })
    );
  }

  // Create commit timer and status bar countdown
  createOrUpdateCommitTimer(commitInterval, localRepoPath, commitMessagePrefix, timeZone);

  // Listen for configuration changes to update settings dynamically
  vscode.workspace.onDidChangeConfiguration(event => {
    if (
      event.affectsConfiguration('codeTracking.commitInterval') ||
      event.affectsConfiguration('codeTracking.commitMessagePrefix') ||
      event.affectsConfiguration('codeTracking.trackFileOpens')
    ) {
      const newConfig = vscode.workspace.getConfiguration('codeTracking');
      const newInterval = newConfig.get<number>('commitInterval', 30);
      const newPrefix = newConfig.get<string>('commitMessagePrefix', '');
      const newTrackOpens = newConfig.get<boolean>('trackFileOpens', false);
      logMessage(`Updated settings: commitInterval = ${newInterval} min, prefix = "${newPrefix}", trackFileOpens = ${newTrackOpens}`);
      vscode.window.showInformationMessage('FlauntGitHub: Updating settings...');
      createOrUpdateCommitTimer(newInterval, localRepoPath, newPrefix, timeZone);
      if (newTrackOpens !== trackFileOpens) {
        vscode.window.showInformationMessage('Changes to "trackFileOpens" will apply after a reload.');
      }
    }
  });

  // Register manual commit command
  const manualCommitCommand = vscode.commands.registerCommand('codeTracking.start', async () => {
    await commitAndPush(localRepoPath, commitMessagePrefix, timeZone);
    vscode.window.showInformationMessage('Manual commit triggered!');
  });
  context.subscriptions.push(manualCommitCommand);

  logMessage(`Extension fully activated. Using local repo at: ${localRepoPath}`);
}

export function deactivate() {
  logMessage('Flaunt GitHub: Extension Deactivated');
  if (statusBarItem) statusBarItem.dispose();
  if (commitTimer) clearInterval(commitTimer);
  if (countdownTimer) clearInterval(countdownTimer);
}

function createOrUpdateCommitTimer(intervalMinutes: number, localRepoPath: string, commitMessagePrefix: string, timeZone: string) {
  if (commitTimer) {
    clearInterval(commitTimer);
    logMessage('Cleared previous commit timer.');
  }
  const intervalMs = intervalMinutes * 60 * 1000;
  nextCommitTime = Date.now() + intervalMs;
  commitTimer = setInterval(async () => {
    await commitAndPush(localRepoPath, commitMessagePrefix, timeZone);
  }, intervalMs);
  logMessage(`Created new commit timer: every ${intervalMinutes} minute(s).`);

  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    const now = Date.now();
    const diff = Math.max(nextCommitTime - now, 0);
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    statusBarItem.text = `Next commit in ${minutes}m ${seconds}s`;
    if (diff <= 0) nextCommitTime = Date.now() + intervalMs;
  }, 1000);
}

async function commitAndPush(localRepoPath: string, commitMessagePrefix: string, timeZone: string) {
  if (!codingSummary) return;
  try {
    await git.fetch();
    logMessage('Fetched latest from origin/main.');
    await git.merge(['origin/main', '--strategy-option=theirs']);
    logMessage('Merged remote changes using "--strategy-option=theirs".');

    const summaryFilePath = path.join(localRepoPath, SUMMARY_FILENAME);
    fs.appendFileSync(summaryFilePath, codingSummary, { encoding: 'utf8' });
    logMessage('Appended in-memory summary to coding_summary.txt.');

    await git.add(SUMMARY_FILENAME);
    const timestamp = new Date().toLocaleString(undefined, { timeZone });
    const commitMessage = `${commitMessagePrefix} Coding activity summary - ${timestamp}`.trim();
    await git.commit(commitMessage);
    await git.push('origin', 'main');
    logMessage(`Committed & pushed with message: "${commitMessage}".`);

    commitCount++;
    if (commitCount % 10 === 0) {
      vscode.window.showInformationMessage(`Milestone reached: ${commitCount} commits! Keep up the great work!`);
    }
  } catch (error: any) {
    vscode.window.showErrorMessage(`Error during commit/push: ${error.message}`);
    logMessage(`Error during commit/push: ${error.message}`);
  } finally {
    codingSummary = '';
  }
}

async function ensureRepoExists(octokit: Octokit, owner: string, repo: string): Promise<boolean> {
  try {
    await octokit.repos.get({ owner, repo });
    logMessage(`Repository "${repo}" already exists for user "${owner}".`);
    return true;
  } catch (error: any) {
    if (error.status === 404) {
      logMessage(`Repository "${repo}" not found. Creating a private repo...`);
      try {
        await octokit.repos.createForAuthenticatedUser({ name: repo, private: true, auto_init: true });
        logMessage(`Repository "${repo}" created successfully.`);
        return true;
      } catch (creationError: any) {
        vscode.window.showErrorMessage(`Failed to create repository: ${creationError.message}`);
        logMessage(`Failed to create repository: ${creationError.message}`);
        return false;
      }
    } else {
      vscode.window.showErrorMessage(`Error checking repository: ${error.message}`);
      logMessage(`Error checking repository: ${error.message}`);
      return false;
    }
  }
}

async function ensureLocalClone(localRepoPath: string, owner: string, repo: string) {
  if (!fs.existsSync(localRepoPath)) {
    fs.mkdirSync(localRepoPath, { recursive: true });
    const tmpGit = simpleGit();
    try {
      logMessage(`Cloning "https://github.com/${owner}/${repo}.git" into "${localRepoPath}"...`);
      await tmpGit.clone(`https://github.com/${owner}/${repo}.git`, localRepoPath);
      logMessage('Clone successful.');
    } catch (cloneError: any) {
      vscode.window.showErrorMessage(`Failed to clone repository: ${cloneError.message}`);
      logMessage(`Failed to clone repository: ${cloneError.message}`);
    }
  } else {
    logMessage(`Local repo folder already exists at "${localRepoPath}". Using existing clone.`);
  }
}

function logMessage(message: string) {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('FlauntGitHubLog');
    outputChannel.show(true);
  }
  const time = new Date().toLocaleTimeString();
  outputChannel.appendLine(`[${time}] ${message}`);
}
