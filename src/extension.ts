// src/extension.ts
import * as vscode from 'vscode';
import { Octokit } from '@octokit/rest';
import simpleGit, { SimpleGit } from 'simple-git';
import * as path from 'path';
import * as fs from 'fs';

// Global variables
let git: SimpleGit;
const SUMMARY_FILENAME = 'coding_summary.txt';
let codingSummary: string = '';

export async function activate(context: vscode.ExtensionContext) {
  vscode.window.showInformationMessage('Code Tracking Extension Activated!');

  // Retrieve GitHub token and username from extension configuration.
  const config = vscode.workspace.getConfiguration('codeTracking');
  const githubToken = config.get<string>('githubToken');
  const githubUsername = config.get<string>('githubUsername');

  if (!githubToken || !githubUsername) {
    vscode.window.showErrorMessage(
      'GitHub token and username must be set in settings (codeTracking.githubToken and codeTracking.githubUsername).'
    );
    return;
  }

  // Initialize Octokit with the provided token.
  const octokit = new Octokit({ auth: githubToken });

  // Define repository details.
  const repoName = 'code-tracking';

  // Check if the repository exists; if not, create it.
  try {
    await octokit.repos.get({ owner: githubUsername, repo: repoName });
    vscode.window.showInformationMessage(`Repository '${repoName}' exists.`);
  } catch (error: any) {
    if (error.status === 404) {
      // Repository does not exist. Create it.
      try {
        await octokit.repos.createForAuthenticatedUser({ 
			name: repoName, 
			auto_init: true,
			private: true });
        vscode.window.showInformationMessage(`Repository '${repoName}' created successfully.`);
      } catch (createError: any) {
        vscode.window.showErrorMessage(`Failed to create repository: ${createError.message}`);
        return;
      }
    } else {
      vscode.window.showErrorMessage(`Error checking repository: ${error.message}`);
      return;
    }
  }

  // Set up a local directory for the repository using the extension's global storage path.
  const localRepoPath = path.join(context.globalStoragePath, repoName);
  if (!fs.existsSync(localRepoPath)) {
    fs.mkdirSync(localRepoPath, { recursive: true });
    // Clone the repository locally.
    git = simpleGit();
    try {
      await git.clone(`https://github.com/${githubUsername}/${repoName}.git`, localRepoPath);
      vscode.window.showInformationMessage('Repository cloned locally.');
    } catch (cloneError: any) {
      vscode.window.showErrorMessage(`Failed to clone repository: ${cloneError.message}`);
      return;
    }
  } else {
    // If already cloned, initialize simple-git with the existing directory.
    git = simpleGit(localRepoPath);
  }

  // Listen to file save events to track coding activity.
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(document => {
      const timestamp = new Date().toLocaleTimeString();
      const message = `[${timestamp}]: Saved ${document.fileName}\n`;
      codingSummary += message;
      console.log(message);
    })
  );

  // Set up a timer to commit coding summaries every 30 minutes.
  const commitInterval = 30 * 60 * 1000; // 30 minutes in milliseconds
  setInterval(async () => {
    await commitCodingSummary(localRepoPath, githubUsername);
    // Reset the in-memory summary after committing.
    codingSummary = '';
  }, commitInterval);

  // Register a command so the user can manually trigger a commit.
  let disposable = vscode.commands.registerCommand('codeTracking.start', async () => {
    await commitCodingSummary(localRepoPath, githubUsername);
    vscode.window.showInformationMessage('Manual commit of coding summary executed.');
  });
  context.subscriptions.push(disposable);
  console.log(`Local repository path: ${localRepoPath}`);

}

// This function appends the coding summary to a file, commits, and pushes the changes.
async function commitCodingSummary(localRepoPath: string, githubUsername: string) {
  if (!codingSummary) {
    // Nothing to commit.
    return;
  }

  const summaryFilePath = path.join(localRepoPath, SUMMARY_FILENAME);
  try {
    // Append the new summary to the summary file.
    fs.appendFileSync(summaryFilePath, codingSummary, { encoding: 'utf8' });

    // Use simple-git to add, commit, and push changes.
    await git.cwd(localRepoPath); // Ensure we are in the repository directory.
    await git.add(SUMMARY_FILENAME);
    const commitMessage = `Coding activity summary - ${new Date().toLocaleString()}`;
    await git.commit(commitMessage);
    // Push to the 'main' branch (adjust if your default branch is different).
    await git.push('origin', 'main');
    vscode.window.showInformationMessage(`Committed coding summary at ${new Date().toLocaleTimeString()}`);
  } catch (error: any) {
    vscode.window.showErrorMessage(`Error committing coding summary: ${error.message}`);
  }
}

export function deactivate() {
  // Clean up resources if necessary.
}
