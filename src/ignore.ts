import * as path from 'path';
import * as vscode from 'vscode';

export { IgnoreMatcher, redactPath } from './ignoreMatcher';

export interface ResolvedPath {
  project: string;
  relPath: string;
  absPath: string;
  outsideWorkspace: boolean;
}

export function resolveDocPath(uri: vscode.Uri): ResolvedPath | undefined {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  if (!folder) {
    return {
      project: '_external',
      relPath: path.basename(uri.fsPath),
      absPath: uri.fsPath,
      outsideWorkspace: true
    };
  }
  const rel = path.relative(folder.uri.fsPath, uri.fsPath).replace(/\\/g, '/');
  const outside = rel.startsWith('..');
  return {
    project: folder.name,
    relPath: outside ? path.basename(uri.fsPath) : rel,
    absPath: uri.fsPath,
    outsideWorkspace: outside
  };
}
