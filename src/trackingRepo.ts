import * as fs from 'fs';
import * as path from 'path';
import { Octokit } from '@octokit/rest';
import simpleGit, { SimpleGit } from 'simple-git';
import { log, logError } from './logger';
import { authHeader } from './auth';
import { PushCredentials } from './types';

export const REPO_NAME = 'code-tracking';

export async function ensureRemoteRepo(
  octokit: Octokit,
  owner: string
): Promise<boolean> {
  try {
    await octokit.repos.get({ owner, repo: REPO_NAME });
    log(`Tracking repo "${REPO_NAME}" exists.`);
    return true;
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    if (err.status === 404) {
      log(`Creating tracking repo "${REPO_NAME}"...`);
      await octokit.repos.createForAuthenticatedUser({
        name: REPO_NAME,
        private: true,
        auto_init: true
      });
      return true;
    }
    logError('Failed to check tracking repo', e);
    return false;
  }
}

export async function ensureLocalClone(
  localRepoPath: string,
  creds: PushCredentials
): Promise<void> {
  const safeRemote = `https://github.com/${creds.username}/${REPO_NAME}.git`;
  const header = authHeader(creds);

  if (!fs.existsSync(path.join(localRepoPath, '.git'))) {
    fs.mkdirSync(path.dirname(localRepoPath), { recursive: true });
    log(`Cloning ${safeRemote}...`);
    await simpleGit().raw([
      '-c',
      `http.extraheader=${header}`,
      'clone',
      safeRemote,
      localRepoPath
    ]);
    log('Clone successful.');
    return;
  }

  const git = simpleGit(localRepoPath);
  const remotes = await git.getRemotes(true);
  const origin = remotes.find((r) => r.name === 'origin');
  if (!origin || origin.refs.push !== safeRemote) {
    await git.remote(['set-url', 'origin', safeRemote]);
    log(`Rewrote origin remote to ${safeRemote}.`);
  }
}

export async function detectDefaultBranch(git: SimpleGit): Promise<string> {
  try {
    const ref = await git.raw(['symbolic-ref', 'refs/remotes/origin/HEAD']);
    const match = ref.trim().match(/refs\/remotes\/origin\/(.+)$/);
    if (match) {return match[1];}
  } catch {
    // fall through
  }
  try {
    const branches = await git.branch(['-r']);
    if (branches.all.includes('origin/main')) {return 'main';}
    if (branches.all.includes('origin/master')) {return 'master';}
  } catch {
    // ignore
  }
  return 'main';
}

export class TrackingRepo {
  private git: SimpleGit;
  private creds: PushCredentials;
  private branchCache?: string;

  constructor(public readonly localPath: string, creds: PushCredentials) {
    this.git = simpleGit(localPath);
    this.creds = creds;
  }

  updateCreds(creds: PushCredentials): void {
    this.creds = creds;
  }

  private extra(): string[] {
    return ['-c', `http.extraheader=${authHeader(this.creds)}`];
  }

  async branch(): Promise<string> {
    if (!this.branchCache) {
      this.branchCache = await detectDefaultBranch(this.git);
    }
    return this.branchCache;
  }

  async fetch(): Promise<void> {
    const branch = await this.branch();
    await this.git.raw([...this.extra(), 'fetch', 'origin', branch]);
  }

  async mergeRemote(): Promise<void> {
    const branch = await this.branch();
    await this.git.merge([`origin/${branch}`, '--strategy-option=theirs']);
  }

  async commit(message: string, files: string[]): Promise<boolean> {
    for (const f of files) {
      await this.git.add(f);
    }
    const status = await this.git.status();
    if (status.staged.length === 0) {
      return false;
    }
    await this.git.commit(message);
    return true;
  }

  async push(): Promise<void> {
    const branch = await this.branch();
    await this.git.raw([...this.extra(), 'push', 'origin', branch]);
  }

  async diffSummary(): Promise<{ added: number; removed: number; files: number }> {
    const d = await this.git.diffSummary();
    return { added: d.insertions, removed: d.deletions, files: d.files.length };
  }

  raw(): SimpleGit {
    return this.git;
  }
}
