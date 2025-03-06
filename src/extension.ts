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
  // Create the output channel (only once)
  outputChannel = vscode.window.createOutputChannel('FlauntGitHubLog');
  logMessage('Flaunt GitHub: Extension Activated!');

  // Create a status bar item to show next commit countdown
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.tooltip = 'Time until next commit';
  statusBarItem.show();

  // Retrieve user settings from VS Code Settings (settings.json)
  const config = vscode.workspace.getConfiguration('codeTracking');
  const githubToken = config.get<string>('githubToken');
  const githubUsername = config.get<string>('githubUsername');
  const commitInterval = config.get<number>('commitInterval', 30); // in minutes, default 30
  const commitMessagePrefix = config.get<string>('commitMessagePrefix', '');
  const timeZone = config.get<string>('timeZone', Intl.DateTimeFormat().resolvedOptions().timeZone);
  const trackFileOpens = config.get<boolean>('trackFileOpens', false); // new setting
  // const commitIntervalMs = commitInterval * 60 * 1000;

  if (!githubToken || !githubUsername) {
    vscode.window.showErrorMessage(
      'Please set "codeTracking.githubToken" and "codeTracking.githubUsername" in Settings.'
    );
    return;
  }

  // Initialize the GitHub API client
  const octokit = new Octokit({ auth: githubToken });
  const repoName = 'code-tracking';
  const owner = githubUsername;

  // Ensure the GitHub repository exists; create if not
  const repoExists = await ensureRepoExists(octokit, owner, repoName);
  if (!repoExists) {
    return;
  }

  // Prepare local clone of the repository
  const localRepoPath = path.join(context.globalStoragePath, repoName);
  await ensureLocalClone(localRepoPath, owner, repoName);

  // Initialize simple-git in the local repo
  git = simpleGit(localRepoPath);

  // Listen for file save events to accumulate coding summary
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(document => {
      const timestamp = new Date().toLocaleString(undefined, { timeZone });
      const logLine = `[${timestamp}]: Saved ${document.fileName}`;
      codingSummary += logLine + '\n';
      logMessage(`Captured save event: ${logLine}`);
    })
  );

  // (Optional) Log file open events, if user enabled it
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

  // Create the commit timer (and status bar countdown) using the current interval
  createOrUpdateCommitTimer(commitInterval, localRepoPath, commitMessagePrefix, timeZone);

  // Listen for configuration changes so that the commit interval, prefix, or trackFileOpens update dynamically
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

      logMessage(`Detected updated settings: commitInterval = ${newInterval} min, prefix = "${newPrefix}", trackFileOpens = ${newTrackOpens}`);
      vscode.window.showInformationMessage(`FlauntGitHub: Updating settings...`);

      // Recreate the commit timer
      createOrUpdateCommitTimer(newInterval, localRepoPath, newPrefix, timeZone);

      // If the user toggled trackFileOpens, we can't dynamically unhook existing listeners,
      // but we can warn them that a reload might be needed to fully apply changes.
      if (newTrackOpens !== trackFileOpens) {
        vscode.window.showInformationMessage(
          'FlauntGitHub: Changes to "trackFileOpens" will apply after a reload.'
        );
      }
    }
  });

  // Register a manual commit command (trigger via Command Palette)
  const manualCommitCommand = vscode.commands.registerCommand('codeTracking.start', async () => {
    await commitAndPush(localRepoPath, commitMessagePrefix, timeZone);
    vscode.window.showInformationMessage('Manual commit triggered!');
  });
  context.subscriptions.push(manualCommitCommand);

  logMessage(`Extension fully activated. Using local repo at: ${localRepoPath}`);
}

export function deactivate() {
  logMessage('Flaunt GitHub: Extension Deactivated');
  if (statusBarItem) {
    statusBarItem.dispose();
  }
  if (commitTimer) {
    clearInterval(commitTimer);
  }
  if (countdownTimer) {
    clearInterval(countdownTimer);
  }
}

/**
 * Creates or updates the periodic commit timer and status bar countdown.
 * When the timer is set, nextCommitTime is updated accordingly.
 */
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

  // Update status bar countdown every second
  if (countdownTimer) {
    clearInterval(countdownTimer);
  }
  countdownTimer = setInterval(() => {
    const now = Date.now();
    const diff = Math.max(nextCommitTime - now, 0);
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    statusBarItem.text = `Next commit in ${minutes}m ${seconds}s`;
    if (diff <= 0) {
      nextCommitTime = Date.now() + intervalMs;
    }
  }, 1000);
}

/**
 * Commits the in-memory coding summary to the local repository.
 * It fetches and merges remote changes using "--strategy-option=theirs" to avoid manual conflicts,
 * then appends the local summary to the summary file, commits, and pushes the changes.
 */
async function commitAndPush(localRepoPath: string, commitMessagePrefix: string, timeZone: string) {
  if (!codingSummary) {
    return;
  }
  try {
    // Fetch latest changes from remote
    await git.fetch();
    logMessage('Fetched latest from origin/main.');
    // Merge using "theirs" strategy to auto-resolve conflicts in favor of remote changes
    await git.merge(['origin/main', '--strategy-option=theirs']);
    logMessage('Merged remote changes using "--strategy-option=theirs".');

    // Append the in-memory coding summary to the summary file
    const summaryFilePath = path.join(localRepoPath, SUMMARY_FILENAME);
    fs.appendFileSync(summaryFilePath, codingSummary, { encoding: 'utf8' });
    logMessage('Appended in-memory summary to coding_summary.txt.');

    // Stage, commit, and push changes
    await git.add(SUMMARY_FILENAME);
    const timestamp = new Date().toLocaleString(undefined, { timeZone });
    const commitMessage = `${commitMessagePrefix} Coding activity summary - ${timestamp}`.trim();
    await git.commit(commitMessage);
    await git.push('origin', 'main');
    logMessage(`Committed & pushed with message: "${commitMessage}".`);

    commitCount++;
    // Milestone notification every 10 commits
    if (commitCount % 10 === 0) {
      vscode.window.showInformationMessage(`Milestone reached: ${commitCount} commits! Keep up the great work!`);
    }
  } catch (error: any) {
    vscode.window.showErrorMessage(`Error during commit/push: ${error.message}`);
    logMessage(`Error during commit/push: ${error.message}`);
  } finally {
    // Reset the in-memory summary
    codingSummary = '';
  }
}

/**
 * Checks if the "code-tracking" repository exists on GitHub.
 * If not found, attempts to create a private repository with auto_init.
 */
async function ensureRepoExists(octokit: Octokit, owner: string, repo: string): Promise<boolean> {
  try {
    await octokit.repos.get({ owner, repo });
    logMessage(`Repository "${repo}" already exists for user "${owner}".`);
    return true;
  } catch (error: any) {
    if (error.status === 404) {
      logMessage(`Repository "${repo}" not found. Creating a private repo...`);
      try {
        await octokit.repos.createForAuthenticatedUser({
          name: repo,
          private: true,
          auto_init: true
        });
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

/**
 * Ensures a local clone of the repository exists.
 * If the folder does not exist, it clones the repository from GitHub.
 */
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

/**
 * Logs a message to the "FlauntGitHubLog" output channel.
 */
function logMessage(message: string) {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('FlauntGitHubLog');
  }
  const time = new Date().toLocaleTimeString();
  outputChannel.appendLine(`[${time}] ${message}`);
}
