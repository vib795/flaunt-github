import * as cp from 'child_process';
import { ExtensionContext, TextDocument, Uri } from 'vscode';

export class MetricsService {
  private ctx: ExtensionContext;
  private languageCounts: Record<string, number>;
  private sessionStarts: Map<string, number>;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
    this.languageCounts = ctx.globalState.get('languageCounts', {});
    this.sessionStarts = new Map();
  }

  /**
   * Runs `git diff --shortstat HEAD` and parses insertions/deletions.
   */
  async computeDiffStats(repoPath: string): Promise<{ added: number; removed: number }> {
    return new Promise((resolve, reject) => {
      cp.exec('git diff --shortstat HEAD', { cwd: repoPath }, (err, stdout) => {
        if (err) return reject(err);
        const m = stdout.match(/(\d+) insertions*\(\+\).*?(\d+) deletions*\(-\)/);
        resolve({
          added: m ? parseInt(m[1], 10) : 0,
          removed: m ? parseInt(m[2], 10) : 0,
        });
      });
    });
  }

  /**
   * Returns a badge string like "+12/−5" or empty if no changes.
   */
  async getDiffBadge(repoPath: string): Promise<string> {
    try {
      const { added, removed } = await this.computeDiffStats(repoPath);
      if (added === 0 && removed === 0) return '';
      return `(+${added}/−${removed}) `;
    } catch {
      return '';
    }
  }

  /**
   * Increments count for the document's language.
   */
  trackLanguage(doc: TextDocument) {
    const lang = doc.languageId;
    this.languageCounts[lang] = (this.languageCounts[lang] || 0) + 1;
    this.ctx.globalState.update('languageCounts', this.languageCounts);
  }

  /**
   * Records session start timestamp for a document URI.
   */
  startSession(uri: Uri) {
    this.sessionStarts.set(uri.toString(), Date.now());
  }

  /**
   * Calculates elapsed time and persists it in globalState.
   */
  endSession(uri: Uri) {
    const key = uri.toString();
    const start = this.sessionStarts.get(key);
    if (!start) return;
    const seconds = (Date.now() - start) / 1000;
    const prev = this.ctx.globalState.get<Record<string, number>>('sessionDurations', {});
    prev[key] = (prev[key] || 0) + seconds;
    this.ctx.globalState.update('sessionDurations', prev);
    this.sessionStarts.delete(key);
  }
}
