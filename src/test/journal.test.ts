import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildCommitMessage, writeJournal, migrateLegacySummary } from '../journal';
import { ActivityEntry } from '../types';

function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flaunt-test-'));
  return dir;
}

suite('journal', () => {
  test('writeJournal creates per-project monthly files', () => {
    const dir = makeTempRepo();
    const entries: ActivityEntry[] = [
      {
        timestamp: new Date('2026-04-10T10:00:00Z').getTime(),
        kind: 'save',
        project: 'proj-a',
        relPath: 'src/a.ts',
        languageId: 'typescript'
      },
      {
        timestamp: new Date('2026-04-15T12:00:00Z').getTime(),
        kind: 'auto-snapshot',
        project: 'proj-b',
        relPath: 'lib/b.py',
        languageId: 'python'
      },
      {
        timestamp: new Date('2026-05-02T09:00:00Z').getTime(),
        kind: 'save',
        project: 'proj-a',
        relPath: 'src/a.ts',
        languageId: 'typescript'
      }
    ];
    const result = writeJournal(dir, entries, 'UTC');
    assert.strictEqual(result.files.length, 3);

    const aprA = fs.readFileSync(
      path.join(dir, 'projects', 'proj-a', '2026', '04.md'),
      'utf8'
    );
    assert.ok(aprA.includes('Saved src/a.ts'));
    assert.ok(aprA.startsWith('# Activity — 04'));

    const aprB = fs.readFileSync(
      path.join(dir, 'projects', 'proj-b', '2026', '04.md'),
      'utf8'
    );
    assert.ok(aprB.includes('Auto-snapshot lib/b.py'));

    const mayA = fs.readFileSync(
      path.join(dir, 'projects', 'proj-a', '2026', '05.md'),
      'utf8'
    );
    assert.ok(mayA.includes('Saved src/a.ts'));

    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('writeJournal appends without re-adding header', () => {
    const dir = makeTempRepo();
    const entries: ActivityEntry[] = [
      {
        timestamp: new Date('2026-04-10T10:00:00Z').getTime(),
        kind: 'save',
        project: 'proj',
        relPath: 'a.ts'
      }
    ];
    writeJournal(dir, entries, 'UTC');
    writeJournal(dir, entries, 'UTC');
    const body = fs.readFileSync(
      path.join(dir, 'projects', 'proj', '2026', '04.md'),
      'utf8'
    );
    const headerCount = (body.match(/# Activity/g) ?? []).length;
    assert.strictEqual(headerCount, 1);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('global entries go to journal/YYYY/MM.md', () => {
    const dir = makeTempRepo();
    writeJournal(
      dir,
      [
        {
          timestamp: new Date('2026-04-10T10:00:00Z').getTime(),
          kind: 'workspace-diff',
          linesAdded: 10,
          linesRemoved: 2
        }
      ],
      'UTC'
    );
    const body = fs.readFileSync(
      path.join(dir, 'journal', '2026', '04.md'),
      'utf8'
    );
    assert.ok(body.includes('Workspace diff snapshot'));
    assert.ok(body.includes('(+10/−2)'));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('buildCommitMessage includes saves, projects, langs, diff', () => {
    const entries: ActivityEntry[] = [
      { timestamp: 1, kind: 'save', project: 'p1', languageId: 'typescript' },
      { timestamp: 2, kind: 'save', project: 'p1', languageId: 'typescript' },
      { timestamp: 3, kind: 'save', project: 'p2', languageId: 'python' }
    ];
    const msg = buildCommitMessage(
      '[Flaunt]',
      entries,
      { added: 8, removed: 2 },
      'UTC'
    );
    assert.ok(msg.startsWith('[Flaunt]'));
    assert.ok(msg.includes('+8/−2'));
    assert.ok(msg.includes('p1'));
    assert.ok(msg.includes('p2'));
    assert.ok(msg.includes('typescript'));
    assert.ok(msg.includes('3 saves'));
  });

  test('buildCommitMessage omits diff part when zero', () => {
    const msg = buildCommitMessage(
      '[Flaunt]',
      [{ timestamp: 1, kind: 'save', project: 'p', languageId: 'ts' }],
      { added: 0, removed: 0 },
      'UTC'
    );
    assert.ok(!msg.includes('+0/−0'));
  });

  test('migrateLegacySummary moves coding_summary.txt once', () => {
    const dir = makeTempRepo();
    fs.writeFileSync(path.join(dir, 'coding_summary.txt'), 'old data\n');
    const first = migrateLegacySummary(dir);
    assert.ok(first);
    assert.strictEqual(fs.existsSync(path.join(dir, 'coding_summary.txt')), false);
    const second = migrateLegacySummary(dir);
    assert.strictEqual(second, undefined);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
