import * as vscode from 'vscode';
import { Octokit } from '@octokit/rest';
import simpleGit, { SimpleGit } from 'simple-git';
import * as path from 'path';
import * as fs from 'fs';

let git: SimpleGit;
const SUMMARY_FILENAME = 'coding_summary.txt';
let codingSummary: string = '';
let outputChannel: vscode.OutputChannel;

export async function activate(context: vscode.ExtensionContext) {
  // Create and show the output channel.
  outputChannel = vscode.window.createOutputChannel("FlauntGitHubLog");
  outputChannel.show(true);
  outputChannel.appendLine("Activating Code Tracking Extension...");

  vscode.window.showInformationMessage('Code Tracking Extension Activated!');
  outputChannel.appendLine("Info: Code Tracking Extension Activated!");

  // Retrieve settings (GitHub token, username, and optional timezone override).
  const githubToken = vscode.workspace.getConfiguration().get<string>('codeTracking.githubToken');
  const githubUsername = vscode.workspace.getConfiguration().get<string>('codeTracking.githubUsername');
  const configuredTimeZone = vscode.workspace.getConfiguration().get<string>('codeTracking.timeZone');
  // Auto-detect the system timezone if no configuration is provided.
  const effectiveTimeZone = configuredTimeZone || Intl.DateTimeFormat().resolvedOptions().timeZone; 

  if (!githubToken || !githubUsername) {
    const errorMsg = 'GitHub token and username must be set in settings (codeTracking.githubToken and codeTracking.githubUsername).';
    vscode.window.showErrorMessage(errorMsg);
    outputChannel.appendLine(`Error: ${errorMsg}`);
    return;
  }

  // Initialize Octokit.
  const octokit = new Octokit({ auth: githubToken });
  const repoName = 'code-tracking';

  // Check if the repository exists on GitHub.
  try {
    await octokit.repos.get({ owner: githubUsername, repo: repoName });
    vscode.window.showInformationMessage(`Repository '${repoName}' exists.`);
    outputChannel.appendLine(`Repository '${repoName}' exists.`);
  } catch (error: any) {
    if (error.status === 404) {
      try {
        await octokit.repos.createForAuthenticatedUser({
          name: repoName,
          auto_init: true,
          private: true
        });
        vscode.window.showInformationMessage(`Repository '${repoName}' created successfully.`);
        outputChannel.appendLine(`Repository '${repoName}' created successfully.`);
      } catch (createError: any) {
        const errMsg = `Failed to create repository: ${createError.message}`;
        vscode.window.showErrorMessage(errMsg);
        outputChannel.appendLine(`Error: ${errMsg}`);
        return;
      }
    } else {
      const errMsg = `Error checking repository: ${error.message}`;
      vscode.window.showErrorMessage(errMsg);
      outputChannel.appendLine(`Error: ${errMsg}`);
      return;
    }
  }

  // Set up a local directory for the repository using the extension's global storage path.
  const localRepoPath = path.join(context.globalStoragePath, repoName);
  outputChannel.appendLine(`Local repository path: ${localRepoPath}`);

  // Verify that the local folder is a valid Git repository.
  const gitFolderPath = path.join(localRepoPath, ".git");
  if (!fs.existsSync(localRepoPath) || !fs.existsSync(gitFolderPath)) {
    if (fs.existsSync(localRepoPath)) {
      fs.rmSync(localRepoPath, { recursive: true, force: true });
      outputChannel.appendLine("Removed incomplete local repository folder.");
    }
    fs.mkdirSync(localRepoPath, { recursive: true });
    git = simpleGit();
    try {
      // Clone the repository (token included in URL for authentication).
      await git.clone(`https://${githubToken}@github.com/${githubUsername}/${repoName}.git`, localRepoPath);
      vscode.window.showInformationMessage('Repository cloned locally.');
      outputChannel.appendLine('Repository cloned locally.');
    } catch (cloneError: any) {
      const errMsg = `Failed to clone repository: ${cloneError.message}`;
      vscode.window.showErrorMessage(errMsg);
      outputChannel.appendLine(`Error: ${errMsg}`);
      return;
    }
  } else {
    git = simpleGit(localRepoPath);
    outputChannel.appendLine('Using existing local repository.');
  }

  // Listen to file save events.
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(document => {
      const timestamp = new Date().toLocaleTimeString(undefined, { timeZone: effectiveTimeZone, timeZoneName: 'short' });
      const message = `[${timestamp}]: Saved ${document.fileName}`;
      codingSummary += message + '\n';
      outputChannel.appendLine(message);
      console.log(message);
    })
  );

  // Set up a timer to commit coding summaries.
  // (For testing, interval is set to 30 minutes. Adjust as needed.)
  const commitInterval = 30 * 60 * 1000;
  setInterval(async () => {
    outputChannel.appendLine('Attempting to commit coding summary...');
    await commitCodingSummary(localRepoPath, githubUsername, effectiveTimeZone);
    codingSummary = '';
  }, commitInterval);

  // Register a command for manual commit.
  let disposable = vscode.commands.registerCommand('codeTracking.start', async () => {
    outputChannel.appendLine('Manual commit triggered.');
    await commitCodingSummary(localRepoPath, githubUsername, effectiveTimeZone);
    vscode.window.showInformationMessage('Manual commit of coding summary executed.');
  });
  context.subscriptions.push(disposable);
}

async function commitCodingSummary(localRepoPath: string, githubUsername: string, timeZone: string) {
  if (!codingSummary) {
    outputChannel.appendLine("No coding summary to commit.");
    return;
  }

  const summaryFilePath = path.join(localRepoPath, SUMMARY_FILENAME);
  try {
    // Append the summary to the log file.
    fs.appendFileSync(summaryFilePath, codingSummary, { encoding: 'utf8' });
    outputChannel.appendLine("Appended coding summary to file.");

    // Ensure we're in the correct repository directory.
    await git.cwd(localRepoPath);
    await git.add(SUMMARY_FILENAME);
    const commitMessage = `Coding activity summary - ${new Date().toLocaleString(undefined, { timeZone: timeZone, timeZoneName: 'short' })}`;
    await git.commit(commitMessage);
    outputChannel.appendLine(`Committed with message: ${commitMessage}`);

    // Push the commit.
    await git.push('origin', 'main');
    const pushTime = new Date().toLocaleTimeString(undefined, { timeZone: timeZone, timeZoneName: 'short' });
    vscode.window.showInformationMessage(`Committed coding summary at ${pushTime}`);
    outputChannel.appendLine(`Pushed coding summary to GitHub at ${pushTime}`);
  } catch (error: any) {
    const errMsg = `Error committing coding summary: ${error.message}`;
    vscode.window.showErrorMessage(errMsg);
    outputChannel.appendLine(`Error: ${errMsg}`);
  }
}

export function deactivate() {
  if (outputChannel) {
    outputChannel.dispose();
  }
}
