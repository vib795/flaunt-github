import * as cp from 'child_process';
import { ExtensionContext, TextDocument, Uri } from 'vscode';

export interface SessionInfo {
  fileName: string;
  totalSeconds: number;
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

  async computeDiffStats(
    repoPath: string
  ): Promise<{ added: number; removed: number }> {
    return new Promise((resolve) => {
      cp.exec(
        'git diff --shortstat HEAD',
        { cwd: repoPath },
        (err, stdout) => {
          if (err) {
            return resolve({ added: 0, removed: 0 });
          }
          const m = stdout.match(
            /(\d+)\s+insertions*\(\+\).*?(\d+)\s+deletions*\(-\)/
          );
          resolve({
            added: m ? parseInt(m[1], 10) : 0,
            removed: m ? parseInt(m[2], 10) : 0
          });
        }
      );
    });
  }

  async getDiffBadge(repoPath: string): Promise<string> {
    try {
      const { added, removed } = await this.computeDiffStats(repoPath);
      if (added === 0 && removed === 0) return '';
      return `(+${added}/−${removed}) `;
    } catch {
      return '';
    }
  }

  async getDiffSummary(
    repoPath: string
  ): Promise<{ added: number; removed: number }> {
    return this.computeDiffStats(repoPath);
  }

  trackLanguage(doc: TextDocument) {
    const lang = doc.languageId;
    this.languageCounts[lang] = (this.languageCounts[lang] || 0) + 1;
    this.ctx.globalState.update('languageCounts', this.languageCounts);
  }

  getLanguageCounts(): Record<string, number> {
    return { ...this.languageCounts };
  }

  startSession(uri: Uri) {
    this.sessionStarts.set(uri.toString(), Date.now());
  }

  endSession(uri: Uri) {
    const key = uri.toString();
    const start = this.sessionStarts.get(key);
    if (!start) return;

    const seconds = (Date.now() - start) / 1000;
    const prev =
      this.ctx.globalState.get<Record<string, number>>(
        'sessionDurations',
        {}
      );
    prev[key] = (prev[key] || 0) + seconds;
    this.ctx.globalState.update('sessionDurations', prev);
    this.sessionStarts.delete(key);
  }

  getSessions(): SessionInfo[] {
    const durations =
      this.ctx.globalState.get<Record<string, number>>(
        'sessionDurations',
        {}
      );
    const results: SessionInfo[] = [];

    for (const [uri, secs] of Object.entries(durations)) {
      try {
        const parsed = Uri.parse(uri);
        const fileName = parsed.fsPath || uri;
        results.push({ fileName, totalSeconds: secs });
      } catch {
        results.push({ fileName: uri, totalSeconds: secs });
      }
    }

    return results;
  }
}
