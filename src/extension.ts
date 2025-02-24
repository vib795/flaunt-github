import * as vscode from 'vscode';
import { Octokit } from '@octokit/rest';
import simpleGit, { SimpleGit } from 'simple-git';
import * as fs from 'fs';
import * as path from 'path';

let git: SimpleGit;
let codingSummary = '';
let outputChannel: vscode.OutputChannel | undefined;

// We'll store our commit timer in this variable
let commitTimer: NodeJS.Timeout | undefined;

const SUMMARY_FILENAME = 'coding_summary.txt';

export async function activate(context: vscode.ExtensionContext) {
  // Create the output channel once
  outputChannel = vscode.window.createOutputChannel('FlauntGitHubLog');
  logMessage('Flaunt GitHub: Extension Activated!');

  // 1. Retrieve settings
  const config = vscode.workspace.getConfiguration('codeTracking');
  const githubToken = config.get<string>('githubToken');
  const githubUsername = config.get<string>('githubUsername');
  const commitInterval = config.get<number>('commitInterval', 30); // default 30 minutes

  if (!githubToken || !githubUsername) {
    vscode.window.showErrorMessage(
      'Please set "codeTracking.githubToken" and "codeTracking.githubUsername" in VS Code Settings.'
    );
    return;
  }

  // 2. Initialize the GitHub API client
  const octokit = new Octokit({ auth: githubToken });
  const repoName = 'code-tracking';
  const owner = githubUsername;

  // 3. Ensure the GitHub repository exists
  const repoExists = await ensureRepoExists(octokit, owner, repoName);
  if (!repoExists) {
    return; // Repository creation failed
  }

  // 4. Prepare local clone
  const localRepoPath = path.join(context.globalStoragePath, repoName);
  await ensureLocalClone(localRepoPath, owner, repoName);

  // Initialize simple-git
  git = simpleGit(localRepoPath);

  // 5. Listen for file save events
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(document => {
      const timestamp = new Date().toLocaleString();
      const logLine = `[${timestamp}]: Saved ${document.fileName}`;
      codingSummary += logLine + '\n';
      logMessage(`Captured save event: ${logLine}`);
    })
  );

  // 6. Create initial commit timer
  createOrUpdateCommitTimer(commitInterval, localRepoPath);

  // 7. Listen for changes to the config, so we can update the timer if needed
  vscode.workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration('codeTracking.commitInterval')) {
      const newConfig = vscode.workspace.getConfiguration('codeTracking');
      const newInterval = newConfig.get<number>('commitInterval', 30);
      logMessage(`Detected new commit interval setting: ${newInterval} min`);
      vscode.window.showInformationMessage(`FlauntGitHub: Updating commit interval to ${newInterval} minute(s).`);

      createOrUpdateCommitTimer(newInterval, localRepoPath);
    }
  });

  // 8. Manual commit command
  const manualCommitCommand = vscode.commands.registerCommand('codeTracking.start', async () => {
    await commitAndPush(localRepoPath);
    vscode.window.showInformationMessage('Manual commit triggered!');
  });
  context.subscriptions.push(manualCommitCommand);

  logMessage(`Extension fully activated. Using local repo at: ${localRepoPath}`);
}

export function deactivate() {
  logMessage('Flaunt GitHub: Extension Deactivated');
}

/**
 * Creates or updates the periodic commit timer with the given interval (in minutes).
 * If an existing timer is running, it clears it first.
 */
function createOrUpdateCommitTimer(intervalMinutes: number, localRepoPath: string) {
  if (commitTimer) {
    clearInterval(commitTimer);
    logMessage(`Cleared previous commit timer.`);
  }
  const intervalMs = intervalMinutes * 60 * 1000;
  commitTimer = setInterval(async () => {
    await commitAndPush(localRepoPath);
  }, intervalMs);
  logMessage(`Created a new commit timer: every ${intervalMinutes} minute(s).`);
}

/**
 * Checks if a "code-tracking" repo exists for the user; creates if not found.
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
 * Ensures we have a local clone of the repo. Clones if folder doesn't exist.
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
 * Commits the in-memory summary to the local repo, merging remote changes first
 * with "--strategy-option=theirs" so that remote changes win if conflicts occur.
 */
async function commitAndPush(localRepoPath: string) {
  if (!codingSummary) {
    // Nothing to commit
    return;
  }

  try {
    // 1. Fetch latest from remote
    await git.fetch();
    logMessage('Fetched latest from origin/main.');

    // 2. Merge with "theirs" strategy
    await git.merge(['origin/main', '--strategy-option=theirs']);
    logMessage('Merged remote changes using "--strategy-option=theirs".');

    // 3. Append local summary to coding_summary.txt
    const summaryFilePath = path.join(localRepoPath, SUMMARY_FILENAME);
    fs.appendFileSync(summaryFilePath, codingSummary, { encoding: 'utf8' });
    logMessage('Appended in-memory summary to coding_summary.txt.');

    // 4. Add, commit, push
    await git.add(SUMMARY_FILENAME);
    const commitMessage = `Coding activity summary - ${new Date().toLocaleString()}`;
    await git.commit(commitMessage);
    await git.push('origin', 'main');

    logMessage(`Committed & pushed with message: "${commitMessage}".`);
  } catch (error: any) {
    vscode.window.showErrorMessage(`Error during commit/push: ${error.message}`);
    logMessage(`Error during commit/push: ${error.message}`);
  } finally {
    // Reset in-memory summary
    codingSummary = '';
  }
}

/**
 * Writes a message to the "FlauntGitHubLog" output channel.
 * Only created once in `activate()`, avoiding duplicates.
 */
function logMessage(msg: string) {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('FlauntGitHubLog');
  }
  const time = new Date().toLocaleTimeString();
  outputChannel.appendLine(`[${time}] ${msg}`);
}