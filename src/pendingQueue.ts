import * as fs from 'fs';
import * as path from 'path';
import { ActivityEntry } from './types';
import { log } from './logger';

export class PendingQueue {
  private file: string;

  constructor(dir: string) {
    this.file = path.join(dir, 'pending.jsonl');
  }

  load(): ActivityEntry[] {
    if (!fs.existsSync(this.file)) {return [];}
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      return raw
        .split('\n')
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l) as ActivityEntry);
    } catch (e) {
      log(`Failed to load pending queue: ${String(e)}`);
      return [];
    }
  }

  persist(entries: ActivityEntry[]): void {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      if (entries.length === 0) {
        if (fs.existsSync(this.file)) {fs.unlinkSync(this.file);}
        return;
      }
      const out = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
      fs.writeFileSync(this.file, out, 'utf8');
    } catch (e) {
      log(`Failed to persist pending queue: ${String(e)}`);
    }
  }

  clear(): void {
    this.persist([]);
  }
}
