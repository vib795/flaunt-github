import * as vscode from 'vscode';
import simpleGit from 'simple-git';
import { ActivityEntry, FlauntConfig } from './types';
import { IgnoreMatcher, redactPath, resolveDocPath } from './ignore';
import { log, logError } from './logger';
import { MetricsService } from './metricsService';

export class ActivityTracker implements vscode.Disposable {
  private buffer: ActivityEntry[] = [];
  private saveDetected = false;
  private autoSaveInProgress = false;
  private disposables: vscode.Disposable[] = [];
  private openListener?: vscode.Disposable;

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
        const d = await g.diffSummary();
        if (d.insertions === 0 && d.deletions === 0 && d.files.length === 0) {
          continue;
        }
        this.buffer.push({
          timestamp: Date.now(),
          kind: 'workspace-diff',
          project: folder.name,
          linesAdded: d.insertions,
          linesRemoved: d.deletions
        });
        log(
          `Workspace diff snapshot ${folder.name} (+${d.insertions}/−${d.deletions})`
        );
        captured = true;
      } catch (e) {
        logError(`Workspace diff snapshot failed for ${folder.name}`, e);
      }
    }
    return captured;
  }

  private onSave(doc: vscode.TextDocument): void {
    if (doc.uri.scheme !== 'file') {return;}
    if (this.autoSaveInProgress) {return;}
    this.saveDetected = true;
    this.recordDoc(doc, 'save');
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
