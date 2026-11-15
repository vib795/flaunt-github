/**
 * Working-tree change detection, kept free of `vscode` imports so the rules can
 * be unit tested in plain Node (same split as intervalSchedule.ts /
 * statusState.ts).
 *
 * Why this exists: `git diff` with no revision compares the working tree to the
 * index, so it reports *nothing* for a file that was merely created — untracked
 * paths are invisible to it. An agent writing new files also produces no VS Code
 * save event, so the tick's first two signals (`hadSave`, dirty documents) stay
 * empty too. The result was that a night of unattended agent work could land as
 * zero commits.
 *
 * Detection therefore reads `git status`, which lists untracked paths and honors
 * .gitignore, and takes line counts from `git diff HEAD`, which covers staged as
 * well as unstaged tracked changes. Untracked files have no diff to measure, so
 * their lines are counted from the file contents by the caller.
 */

/** The parts of simple-git's `StatusResult` this module relies on. */
export interface GitStatusLike {
  /** Untracked paths. git already filters .gitignore out of this list. */
  not_added: string[];
  /** Staged additions — `git add` of a previously untracked path. */
  created: string[];
  modified: string[];
  deleted: string[];
  renamed: { from: string; to: string }[];
  staged: string[];
}

/** The parts of simple-git's `DiffResult` this module relies on. */
export interface GitDiffLike {
  insertions: number;
  deletions: number;
  files: { file: string }[];
}

export interface WorkspaceChange {
  /** Whether this interval saw anything worth committing. */
  changed: boolean;
  /** Distinct paths touched, after ignore filtering. */
  paths: string[];
  /**
   * Untracked paths among `paths`. These contribute nothing to `linesAdded`
   * because `git diff` cannot see them; the caller reads and counts them.
   */
  untracked: string[];
  /** Insertions across tracked changes, from `git diff HEAD`. */
  linesAdded: number;
  /** Deletions across tracked changes, from `git diff HEAD`. */
  linesRemoved: number;
}

/** A path at or below git's own metadata directory. */
function isGitInternal(relPath: string): boolean {
  return relPath === '.git' || relPath.startsWith('.git/');
}

/**
 * Decide whether the working tree changed, and by how much.
 *
 * `isIgnored` is the extension's own `ignoreGlobs` matcher, applied on top of
 * .gitignore so a user's ignore settings suppress journal noise the same way
 * they already do for saves.
 */
export function summarizeWorkspaceChange(
  status: GitStatusLike,
  diff: GitDiffLike,
  isIgnored: (relPath: string) => boolean
): WorkspaceChange {
  const keep = (relPath: string): boolean =>
    relPath.length > 0 && !isGitInternal(relPath) && !isIgnored(relPath);

  // A rename surfaces as its destination; the source no longer exists to journal.
  const candidates = [
    ...status.not_added,
    ...status.created,
    ...status.modified,
    ...status.deleted,
    ...status.staged,
    ...status.renamed.map((r) => r.to)
  ].filter(keep);

  const paths = [...new Set(candidates)];
  const untracked = [...new Set(status.not_added.filter(keep))];

  // Only report diff lines when some surviving path is tracked. If every changed
  // file was ignored, the diff totals describe work the user asked not to see.
  const countDiff = diff.files.map((f) => f.file).some(keep);

  return {
    changed: paths.length > 0,
    paths,
    untracked,
    linesAdded: countDiff ? diff.insertions : 0,
    linesRemoved: countDiff ? diff.deletions : 0
  };
}

/** Largest file the caller should read in order to count added lines. */
export const MAX_COUNTED_BYTES = 2 * 1024 * 1024;

/**
 * Lines in a newly created file. Returns 0 for content that sniffs as binary, so
 * adding an image or a compiled artifact registers as a touched file without
 * inventing a line count for it.
 */
export function countAddedLines(content: string): number {
  if (content.length === 0) {return 0;}
  if (content.includes('\0')) {return 0;}
  return content.endsWith('\n')
    ? content.split('\n').length - 1
    : content.split('\n').length;
}
