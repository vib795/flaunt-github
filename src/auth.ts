import * as vscode from 'vscode';
import { Octokit } from '@octokit/rest';
import { log } from './logger';
import { PushCredentials } from './types';

const SECRET_TOKEN = 'codeTracking.githubToken';
const SECRET_USER = 'codeTracking.githubUsername';
const SECRET_TOKEN_SOURCE = 'codeTracking.githubTokenSource';

type TokenSource = 'settings' | 'vscode-auth';

async function tokenFromSettings(): Promise<PushCredentials | undefined> {
  const cfg = vscode.workspace.getConfiguration('codeTracking');
  const token = cfg.get<string>('githubToken', '');
  const username = cfg.get<string>('githubUsername', '');
  if (!token || !username) {return undefined;}
  return { token, username };
}

async function tokenFromVsCode(): Promise<PushCredentials> {
  const session = await vscode.authentication.getSession(
    'github',
    ['read:user', 'repo'],
    { createIfNone: true }
  );
  const octokit = new Octokit({ auth: session.accessToken });
  const user = await octokit.users.getAuthenticated();
  return { token: session.accessToken, username: user.data.login };
}

export async function resolveCredentials(
  ctx: vscode.ExtensionContext
): Promise<PushCredentials> {
  const secrets = ctx.secrets;
  const cachedSource = (await secrets.get(SECRET_TOKEN_SOURCE)) as
    | TokenSource
    | undefined;

  const settingsCreds = await tokenFromSettings();

  if (settingsCreds) {
    const cachedToken = await secrets.get(SECRET_TOKEN);
    if (cachedSource === 'settings' && cachedToken === settingsCreds.token) {
      return settingsCreds;
    }
    await secrets.store(SECRET_TOKEN, settingsCreds.token);
    await secrets.store(SECRET_USER, settingsCreds.username);
    await secrets.store(SECRET_TOKEN_SOURCE, 'settings');
    log('Cached settings-supplied GitHub credentials.');
    return settingsCreds;
  }

  const cachedToken = await secrets.get(SECRET_TOKEN);
  const cachedUser = await secrets.get(SECRET_USER);
  if (cachedToken && cachedUser) {
    return { token: cachedToken, username: cachedUser };
  }

  const vsc = await tokenFromVsCode();
  await secrets.store(SECRET_TOKEN, vsc.token);
  await secrets.store(SECRET_USER, vsc.username);
  await secrets.store(SECRET_TOKEN_SOURCE, 'vscode-auth');
  log(`Resolved VS Code auth for ${vsc.username}.`);
  return vsc;
}

export async function refreshCredentials(
  ctx: vscode.ExtensionContext
): Promise<PushCredentials> {
  await ctx.secrets.delete(SECRET_TOKEN);
  await ctx.secrets.delete(SECRET_USER);
  await ctx.secrets.delete(SECRET_TOKEN_SOURCE);
  return resolveCredentials(ctx);
}

export function authHeader(creds: PushCredentials): string {
  const basic = Buffer.from(`${creds.username}:${creds.token}`).toString(
    'base64'
  );
  return `AUTHORIZATION: Basic ${basic}`;
}
