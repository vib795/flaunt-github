import * as fs from 'fs';
import * as path from 'path';
import { ActivityEntry } from './types';

export interface JournalWriteResult {
  files: string[];
  preview: string;
}

const LEGACY_SUMMARY = 'coding_summary.txt';

export function migrateLegacySummary(repoPath: string): string | undefined {
  const legacy = path.join(repoPath, LEGACY_SUMMARY);
  if (!fs.existsSync(legacy)) {return undefined;}

  const noticeTarget = path.join(repoPath, 'journal', 'legacy-summary.txt');
  if (fs.existsSync(noticeTarget)) {return undefined;}

  fs.mkdirSync(path.dirname(noticeTarget), { recursive: true });
  fs.renameSync(legacy, noticeTarget);
  return noticeTarget;
}

function formatTs(ts: number, timeZone: string): string {
  try {
    return new Date(ts).toLocaleString(undefined, { timeZone });
  } catch {
    return new Date(ts).toLocaleString();
  }
}

function formatEntry(entry: ActivityEntry, timeZone: string): string {
  const ts = formatTs(entry.timestamp, timeZone);
  const kindLabel: Record<string, string> = {
    save: 'Saved',
    'auto-snapshot': 'Auto-snapshot',
    'workspace-diff': 'Workspace diff snapshot',
    open: 'Opened'
  };
  const label = kindLabel[entry.kind] ?? entry.kind;
  const path = entry.relPath ?? '';
  const diff =
    entry.linesAdded !== undefined || entry.linesRemoved !== undefined
      ? ` (+${entry.linesAdded ?? 0}/−${entry.linesRemoved ?? 0})`
      : '';
  return `[${ts}] ${label} ${path}${diff}`.trimEnd();
}

function groupByScope(
  entries: ActivityEntry[]
): Map<string, ActivityEntry[]> {
  const out = new Map<string, ActivityEntry[]>();
  for (const entry of entries) {
    const key = entry.project ?? '_global';
    if (!out.has(key)) {out.set(key, []);}
    out.get(key)!.push(entry);
  }
  return out;
}

function monthlyFile(scope: string, ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  if (scope === '_global' || scope === '_external') {
    return path.join('journal', String(y), `${m}.md`);
  }
  return path.join('projects', scope, String(y), `${m}.md`);
}

export function writeJournal(
  repoPath: string,
  entries: ActivityEntry[],
  timeZone: string
): JournalWriteResult {
  if (entries.length === 0) {return { files: [], preview: '' };}

  const buckets = new Map<string, string[]>();

  for (const entry of entries) {
    const scope = entry.project ?? '_global';
    const rel = monthlyFile(scope, entry.timestamp);
    const line = formatEntry(entry, timeZone);
    if (!buckets.has(rel)) {buckets.set(rel, []);}
    buckets.get(rel)!.push(line);
  }

  const written: string[] = [];
  for (const [rel, lines] of buckets) {
    const abs = path.join(repoPath, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const header = fs.existsSync(abs) ? '' : `# Activity — ${path.basename(rel, '.md')}\n\n`;
    fs.appendFileSync(abs, header + lines.join('\n') + '\n', 'utf8');
    written.push(rel);
  }

  const preview = entries
    .slice(0, 3)
    .map((e) => formatEntry(e, timeZone))
    .join('\n');

  return { files: written, preview };
}

export function buildCommitMessage(
  prefix: string,
  entries: ActivityEntry[],
  diff: { added: number; removed: number },
  timeZone: string
): string {
  const grouped = groupByScope(entries);
  const projects = [...grouped.keys()].filter((k) => k !== '_global' && k !== '_external');
  const langs = new Map<string, number>();
  let saves = 0;
  for (const e of entries) {
    if (e.kind === 'save' || e.kind === 'auto-snapshot') {saves++;}
    if (e.languageId) {langs.set(e.languageId, (langs.get(e.languageId) ?? 0) + 1);}
  }
  const topLangs = [...langs.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map((x) => x[0]);

  const ts = formatTs(Date.now(), timeZone);
  const diffPart =
    diff.added || diff.removed ? ` · +${diff.added}/−${diff.removed}` : '';
  const projectPart = projects.length ? ` · ${projects.join(', ')}` : '';
  const langPart = topLangs.length ? ` · ${topLangs.join(', ')}` : '';
  const savePart = saves ? ` · ${saves} save${saves === 1 ? '' : 's'}` : '';

  return `${prefix} ${ts}${diffPart}${projectPart}${langPart}${savePart}`.trim();
}
