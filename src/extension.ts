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
let saveDetectedSinceLastCommit = false;
let nextCommitTime = 0;
let commitCount = 0;
let metricsService: MetricsService;
let autoSaveInProgress = false;
let changedFilesSinceLastCommit = new Set<string>();

export async function activate(context: vscode.ExtensionContext) {
  metricsService = new MetricsService(context);

  // Create and show output channel
  outputChannel = vscode.window.createOutputChannel('FlauntGitHubLog');
  outputChannel.show(true);
  logMessage('Flaunt GitHub: Extension Activated!');

  // Create status bar item for countdown
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.text = 'Flaunt GitHub: Initializing...';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Ensure workspace is open
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('Please open a workspace folder to use Flaunt GitHub.');
    logMessage('No workspace folder open. Cannot initialize extension.');
    return;
  }

  // Fetch configuration
  const config = vscode.workspace.getConfiguration('codeTracking');
  const githubToken = config.get<string>('githubToken', '');
  const githubUsername = config.get<string>('githubUsername', '');
  const commitInterval = config.get<number>('commitInterval', 30);
  const commitMessagePrefix = config.get<string>('commitMessagePrefix', '');
  const timeZone = config.get<string>(
    'timeZone',
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const trackFileOpens = config.get<boolean>('trackFileOpens', false);

  // Validate GitHub configuration
  if (!githubToken || !githubUsername) {
    vscode.window.showErrorMessage(
      'Please configure your GitHub token and username in the settings (codeTracking.githubToken, codeTracking.githubUsername).'
    );
    logMessage('Missing GitHub token or username in configuration.');
    return;
  }

  // Authenticate with GitHub
  let octokit: Octokit;
  try {
    octokit = new Octokit({ auth: githubToken });
    const user = await octokit.users.getAuthenticated();
    logMessage(`Authenticated as ${user.data.login}`);
  } catch (e: any) {
    vscode.window.showErrorMessage('GitHub sign-in failed. Please check your token.');
    logMessage(`Authentication error: ${e.message}`);
    return;
  }

  // Ensure remote repo exists (create if missing)
  const repoOk = await ensureRepoExists(octokit, githubUsername, REPO_NAME);
  if (!repoOk) {
    logMessage('Remote repo not available; aborting initialization.');
    return;
  }

  // Clone or set up local repo
  const localRepoPath = path.join(context.globalStoragePath, REPO_NAME);
  await ensureLocalClone(localRepoPath, githubUsername, REPO_NAME, githubToken);
  git = simpleGit(localRepoPath);

  // Track file saves (only file:// URIs)
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(e => {
      const doc = e.document;
      if (doc.uri.scheme !== 'file') {
        return;
      }
      const wsFolder = vscode.workspace.workspaceFolders?.[0];
      const relPath = wsFolder
        ? path.relative(wsFolder.uri.fsPath, doc.uri.fsPath)
        : doc.fileName;
  
      changedFilesSinceLastCommit.add(relPath);
      // logMessage(`Edit detected in ${relPath}`);
    })
  );  

  // Track edits (even if autosave hides dirty state / save events)
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(e => {
      const doc = e.document;
      if (doc.uri.scheme !== 'file') {
        return;
      }
      const wsFolder = vscode.workspace.workspaceFolders?.[0];
      const relPath = wsFolder
        ? path.relative(wsFolder.uri.fsPath, doc.uri.fsPath)
        : doc.fileName;
      changedFilesSinceLastCommit.add(relPath);
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
        e.affectsConfiguration('codeTracking.timeZone') ||
        e.affectsConfiguration('codeTracking.trackFileOpens')
      ) {
        const newConfig = vscode.workspace.getConfiguration('codeTracking');
        const newCommitInterval = newConfig.get<number>('commitInterval', commitInterval);
        const newCommitPrefix = newConfig.get<string>(
          'commitMessagePrefix',
          commitMessagePrefix
        );
        const newTimeZone = newConfig.get<string>(
          'timeZone',
          Intl.DateTimeFormat().resolvedOptions().timeZone
        );
        const newTrackFileOpens = newConfig.get<boolean>('trackFileOpens', trackFileOpens);

        createOrUpdateCommitTimer(newCommitInterval, localRepoPath, newCommitPrefix, newTimeZone);

        if (newTrackFileOpens !== trackFileOpens) {
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
      const languageCounts = metricsService.getLanguageCounts();
      const sessions = metricsService.getSessions();
      const summaryFile = path.join(localRepoPath, SUMMARY_FILENAME);

      const wsFolder = vscode.workspace.workspaceFolders?.[0];
      let workspaceDiff = { added: 0, removed: 0 };
      try {
        if (wsFolder) {
          const gitRoot = wsFolder.uri.fsPath;
          const diff = await simpleGit(gitRoot).diffSummary();
          workspaceDiff = {
            added: diff.insertions,
            removed: diff.deletions
          };
        }
      } catch (err: any) {
        logMessage(`Error fetching workspace diff: ${err.message}`);
      }

      const summaryDiff = await metricsService.getDiffSummary(localRepoPath);

      const dedup: [string, number][] = [];
      const seen = new Set<string>();
      for (const s of sessions) {
        if (!seen.has(s.fileName)) {
          seen.add(s.fileName);
          dedup.push([s.fileName, s.totalSeconds]);
        }
      }

      outputChannel.appendLine('\n=== 📊 Flaunt GitHub Metrics ===');
      outputChannel.appendLine('• Language save counts:');
      for (const [lang, count] of Object.entries(languageCounts)) {
        outputChannel.appendLine(`    ${lang}: ${count}`);
      }
      outputChannel.appendLine('• Session durations:');
      for (const [name, secs] of dedup) {
        outputChannel.appendLine(`    ${name}: ${fmtDuration(secs)}`);
      }
      outputChannel.appendLine(`• Summary repo diff: +${summaryDiff.added}/−${summaryDiff.removed}`);
      if (wsFolder) {
        outputChannel.appendLine(`• Workspace diff: +${workspaceDiff.added}/−${workspaceDiff.removed}`);
      }
      outputChannel.appendLine(`• Summary file: ${summaryFile}`);
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

  commitTimer = setInterval(async () => {
    try {
      if (!saveDetectedSinceLastCommit && changedFilesSinceLastCommit.size > 0) {
        logMessage(
          'No manual save detected, but edits were made this interval; auto-saving before commit.'
        );

        const ts = new Date().toLocaleString(undefined, { timeZone });
        const wsFolder = vscode.workspace.workspaceFolders?.[0];

        // Log edited files into the summary as an "auto-snapshot"
        for (const relPath of changedFilesSinceLastCommit) {
          const line = `[${ts}]: Auto-snapshot ${relPath}`;
          codingSummary += line + '\n';
          logMessage(line);

          if (wsFolder) {
            const doc = vscode.workspace.textDocuments.find(
              d =>
                d.uri.scheme === 'file' &&
                path.relative(wsFolder.uri.fsPath, d.uri.fsPath) === relPath
            );
            if (doc) {
              metricsService.trackLanguage(doc);
            }
          }
        }

        // Perform auto-save; onDidSave will fire, but we suppress extra logging there
        autoSaveInProgress = true;
        try {
          await vscode.workspace.saveAll(false);
        } finally {
          autoSaveInProgress = false;
        }
      } else if (!saveDetectedSinceLastCommit && changedFilesSinceLastCommit.size === 0) {
        logMessage('No manual save and no edits this interval; nothing to auto-save.');
      }

      // Now behave as before: commit only if codingSummary has content
      await commitAndPush(repoPath, prefix, timeZone);
    } catch (err: any) {
      logMessage(`Commit timer error: ${err?.message ?? String(err)}`);
    } finally {
      // reset flags for the next interval
      saveDetectedSinceLastCommit = false;
      changedFilesSinceLastCommit.clear();
    }
  }, ms);

  logMessage(`Created new commit timer: every ${intervalMinutes} minute(s).`);

  if (countdownTimer) {
    clearInterval(countdownTimer);
  }
  countdownTimer = setInterval(() => {
    const diff = Math.max(nextCommitTime - Date.now(), 0);
    const m = Math.floor(diff / 60000),
      s = Math.floor((diff % 60000) / 1000);
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
    logMessage('No coding summary recorded this interval; skipping commit/push.');
    return;
  }

  try {
    // Use whatever remote was set in ensureLocalClone (PAT-based)
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

async function ensureRepoExists(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<boolean> {
  try {
    await octokit.repos.get({ owner, repo });
    logMessage(`Repo "${repo}" exists for "${owner}".`);
    return true;
  } catch (e: any) {
    if (e.status === 404) {
      logMessage(`Creating repo "${repo}"...`);
      await octokit.repos.createForAuthenticatedUser({
        name: repo,
        private: true,
        auto_init: true
      });
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

function fmtDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s || parts.length === 0) parts.push(`${s}s`);
  return parts.join(' ');
}

function logMessage(message: string) {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('FlauntGitHubLog');
    outputChannel.show(true);
  }
  const time = new Date().toLocaleTimeString();
  outputChannel.appendLine(`[${time}] ${message}`);
}
