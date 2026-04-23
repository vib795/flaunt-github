import * as vscode from 'vscode';
import { MetricsService, fmtDuration } from './metricsService';
import { TrackingRepo } from './trackingRepo';

interface DashboardSnapshot {
  languages: Array<{ name: string; count: number }>;
  sessions: Array<{ file: string; seconds: number }>;
  diff: { added: number; removed: number; files: number };
  generatedAt: string;
}

export class Dashboard {
  private panel?: vscode.WebviewPanel;

  constructor(
    private metrics: MetricsService,
    private repo: TrackingRepo
  ) {}

  async show(): Promise<void> {
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'flauntDashboard',
        'Flaunt GitHub — Dashboard',
        vscode.ViewColumn.Active,
        { enableScripts: true, retainContextWhenHidden: true }
      );
      this.panel.onDidDispose(() => {
        this.panel = undefined;
      });
    } else {
      this.panel.reveal(vscode.ViewColumn.Active);
    }

    const snapshot = await this.buildSnapshot();
    this.panel.webview.html = this.render(snapshot);
  }

  private async buildSnapshot(): Promise<DashboardSnapshot> {
    const rawLangs = this.metrics.getLanguageCounts();
    const languages = Object.entries(rawLangs)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    const sessions = this.metrics
      .getSessions()
      .sort((a, b) => b.totalSeconds - a.totalSeconds)
      .slice(0, 15)
      .map((s) => ({ file: s.fileName, seconds: s.totalSeconds }));

    const diff = await this.repo.diffSummary();

    return {
      languages,
      sessions,
      diff,
      generatedAt: new Date().toLocaleString()
    };
  }

  private render(snap: DashboardSnapshot): string {
    const totalSaves = snap.languages.reduce((n, l) => n + l.count, 0);
    const maxLang = snap.languages[0]?.count ?? 1;
    const langBars = snap.languages
      .map(
        (l) =>
          `<tr><td class="k">${escapeHtml(l.name)}</td><td class="bar"><span style="width:${Math.max(
            (l.count / maxLang) * 100,
            2
          )}%"></span></td><td class="v">${l.count}</td></tr>`
      )
      .join('');
    const sessionRows = snap.sessions
      .map(
        (s) =>
          `<tr><td class="k">${escapeHtml(
            trimPath(s.file)
          )}</td><td class="v">${fmtDuration(s.seconds)}</td></tr>`
      )
      .join('');

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Flaunt Dashboard</title>
<style>
  body { font-family: var(--vscode-font-family); padding: 24px; color: var(--vscode-foreground); }
  h1 { margin: 0 0 4px; }
  .sub { opacity: .7; font-size: .9em; margin-bottom: 24px; }
  .card { background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 16px; margin-bottom: 16px; }
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .stat { text-align: center; padding: 12px; background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 6px; }
  .stat .n { font-size: 2em; font-weight: 600; }
  .stat .l { opacity: .7; font-size: .85em; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 6px 8px; vertical-align: middle; }
  td.k { width: 35%; }
  td.v { width: 12%; text-align: right; opacity: .85; }
  td.bar { width: 53%; }
  td.bar span { display: inline-block; height: 10px; background: var(--vscode-textLink-foreground); border-radius: 3px; vertical-align: middle; }
  h2 { margin: 0 0 12px; font-size: 1.05em; font-weight: 600; }
</style></head>
<body>
  <h1>Flaunt GitHub</h1>
  <div class="sub">Generated ${escapeHtml(snap.generatedAt)}</div>
  <div class="stats">
    <div class="stat"><div class="n">${totalSaves}</div><div class="l">Tracked saves</div></div>
    <div class="stat"><div class="n">${snap.languages.length}</div><div class="l">Languages</div></div>
    <div class="stat"><div class="n">+${snap.diff.added}/−${snap.diff.removed}</div><div class="l">Uncommitted diff</div></div>
  </div>
  <div class="card"><h2>Languages</h2><table>${langBars || '<tr><td class="k">No data yet</td></tr>'}</table></div>
  <div class="card"><h2>Longest-open files</h2><table>${sessionRows || '<tr><td class="k">No sessions yet</td></tr>'}</table></div>
</body></html>`;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

function trimPath(p: string): string {
  if (p.length <= 60) {return p;}
  return '…' + p.slice(-58);
}
