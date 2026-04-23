import * as fs from 'fs';
import * as path from 'path';
import { log } from './logger';

const STALE_MS = 5 * 60_000;

interface LockPayload {
  pid: number;
  updatedAt: number;
}

export class FileLock {
  private lockPath: string;
  private refreshTimer?: NodeJS.Timeout;
  private held = false;

  constructor(dir: string, name = '.flaunt.lock') {
    this.lockPath = path.join(dir, name);
  }

  tryAcquire(): boolean {
    try {
      fs.mkdirSync(path.dirname(this.lockPath), { recursive: true });
    } catch {
      // parent dir may already exist
    }

    const existing = this.read();
    if (existing && Date.now() - existing.updatedAt < STALE_MS) {
      if (existing.pid !== process.pid) {
        return false;
      }
    }

    try {
      fs.writeFileSync(
        this.lockPath,
        JSON.stringify({ pid: process.pid, updatedAt: Date.now() })
      );
      this.held = true;
      this.refreshTimer = setInterval(() => this.refresh(), STALE_MS / 3);
      return true;
    } catch (e) {
      log(`Failed to write lockfile: ${String(e)}`);
      return false;
    }
  }

  private read(): LockPayload | undefined {
    try {
      const raw = fs.readFileSync(this.lockPath, 'utf8');
      return JSON.parse(raw) as LockPayload;
    } catch {
      return undefined;
    }
  }

  private refresh(): void {
    if (!this.held) {return;}
    try {
      fs.writeFileSync(
        this.lockPath,
        JSON.stringify({ pid: process.pid, updatedAt: Date.now() })
      );
    } catch (e) {
      log(`Failed to refresh lockfile: ${String(e)}`);
    }
  }

  release(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
    if (!this.held) {return;}
    try {
      const current = this.read();
      if (current && current.pid === process.pid) {
        fs.unlinkSync(this.lockPath);
      }
    } catch {
      // already gone
    }
    this.held = false;
  }

  isHeld(): boolean {
    return this.held;
  }
}
