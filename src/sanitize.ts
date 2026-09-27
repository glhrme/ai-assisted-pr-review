import * as path from 'path';

export function sanitizePlainText(value: string, maxLen = 20_000): string {
  // eslint-disable-next-line no-control-regex
  return value.trim().slice(0, maxLen).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

export function toCsvList(value: string | undefined | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Confines a repo-relative path to the repo root: strips traversal segments
 * and backslashes so a workflow input can't be used to read files outside
 * the intended tree via the GitHub Contents API path parameter.
 */
export function sanitizeRepoPath(value: string | undefined | null): string {
  if (!value) return '';
  const normalized = value.trim().replace(/\\/g, '/');
  if (!normalized) return '';
  const posixNormalized = path.posix.normalize(normalized).replace(/^(\.\.(\/|$))+/, '');
  return posixNormalized === '.' ? '' : posixNormalized.replace(/^\/+/, '');
}

export function parseBoolInput(value: string | undefined | null): boolean {
  if (!value) return false;
  return /^(true|1|yes)$/i.test(value.trim());
}

export function parseIntInput(value: string | undefined | null, fallback: number, min: number, max: number): number {
  const num = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(Math.max(num, min), max);
}

export function parseFloatInput(value: string | undefined | null, fallback: number): number {
  const num = Number.parseFloat(value ?? '');
  return Number.isFinite(num) ? num : fallback;
}

export function parseExtraHeaders(value: string | undefined | null): Record<string, string> {
  if (!value || !value.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('extra_headers must be a valid JSON object, e.g. {"api-key":"..."}');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('extra_headers must be a JSON object of string key/value pairs');
  }
  const headers: Record<string, string> = {};
  for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof val !== 'string') {
      throw new Error(`extra_headers.${key} must be a string`);
    }
    headers[key] = val;
  }
  return headers;
}
