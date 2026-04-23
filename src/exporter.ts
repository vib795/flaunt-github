import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { MetricsService } from './metricsService';
import { TrackingRepo } from './trackingRepo';

export async function exportMetrics(
  metrics: MetricsService,
  repo: TrackingRepo
): Promise<vscode.Uri | undefined> {
  const pick = await vscode.window.showQuickPick(
    [
      { label: 'JSON', detail: 'Machine-readable snapshot' },
      { label: 'CSV', detail: 'Language counts + session durations' }
    ],
    { placeHolder: 'Export format' }
  );
  if (!pick) {return undefined;}

  const defaultName = `flaunt-metrics-${new Date()
    .toISOString()
    .slice(0, 10)}.${pick.label.toLowerCase()}`;
  const target = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(path.join(repo.localPath, defaultName)),
    filters:
      pick.label === 'JSON'
        ? { JSON: ['json'] }
        : { CSV: ['csv'] }
  });
  if (!target) {return undefined;}

  const languages = metrics.getLanguageCounts();
  const sessions = metrics.getSessions();
  const diff = await repo.diffSummary();

  if (pick.label === 'JSON') {
    const payload = {
      generatedAt: new Date().toISOString(),
      languages,
      sessions,
      diff
    };
    fs.writeFileSync(target.fsPath, JSON.stringify(payload, null, 2), 'utf8');
  } else {
    const rows: string[] = ['section,key,value'];
    for (const [lang, count] of Object.entries(languages)) {
      rows.push(`language,${csv(lang)},${count}`);
    }
    for (const s of sessions) {
      rows.push(`session,${csv(s.fileName)},${Math.round(s.totalSeconds)}`);
    }
    rows.push(`diff,added,${diff.added}`);
    rows.push(`diff,removed,${diff.removed}`);
    fs.writeFileSync(target.fsPath, rows.join('\n') + '\n', 'utf8');
  }

  return target;
}

function csv(s: string): string {
  if (/[",\n]/.test(s)) {return `"${s.replace(/"/g, '""')}"`;}
  return s;
}
