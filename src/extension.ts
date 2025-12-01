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
let metricsService: MetricsService;

let saveDetectedSinceLastCommit = false;
let autoSaveInProgress = false;
let nextCommitTime = 0;
let commitCount = 0;

/**
 * Resolve GitHub credentials in this order:
 * 1) Secret storage
 * 2) Settings (codeTracking.githubToken / codeTracking.githubUsername)
 * 3) VS Code GitHub auth provider
 */
async function getGitHubCredentials(
  context: vscode.ExtensionContext
): Promise<{ token: string; username: string }> {
  const secrets = context.secrets;
  let token = await secrets.get('codeTracking.githubToken');
  let username = await secrets.get('codeTracking.githubUsername');

  const config = vscode.workspace.getConfiguration('codeTracking');

  // 1) Secret storage
  if (token && username) {
    return { token, username };
  }

  // 2) Settings fallback
  const cfgToken = config.get<string>('githubToken', '');
  const cfgUser = config.get<string>('githubUsername', '');
  if (cfgToken && cfgUser) {
    await secrets.store('codeTracking.githubToken', cfgToken);
    await secrets.store('codeTracking.githubUsername', cfgUser);
    return { token: cfgToken, username: cfgUser };
  }

  // 3) VS Code GitHub auth provider
  const session = await vscode.authentication.getSession(
    'github',
    ['read:user', 'repo'],
    { createIfNone: true }
  );
  const accessToken = session.accessToken;

  const octokit = new Octokit({ auth: accessToken });
  const user = await octokit.users.getAuthenticated();
  const login = user.data.login;

  await secrets.store('codeTracking.githubToken', accessToken);
  await secrets.store('codeTracking.githubUsername', login);

  return { token: accessToken, username: login };
}

export async function activate(context: vscode.ExtensionContext) {
  metricsService = new MetricsService(context);

  // Output channel
  outputChannel = vscode.window.createOutputChannel('FlauntGitHubLog');
  outputChannel.show(true);
  logMessage('Flaunt GitHub: Extension Activated!');

  // Status bar countdown
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBarItem.text = 'Flaunt GitHub: Initializing...';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Require a workspace
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage(
      'Please open a workspace folder to use Flaunt GitHub.'
    );
    logMessage('No workspace folder open. Cannot initialize extension.');
    return;
  }

  // Config (non-auth)
  const config = vscode.workspace.getConfiguration('codeTracking');
  const commitInterval = config.get<number>('commitInterval', 30);
  const commitMessagePrefix = config.get<string>('commitMessagePrefix', '');
  const timeZone = config.get<string>(
    'timeZone',
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const trackFileOpens = config.get<boolean>('trackFileOpens', false);

  // Resolve GitHub credentials
  let githubToken: string;
  let githubUsername: string;
  try {
    ({ token: githubToken, username: githubUsername } =
      await getGitHubCredentials(context));
  } catch (e: any) {
    vscode.window.showErrorMessage(
      'GitHub sign-in failed. Flaunt GitHub needs GitHub access to work.'
    );
    logMessage(`Authentication error resolving credentials: ${e?.message ?? e}`);
    return;
  }

  // Sanity auth check
  let octokit: Octokit;
  try {
    octokit = new Octokit({ auth: githubToken });
    const user = await octokit.users.getAuthenticated();
    logMessage(`Authenticated as ${user.data.login}`);
  } catch (e: any) {
    vscode.window.showErrorMessage(
      'GitHub sign-in failed. Please check your credentials.'
    );
    logMessage(`Authentication error: ${e.message}`);
    return;
  }

  // Ensure remote repo exists
  const repoOk = await ensureRepoExists(octokit, githubUsername, REPO_NAME);
  if (!repoOk) {
    logMessage('Remote repo not available; aborting initialization.');
    return;
  }

  // Clone or set up local repo
  const localRepoPath = path.join(context.globalStoragePath, REPO_NAME);
  await ensureLocalClone(localRepoPath, githubUsername, REPO_NAME, githubToken);
  git = simpleGit(localRepoPath);

  // Track manual saves (file:// only)
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(doc => {
      if (doc.uri.scheme !== 'file') {
        return;
      }

      // Ignore saves triggered by our own auto-save cycle
      if (autoSaveInProgress) {
        return;
      }

      // Mark that we saw at least one save this interval
      saveDetectedSinceLastCommit = true;

      const ts = new Date().toLocaleString(undefined, { timeZone });
      const relPath = vscode.workspace.workspaceFolders?.[0]
        ? path.relative(
            vscode.workspace.workspaceFolders[0].uri.fsPath,
            doc.uri.fsPath
          )
        : doc.fileName;
      const line = `[${ts}]: Saved ${relPath}`;
      codingSummary += line + '\n';
      logMessage(line);
      metricsService.trackLanguage(doc);
    })
  );

  // Optional: track file opens
  if (trackFileOpens) {
    context.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument(doc => {
        if (doc.uri.scheme !== 'file') {
          return;
        }
        const ts = new Date().toLocaleString(undefined, { timeZone });
        const relPath = vscode.workspace.workspaceFolders?.[0]
          ? path.relative(
              vscode.workspace.workspaceFolders[0].uri.fsPath,
              doc.uri.fsPath
            )
          : doc.fileName;
        const line = `[${ts}]: Opened ${relPath}`;
        codingSummary += line + '\n';
        logMessage(line);
      })
    );
  }

  // Session tracking
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

  // Start periodic commits
  createOrUpdateCommitTimer(
    commitInterval,
    localRepoPath,
    commitMessagePrefix,
    timeZone
  );

  // React to config changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (
        e.affectsConfiguration('codeTracking.commitInterval') ||
        e.affectsConfiguration('codeTracking.commitMessagePrefix') ||
        e.affectsConfiguration('codeTracking.timeZone') ||
        e.affectsConfiguration('codeTracking.trackFileOpens')
      ) {
        const nc = vscode.workspace.getConfiguration('codeTracking');
        const ni = nc.get<number>('commitInterval', commitInterval);
        const np = nc.get<string>('commitMessagePrefix', commitMessagePrefix);
        const ntz = nc.get<string>(
          'timeZone',
          Intl.DateTimeFormat().resolvedOptions().timeZone
        );
        const ntf = nc.get<boolean>('trackFileOpens', trackFileOpens);

        logMessage(
          `Settings updated → interval=${ni}, prefix="${np}", trackOpens=${ntf}, timeZone=${ntz}`
        );
        createOrUpdateCommitTimer(ni, localRepoPath, np, ntz);

        if (ntf !== trackFileOpens) {
          vscode.window.showInformationMessage(
            'Reload VS Code to apply file-open tracking changes.'
          );
        }
      }
    })
  );

  // Manual commit
  context.subscriptions.push(
    vscode.commands.registerCommand('codeTracking.start', async () => {
      await commitAndPush(localRepoPath, commitMessagePrefix, timeZone);
      vscode.window.showInformationMessage('Flaunt GitHub: Manual commit executed.');
    })
  );

  // Metrics command
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
      outputChannel.appendLine(
        `• Summary repo diff: +${summaryDiff.added}/−${summaryDiff.removed}`
      );
      if (wsFolder) {
        outputChannel.appendLine(
          `• Workspace diff: +${workspaceDiff.added}/−${workspaceDiff.removed}`
        );
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

/**
 * At each tick:
 *  - If no manual saves, look for dirty docs and auto-snapshot them.
 *  - If codingSummary is still empty, fall back to checking workspace Git diff.
 *  - Then call commitAndPush (which only acts when codingSummary is non-empty).
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

  commitTimer = setInterval(async () => {
    try {
      // 1) If no manual save, look for dirty in-memory docs and auto-snapshot them
      if (!saveDetectedSinceLastCommit) {
        const dirtyDocs = vscode.workspace.textDocuments.filter(
          d => d.isDirty && d.uri.scheme === 'file'
        );

        if (dirtyDocs.length > 0) {
          logMessage(
            `No manual save detected, but ${dirtyDocs.length} dirty file(s) found; auto-saving before commit.`
          );

          const ts = new Date().toLocaleString(undefined, { timeZone });
          const wsFolder = vscode.workspace.workspaceFolders?.[0];

          for (const doc of dirtyDocs) {
            const relPath = wsFolder
              ? path.relative(wsFolder.uri.fsPath, doc.uri.fsPath)
              : doc.fileName;
            const line = `[${ts}]: Auto-snapshot ${relPath}`;
            codingSummary += line + '\n';
            logMessage(line);
            metricsService.trackLanguage(doc);
          }

          autoSaveInProgress = true;
          try {
            await vscode.workspace.saveAll(false);
          } finally {
            autoSaveInProgress = false;
          }
        } else {
          logMessage(
            'No manual save and no dirty files this interval; nothing to auto-save.'
          );
        }
      }

      // 2) If we still have no summary lines, check workspace Git diff as a fallback
      if (!codingSummary) {
        await snapshotWorkspaceDiff(timeZone);
      }

      // 3) Commit and push if we recorded anything
      await commitAndPush(repoPath, prefix, timeZone);
    } catch (err: any) {
      logMessage(`Commit timer error: ${err?.message ?? String(err)}`);
    } finally {
      saveDetectedSinceLastCommit = false;
    }
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
 * Fallback: if we didn't see saves or dirty docs, but the workspace Git
 * diff has changes (M files, etc.), we still log something so that the
 * interval produces a commit.
 */
async function snapshotWorkspaceDiff(timeZone: string) {
  const wsFolder = vscode.workspace.workspaceFolders?.[0];
  if (!wsFolder) return;

  try {
    const gitRoot = wsFolder.uri.fsPath;
    const wsGit = simpleGit(gitRoot);
    const diff = await wsGit.diffSummary();

    const added = diff.insertions || 0;
    const removed = diff.deletions || 0;

    if (added === 0 && removed === 0 && diff.files.length === 0) {
      logMessage('Workspace diff clean; no fallback snapshot needed.');
      return;
    }

    const ts = new Date().toLocaleString(undefined, { timeZone });
    const line = `[${ts}]: Workspace diff snapshot (+${added}/−${removed})`;
    codingSummary += line + '\n';
    logMessage(line);
  } catch (err: any) {
    logMessage(`Error checking workspace diff for fallback: ${err.message}`);
  }
}

/**
 * Commit & push only when codingSummary has content.
 */
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
    await git.fetch();
    logMessage('Fetched origin/main');
    await git.merge(['origin/main', '--strategy-option=theirs']);
    logMessage('Merged remote changes');

    const summaryFile = path.join(repoPath, SUMMARY_FILENAME);
    fs.appendFileSync(summaryFile, codingSummary, { encoding: 'utf8' });
    await git.add(SUMMARY_FILENAME);
    logMessage('Updated coding summary file and staged changes.');

    const badge = await metricsService.getDiffBadge(repoPath);
    const ts = new Date().toLocaleString(undefined, { timeZone });
    const msg = `${prefix} ${badge}Coding activity summary - ${ts}`.trim();
    await git.commit(msg);
    logMessage(`Committed: "${msg}"`);

    await git.push('origin', 'main');
    logMessage('Pushed to origin/main successfully.');

    commitCount++;
    if (commitCount % 10 === 0) {
      vscode.window.showInformationMessage(
        `🎉 Milestone reached: ${commitCount} Flaunt GitHub commits!`
      );
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
  const safeRemote = `https://github.com/${owner}/${repo}.git`;

  if (!fs.existsSync(localRepoPath)) {
    fs.mkdirSync(localRepoPath, { recursive: true });
    logMessage(`Cloning ${safeRemote} into ${localRepoPath}...`);
    await simpleGit().clone(authRemote, localRepoPath);
    logMessage('Clone successful.');
  }

  git = simpleGit(localRepoPath);
  await git.remote(['set-url', 'origin', authRemote]);
  logMessage(`Authenticated remote URL set to ${safeRemote}.`);
}

function fmtDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
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
