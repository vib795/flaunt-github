import * as assert from 'assert';
import {
  countAddedLines,
  GitDiffLike,
  GitStatusLike,
  summarizeWorkspaceChange
} from '../workspaceChange';

function status(over: Partial<GitStatusLike> = {}): GitStatusLike {
  return {
    not_added: [],
    created: [],
    modified: [],
    deleted: [],
    renamed: [],
    staged: [],
    ...over
  };
}

function diff(over: Partial<GitDiffLike> = {}): GitDiffLike {
  return { insertions: 0, deletions: 0, files: [], ...over };
}

const nothingIgnored = (): boolean => false;

suite('summarizeWorkspaceChange', () => {
  test('a quiet tree reports no change', () => {
    const out = summarizeWorkspaceChange(status(), diff(), nothingIgnored);
    assert.strictEqual(out.changed, false);
    assert.deepStrictEqual(out.paths, []);
    assert.strictEqual(out.linesAdded, 0);
  });

  /**
   * The regression this module exists for: an agent creates a file and makes no
   * other change. `git diff` is empty because the path is untracked, so the old
   * bare-diffSummary check concluded "no activity" and skipped the commit.
   */
  test('a newly created file alone counts as activity', () => {
    const out = summarizeWorkspaceChange(
      status({ not_added: ['src/NewFeature.ts'] }),
      diff(),
      nothingIgnored
    );
    assert.strictEqual(out.changed, true);
    assert.deepStrictEqual(out.paths, ['src/NewFeature.ts']);
    assert.deepStrictEqual(out.untracked, ['src/NewFeature.ts']);
  });

  test('modified tracked files carry their diff line counts', () => {
    const out = summarizeWorkspaceChange(
      status({ modified: ['src/a.ts'] }),
      diff({ insertions: 12, deletions: 3, files: [{ file: 'src/a.ts' }] }),
      nothingIgnored
    );
    assert.strictEqual(out.changed, true);
    assert.strictEqual(out.linesAdded, 12);
    assert.strictEqual(out.linesRemoved, 3);
    assert.deepStrictEqual(out.untracked, []);
  });

  /** Staged-but-uncommitted work is invisible to bare `git diff` too. */
  test('staged changes count as activity', () => {
    const out = summarizeWorkspaceChange(
      status({ staged: ['src/b.ts'], created: ['src/b.ts'] }),
      diff({ insertions: 5, files: [{ file: 'src/b.ts' }] }),
      nothingIgnored
    );
    assert.strictEqual(out.changed, true);
    assert.deepStrictEqual(out.paths, ['src/b.ts']);
  });

  test('a path appearing in several status buckets is counted once', () => {
    const out = summarizeWorkspaceChange(
      status({ modified: ['src/a.ts'], staged: ['src/a.ts'] }),
      diff(),
      nothingIgnored
    );
    assert.deepStrictEqual(out.paths, ['src/a.ts']);
  });

  test('a rename is journaled at its destination', () => {
    const out = summarizeWorkspaceChange(
      status({ renamed: [{ from: 'src/old.ts', to: 'src/new.ts' }] }),
      diff(),
      nothingIgnored
    );
    assert.deepStrictEqual(out.paths, ['src/new.ts']);
  });

  test('deletions count as activity', () => {
    const out = summarizeWorkspaceChange(
      status({ deleted: ['src/gone.ts'] }),
      diff({ deletions: 40, files: [{ file: 'src/gone.ts' }] }),
      nothingIgnored
    );
    assert.strictEqual(out.changed, true);
    assert.strictEqual(out.linesRemoved, 40);
  });

  test('git internals never register as activity', () => {
    const out = summarizeWorkspaceChange(
      status({ not_added: ['.git/COMMIT_EDITMSG'], modified: ['.git'] }),
      diff(),
      nothingIgnored
    );
    assert.strictEqual(out.changed, false);
  });

  test('ignoreGlobs suppress matching paths', () => {
    const out = summarizeWorkspaceChange(
      status({ not_added: ['dist/bundle.js', 'src/real.ts'] }),
      diff(),
      (p) => p.startsWith('dist/')
    );
    assert.deepStrictEqual(out.paths, ['src/real.ts']);
  });

  /** If every changed file is ignored, its line counts must not leak through. */
  test('diff totals are dropped when every changed file is ignored', () => {
    const out = summarizeWorkspaceChange(
      status({ modified: ['dist/bundle.js'] }),
      diff({
        insertions: 9000,
        deletions: 50,
        files: [{ file: 'dist/bundle.js' }]
      }),
      (p) => p.startsWith('dist/')
    );
    assert.strictEqual(out.changed, false);
    assert.strictEqual(out.linesAdded, 0);
    assert.strictEqual(out.linesRemoved, 0);
  });
});

suite('countAddedLines', () => {
  test('an empty file has no lines', () => {
    assert.strictEqual(countAddedLines(''), 0);
  });

  test('a trailing newline does not invent an extra line', () => {
    assert.strictEqual(countAddedLines('a\nb\nc\n'), 3);
  });

  test('a file without a trailing newline still counts its last line', () => {
    assert.strictEqual(countAddedLines('a\nb\nc'), 3);
  });

  test('binary content counts no lines', () => {
    assert.strictEqual(countAddedLines('PNG\0\0\0IHDR\n\n'), 0);
  });
});
