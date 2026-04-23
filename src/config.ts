import * as vscode from 'vscode';
import { FlauntConfig } from './types';

const DEFAULT_IGNORE_GLOBS = [
  '**/.env',
  '**/.env.*',
  '**/secrets/**',
  '**/*.pem',
  '**/*.key',
  '**/id_rsa*',
  '**/credentials*',
  '**/.aws/**',
  '**/.ssh/**'
];

const DEFAULT_AI_MODEL = 'claude-haiku-4-5';

export function readConfig(): FlauntConfig {
  const c = vscode.workspace.getConfiguration('codeTracking');
  const systemTZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const rawTZ = c.get<string>('timeZone', '').trim();
  return {
    commitIntervalMinutes: c.get<number>('commitInterval', 30),
    commitMessagePrefix: c.get<string>('commitMessagePrefix', '[Flaunt]'),
    timeZone: rawTZ || systemTZ,
    trackFileOpens: c.get<boolean>('trackFileOpens', false),
    ignoreGlobs: c.get<string[]>('ignoreGlobs', DEFAULT_IGNORE_GLOBS),
    paused: c.get<boolean>('paused', false),
    redactPaths: c.get<boolean>('redactPaths', false),
    aiSummaryEnabled: c.get<boolean>('aiSummary.enabled', false),
    anthropicApiKey: c.get<string>('aiSummary.anthropicApiKey', ''),
    aiModel: c.get<string>('aiSummary.model', DEFAULT_AI_MODEL)
  };
}

export function onConfigChanged(
  handler: (cfg: FlauntConfig) => void
): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('codeTracking')) {
      handler(readConfig());
    }
  });
}

export async function setPaused(paused: boolean): Promise<void> {
  const c = vscode.workspace.getConfiguration('codeTracking');
  await c.update('paused', paused, vscode.ConfigurationTarget.Global);
}
