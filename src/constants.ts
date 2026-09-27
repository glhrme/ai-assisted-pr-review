// Marker embedded in the PR comment to detect the last reviewed commit and
// support incremental review across pushes.
export const REVIEW_MARKER_PREFIX = '<!-- ai-assisted-pr-review: reviewed-up-to=';
export const REVIEW_MARKER_SUFFIX = ' -->';

export const SUMMARY_HEADER = '### AI Review Summary';

// Hard caps that apply regardless of user input, to bound cost/latency and
// protect against a runaway agent loop.
export const MAX_FILE_BYTES = 1024 * 1024; // 1MB
export const CONTEXT_LINE_SPAN = 20;
export const MAX_CACHE_ENTRIES = 500;
export const HARD_MAX_ITERATIONS = 100;
export const HARD_MAX_FILES = 200;

export const RETRYABLE_STATUS_CODES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
export const MAX_LLM_RETRIES = 4;
export const RETRY_BASE_DELAY_MS = 1000;
