import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { simpleGit, type SimpleGit } from 'simple-git';
import { ActivityEntry, FlauntConfig } from './types';
import { IgnoreMatcher, redactPath, resolveDocPath } from './ignore';
import { log, logError } from './logger';
import { MetricsService } from './metricsService';
import {
  countAddedLines,
  GitDiffLike,
  MAX_COUNTED_BYTES,
  summarizeWorkspaceChange
} from './workspaceChange';

export class ActivityTracker implements vscode.Disposable {
  private buffer: ActivityEntry[] = [];
  private saveDetected = false;
  private autoSaveInProgress = false;
  private disposables: vscode.Disposable[] = [];
  private openListener?: vscode.Disposable;
  /**
   * Absolute paths the editor saved this interval. A save also trips the
   * watcher, and `onDidSaveTextDocument` is the better of the two signals
   * because it carries the document's languageId, so the echo is dropped.
   */
  private savedThisInterval = new Set<string>();
  /** Absolute paths already journaled as external edits this interval. */
  private externalThisInterval = new Set<string>();

  constructor(
    private metrics: MetricsService,
    private ignore: IgnoreMatcher,
    private getConfig: () => FlauntConfig
  ) {}

  start(context: vscode.ExtensionContext): void {
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument((doc) => this.onSave(doc))
    );
    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument((doc) => {
        if (doc.uri.scheme === 'file') {this.metrics.startSession(doc.uri);}
      }),
      vscode.workspace.onDidCloseTextDocument((doc) => {
        if (doc.uri.scheme === 'file') {this.metrics.endSession(doc.uri);}
      })
    );
    // Writes that never pass through the editor — an agent or CLI tool editing
    // files while VS Code is merely open — fire no save event, so watch the
    // workspace directly. Deletions are left to the watcher's workspace-diff
    // counterpart: there is no document behind them to attribute.
    const watcher = vscode.workspace.createFileSystemWatcher('**/*', false, false, true);
    this.disposables.push(
      watcher,
      watcher.onDidCreate((uri) => this.onExternalWrite(uri)),
      watcher.onDidChange((uri) => this.onExternalWrite(uri))
    );

    this.refreshOpenListener();
    context.subscriptions.push(this);
  }

  refreshOpenListener(): void {
    if (this.openListener) {
      this.openListener.dispose();
      this.openListener = undefined;
    }
    if (this.getConfig().trackFileOpens) {
      this.openListener = vscode.workspace.onDidOpenTextDocument((doc) =>
        this.onOpen(doc)
      );
    }
  }

  updateIgnoreMatcher(matcher: IgnoreMatcher): void {
    this.ignore = matcher;
  }

  hadSave(): boolean {
    return this.saveDetected;
  }

  drain(): ActivityEntry[] {
    const out = this.buffer;
    this.buffer = [];
    this.saveDetected = false;
    this.savedThisInterval.clear();
    this.externalThisInterval.clear();
    return out;
  }

  restore(entries: ActivityEntry[]): void {
    this.buffer = [...entries, ...this.buffer];
  }

  isEmpty(): boolean {
    return this.buffer.length === 0;
  }

  async captureDirtyDocs(): Promise<boolean> {
    const dirtyDocs = vscode.workspace.textDocuments.filter(
      (d) => d.isDirty && d.uri.scheme === 'file'
    );
    if (dirtyDocs.length === 0) {return false;}

    for (const doc of dirtyDocs) {
      this.recordDoc(doc, 'auto-snapshot');
    }

    this.autoSaveInProgress = true;
    try {
      await vscode.workspace.saveAll(false);
    } finally {
      this.autoSaveInProgress = false;
    }
    return true;
  }

  async captureWorkspaceDiff(): Promise<boolean> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    let captured = false;
    for (const folder of folders) {
      try {
        const g = simpleGit(folder.uri.fsPath);
        const isRepo = await g.checkIsRepo();
        if (!isRepo) {continue;}

        const status = await g.status();
        const diff = await this.diffAgainstHead(g);
        const change = summarizeWorkspaceChange(status, diff, (p) =>
          this.ignore.matches(p)
        );
        if (!change.changed) {continue;}

        // Untracked files contribute no diff lines, so count them from disk.
        const linesAdded =
          change.linesAdded +
          this.countNewFileLines(folder.uri.fsPath, change.untracked);

        this.buffer.push({
          timestamp: Date.now(),
          kind: 'workspace-diff',
          project: folder.name,
          linesAdded,
          linesRemoved: change.linesRemoved
        });
        log(
          `Workspace diff snapshot ${folder.name} (+${linesAdded}/−${change.linesRemoved}, ` +
            `${change.paths.length} file(s), ${change.untracked.length} new)`
        );
        captured = true;
      } catch (e) {
        logError(`Workspace diff snapshot failed for ${folder.name}`, e);
      }
    }
    return captured;
  }

  /**
   * `git diff HEAD` so staged work counts too. A repository with no commits yet
   * has no HEAD to diff against, which throws — there every file is new, and the
   * untracked pass accounts for all of it.
   */
  private async diffAgainstHead(g: SimpleGit): Promise<GitDiffLike> {
    try {
      return await g.diffSummary(['HEAD']);
    } catch {
      return { insertions: 0, deletions: 0, files: [] };
    }
  }

  /** Total lines across newly created files, skipping anything oversized. */
  private countNewFileLines(root: string, relPaths: string[]): number {
    let total = 0;
    for (const rel of relPaths) {
      try {
        const abs = path.join(root, rel);
        const stat = fs.statSync(abs);
        if (!stat.isFile() || stat.size > MAX_COUNTED_BYTES) {continue;}
        total += countAddedLines(fs.readFileSync(abs, 'utf8'));
      } catch {
        // Vanished between status and read, or unreadable. Not worth a log line.
      }
    }
    return total;
  }

  private onSave(doc: vscode.TextDocument): void {
    if (doc.uri.scheme !== 'file') {return;}
    if (this.autoSaveInProgress) {return;}
    this.savedThisInterval.add(doc.uri.fsPath);
    this.saveDetected = true;
    this.recordDoc(doc, 'save');
  }

  /**
   * A file changed on disk without the editor saving it. Recorded without a
   * languageId: there is no open document to ask, and guessing one from the
   * extension would mean maintaining a parallel copy of VS Code's language
   * registry. The path is what makes the journal entry useful; language stats
   * keep coming from real editor activity.
   */
  private onExternalWrite(uri: vscode.Uri): void {
    if (uri.scheme !== 'file') {return;}
    if (this.autoSaveInProgress) {return;}
    if (this.savedThisInterval.has(uri.fsPath)) {return;}
    if (this.externalThisInterval.has(uri.fsPath)) {return;}

    const resolved = resolveDocPath(uri);
    if (!resolved) {return;}
    if (this.ignore.matches(resolved.relPath)) {return;}

    try {
      if (!fs.statSync(uri.fsPath).isFile()) {return;}
    } catch {
      return; // Created and removed again before we looked.
    }

    this.externalThisInterval.add(uri.fsPath);

    const cfg = this.getConfig();
    const display = cfg.redactPaths
      ? redactPath(resolved.relPath)
      : resolved.relPath;

    this.buffer.push({
      timestamp: Date.now(),
      kind: 'external-edit',
      project: resolved.project,
      relPath: display
    });
    log(`Changed outside the editor ${display}`);
  }

  private onOpen(doc: vscode.TextDocument): void {
    if (doc.uri.scheme !== 'file') {return;}
    this.recordDoc(doc, 'open');
  }

  private recordDoc(doc: vscode.TextDocument, kind: ActivityEntry['kind']): void {
    const resolved = resolveDocPath(doc.uri);
    if (!resolved) {return;}

    if (this.ignore.matches(resolved.relPath)) {
      log(`Ignored ${kind}: ${resolved.relPath}`);
      return;
    }

    const cfg = this.getConfig();
    const display = cfg.redactPaths ? redactPath(resolved.relPath) : resolved.relPath;

    this.buffer.push({
      timestamp: Date.now(),
      kind,
      project: resolved.project,
      relPath: display,
      languageId: doc.languageId
    });

    const label =
      kind === 'save'
        ? 'Saved'
        : kind === 'auto-snapshot'
          ? 'Auto-snapshot'
          : kind === 'open'
            ? 'Opened'
            : kind;
    log(`${label} ${display}`);

    if (kind !== 'open') {
      this.metrics.trackLanguage(doc);
    }
  }

  dispose(): void {
    for (const d of this.disposables) {d.dispose();}
    this.disposables = [];
    this.openListener?.dispose();
  }
}
