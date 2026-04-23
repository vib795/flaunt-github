import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PendingQueue } from '../pendingQueue';
import { ActivityEntry } from '../types';

suite('PendingQueue', () => {
  test('persists and reloads', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flaunt-pq-'));
    const q = new PendingQueue(dir);
    const entries: ActivityEntry[] = [
      { timestamp: 1, kind: 'save', relPath: 'a.ts' },
      { timestamp: 2, kind: 'auto-snapshot', relPath: 'b.ts' }
    ];
    q.persist(entries);
    assert.deepStrictEqual(q.load(), entries);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('clear empties the queue file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flaunt-pq-'));
    const q = new PendingQueue(dir);
    q.persist([{ timestamp: 1, kind: 'save', relPath: 'a.ts' }]);
    q.clear();
    assert.deepStrictEqual(q.load(), []);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('load returns [] on missing file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flaunt-pq-'));
    const q = new PendingQueue(dir);
    assert.deepStrictEqual(q.load(), []);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
