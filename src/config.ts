import * as vscode from 'vscode';
import { FlauntConfig } from './types';
import {
  DEFAULT_MAX_MINUTES,
  DEFAULT_MIN_MINUTES,
  IntervalRange,
  resolveIntervalRange
} from './intervalSchedule';

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

/** The fixed interval shipped before the range settings existed. */
const LEGACY_INTERVAL_MINUTES = 30;

/**
 * Whether a value came from the user rather than from `package.json`. Only
 * `inspect()` can tell the two apart, and the interval rules depend on it: a
 * legacy `commitInterval` must keep pinning the cadence for the people who set
 * it, without pinning it for everyone who merely inherited its default.
 */
function isSetByUser<T>(
  inspected: ReturnType<vscode.WorkspaceConfiguration['inspect']>
): boolean {
  return (
    !!inspected &&
    (inspected.globalValue !== undefined ||
      inspected.workspaceValue !== undefined ||
      inspected.workspaceFolderValue !== undefined)
  );
}

function readIntervalRange(
  c: vscode.WorkspaceConfiguration
): IntervalRange {
  return resolveIntervalRange({
    min: c.get<number>('commitIntervalMin', DEFAULT_MIN_MINUTES),
    max: c.get<number>('commitIntervalMax', DEFAULT_MAX_MINUTES),
    legacy: c.get<number>('commitInterval', LEGACY_INTERVAL_MINUTES),
    minSet: isSetByUser(c.inspect<number>('commitIntervalMin')),
    maxSet: isSetByUser(c.inspect<number>('commitIntervalMax')),
    legacySet: isSetByUser(c.inspect<number>('commitInterval'))
  });
}

export function readConfig(): FlauntConfig {
  const c = vscode.workspace.getConfiguration('codeTracking');
  const systemTZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const rawTZ = c.get<string>('timeZone', '').trim();
  return {
    commitIntervalRange: readIntervalRange(c),
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
