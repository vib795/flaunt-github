import simpleGit from 'simple-git';
import { ExtensionContext, TextDocument, Uri } from 'vscode';

export interface SessionInfo {
  fileName: string;
  totalSeconds: number;
}

export interface DiffStats {
  added: number;
  removed: number;
}

export class MetricsService {
  private ctx: ExtensionContext;
  private languageCounts: Record<string, number>;
  private sessionStarts: Map<string, number>;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
    this.languageCounts = ctx.globalState.get('languageCounts', {});
    this.sessionStarts = new Map();
  }

  async computeDiffStats(repoPath: string): Promise<DiffStats> {
    try {
      const d = await simpleGit(repoPath).diffSummary(['HEAD']);
      return { added: d.insertions, removed: d.deletions };
    } catch {
      return { added: 0, removed: 0 };
    }
  }

  async getDiffBadge(repoPath: string): Promise<string> {
    const { added, removed } = await this.computeDiffStats(repoPath);
    if (added === 0 && removed === 0) {return '';}
    return `(+${added}/−${removed}) `;
  }

  async getDiffSummary(repoPath: string): Promise<DiffStats> {
    return this.computeDiffStats(repoPath);
  }

  trackLanguage(doc: TextDocument): void {
    const lang = doc.languageId;
    this.languageCounts[lang] = (this.languageCounts[lang] || 0) + 1;
    this.ctx.globalState.update('languageCounts', this.languageCounts);
  }

  getLanguageCounts(): Record<string, number> {
    return { ...this.languageCounts };
  }

  resetLanguageCounts(): void {
    this.languageCounts = {};
    this.ctx.globalState.update('languageCounts', this.languageCounts);
  }

  startSession(uri: Uri): void {
    this.sessionStarts.set(uri.toString(), Date.now());
  }

  endSession(uri: Uri): void {
    const key = uri.toString();
    const start = this.sessionStarts.get(key);
    if (!start) {return;}

    const seconds = (Date.now() - start) / 1000;
    const prev = this.ctx.globalState.get<Record<string, number>>(
      'sessionDurations',
      {}
    );
    prev[key] = (prev[key] || 0) + seconds;
    this.ctx.globalState.update('sessionDurations', prev);
    this.sessionStarts.delete(key);
  }

  getSessions(): SessionInfo[] {
    const durations = this.ctx.globalState.get<Record<string, number>>(
      'sessionDurations',
      {}
    );
    const results: SessionInfo[] = [];
    for (const [uri, secs] of Object.entries(durations)) {
      try {
        const parsed = Uri.parse(uri);
        results.push({ fileName: parsed.fsPath || uri, totalSeconds: secs });
      } catch {
        results.push({ fileName: uri, totalSeconds: secs });
      }
    }
    return results;
  }

  resetSessions(): void {
    this.ctx.globalState.update('sessionDurations', {});
    this.sessionStarts.clear();
  }
}

export function fmtDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const parts: string[] = [];
  if (h) {parts.push(`${h}h`);}
  if (m) {parts.push(`${m}m`);}
  if (s || parts.length === 0) {parts.push(`${s}s`);}
  return parts.join(' ');
}
