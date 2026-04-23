export type ActivityKind = 'save' | 'auto-snapshot' | 'workspace-diff' | 'open';

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
  commitIntervalMinutes: number;
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
