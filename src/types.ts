import { IntervalRange } from './intervalSchedule';

/**
 * `external-edit` covers a write that reached disk without passing through the
 * editor — an agent or CLI tool changing files while VS Code is merely open.
 * Those produce no save event, so they are observed by a file-system watcher.
 */
export type ActivityKind =
  | 'save'
  | 'auto-snapshot'
  | 'workspace-diff'
  | 'external-edit'
  | 'open';

export interface ActivityEntry {
  timestamp: number;
  kind: ActivityKind;
  project?: string;
  relPath?: string;
  languageId?: string;
  linesAdded?: number;
  linesRemoved?: number;
}

export interface FlauntConfig {
  commitIntervalRange: IntervalRange;
  commitMessagePrefix: string;
  timeZone: string;
  trackFileOpens: boolean;
  ignoreGlobs: string[];
  paused: boolean;
  redactPaths: boolean;
  aiSummaryEnabled: boolean;
  anthropicApiKey: string;
  aiModel: string;
}

export interface PushCredentials {
  token: string;
  username: string;
}
