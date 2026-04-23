import * as path from 'path';

function globToRegex(glob: string): RegExp {
  let re = '^';
  let i = 0;
  while (i < glob.length) {
    const ch = glob[i];
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        re += '.*';
        i += 2;
        if (glob[i] === '/') {i++;}
      } else {
        re += '[^/]*';
        i++;
      }
    } else if (ch === '?') {
      re += '[^/]';
      i++;
    } else if ('.+^$(){}|[]\\'.includes(ch)) {
      re += '\\' + ch;
      i++;
    } else {
      re += ch;
      i++;
    }
  }
  re += '$';
  return new RegExp(re);
}

export class IgnoreMatcher {
  private patterns: RegExp[];

  constructor(globs: string[]) {
    this.patterns = globs.map(globToRegex);
  }

  matches(relPath: string): boolean {
    const normalized = relPath.replace(/\\/g, '/');
    return this.patterns.some((r) => r.test(normalized));
  }
}

export function redactPath(relPath: string): string {
  const ext = path.extname(relPath);
  const depth = relPath.split('/').length;
  return `<redacted:${depth}>${ext}`;
}
