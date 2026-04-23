import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FileLock } from '../lockfile';

suite('FileLock', () => {
  test('single process acquires and releases', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flaunt-lock-'));
    const lock = new FileLock(dir, 'test.lock');
    assert.strictEqual(lock.tryAcquire(), true);
    assert.strictEqual(lock.isHeld(), true);
    lock.release();
    assert.strictEqual(lock.isHeld(), false);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('second lock in same process can take over', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flaunt-lock-'));
    const a = new FileLock(dir, 'test.lock');
    assert.strictEqual(a.tryAcquire(), true);
    const b = new FileLock(dir, 'test.lock');
    assert.strictEqual(b.tryAcquire(), true);
    a.release();
    b.release();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('stale lock (from different pid) is overtaken', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flaunt-lock-'));
    const lockPath = path.join(dir, 'test.lock');
    fs.writeFileSync(
      lockPath,
      JSON.stringify({ pid: 999999, updatedAt: Date.now() - 10 * 60_000 })
    );
    const l = new FileLock(dir, 'test.lock');
    assert.strictEqual(l.tryAcquire(), true);
    l.release();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('fresh lock from different pid blocks acquisition', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flaunt-lock-'));
    const lockPath = path.join(dir, 'test.lock');
    fs.writeFileSync(
      lockPath,
      JSON.stringify({ pid: 999999, updatedAt: Date.now() })
    );
    const l = new FileLock(dir, 'test.lock');
    assert.strictEqual(l.tryAcquire(), false);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
