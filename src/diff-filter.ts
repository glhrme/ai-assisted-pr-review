import { minimatch } from 'minimatch';
import * as path from 'path';

export interface ChangedFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

export interface DiffFilterOptions {
  includeExtensions: string[];
  excludeExtensions: string[];
  includePaths: string[];
  excludePaths: string[];
}

function matchesAny(filePath: string, patterns: string[]): boolean {
  return patterns.some((pattern) => filePath.startsWith(pattern) || minimatch(filePath, pattern, { dot: true }));
}

export function filterChangedFiles(files: ChangedFile[], opts: DiffFilterOptions): ChangedFile[] {
  return files.filter((file) => {
    // Renames/deletions with no patch produce nothing useful to review.
    if (!file.patch) return false;

    const filePath = file.filename.replace(/\\/g, '/');
    const ext = path.posix.extname(filePath);

    const extIncluded = opts.includeExtensions.length === 0 || opts.includeExtensions.includes(ext);
    const extExcluded = opts.excludeExtensions.includes(ext);
    const pathIncluded = opts.includePaths.length === 0 || matchesAny(filePath, opts.includePaths);
    const pathExcluded = opts.excludePaths.length > 0 && matchesAny(filePath, opts.excludePaths);

    return extIncluded && !extExcluded && pathIncluded && !pathExcluded;
  });
}

/**
 * Extracts the set of valid (side, line) positions from a unified diff patch,
 * so the agent's line-number claims can be validated before we call the
 * GitHub review-comment API (which 422s on lines outside the diff).
 */
export interface DiffLine {
  side: 'LEFT' | 'RIGHT';
  line: number;
}

export function parsePatchLines(patch: string): DiffLine[] {
  const lines: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const rawLine of patch.split('\n')) {
    const hunkHeader = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(rawLine);
    if (hunkHeader) {
      oldLine = Number.parseInt(hunkHeader[1], 10);
      newLine = Number.parseInt(hunkHeader[2], 10);
      continue;
    }
    if (rawLine.startsWith('+') && !rawLine.startsWith('+++')) {
      lines.push({ side: 'RIGHT', line: newLine });
      newLine++;
    } else if (rawLine.startsWith('-') && !rawLine.startsWith('---')) {
      lines.push({ side: 'LEFT', line: oldLine });
      oldLine++;
    } else if (!rawLine.startsWith('\\')) {
      lines.push({ side: 'RIGHT', line: newLine });
      oldLine++;
      newLine++;
    }
  }
  return lines;
}

export function isLineInPatch(patch: string, side: 'LEFT' | 'RIGHT', line: number): boolean {
  return parsePatchLines(patch).some((entry) => entry.side === side && entry.line === line);
}
