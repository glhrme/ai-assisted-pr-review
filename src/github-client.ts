import * as github from '@actions/github';
import * as core from '@actions/core';
import { MAX_FILE_BYTES, REVIEW_MARKER_PREFIX, REVIEW_MARKER_SUFFIX } from './constants';
import type { ChangedFile } from './diff-filter';
import { isLineInPatch } from './diff-filter';

type Octokit = ReturnType<typeof github.getOctokit>;

export class GitHubClient {
  private readonly octokit: Octokit;

  constructor(token: string) {
    this.octokit = github.getOctokit(token);
  }

  async getPullRequest(owner: string, repo: string, pullNumber: number) {
    const { data } = await this.octokit.rest.pulls.get({ owner, repo, pull_number: pullNumber });
    return data;
  }

  async getFilesBetweenCommits(owner: string, repo: string, base: string, head: string): Promise<ChangedFile[]> {
    if (base === head) return [];
    const { data } = await this.octokit.rest.repos.compareCommits({ owner, repo, base, head });
    const files = data.files ?? [];
    return files.map((f: (typeof files)[number]) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      changes: f.changes,
      patch: f.patch,
    }));
  }

  /**
   * Reads the last-reviewed commit marker from prior review comments so a
   * subsequent push only gets the incremental diff reviewed, not the whole
   * PR again.
   */
  async findLastReviewedCommit(owner: string, repo: string, pullNumber: number): Promise<string | null> {
    const comments = await this.octokit.paginate(this.octokit.rest.issues.listComments, {
      owner,
      repo,
      issue_number: pullNumber,
      per_page: 100,
    });
    for (let i = comments.length - 1; i >= 0; i--) {
      const body = comments[i].body ?? '';
      const idx = body.indexOf(REVIEW_MARKER_PREFIX);
      if (idx === -1) continue;
      const start = idx + REVIEW_MARKER_PREFIX.length;
      const end = body.indexOf(REVIEW_MARKER_SUFFIX, start);
      if (end === -1) continue;
      const sha = body.slice(start, end).trim();
      if (sha) return sha;
    }
    return null;
  }

  async createSummaryComment(owner: string, repo: string, pullNumber: number, headSha: string, summary: string): Promise<void> {
    const body = `${REVIEW_MARKER_PREFIX}${headSha}${REVIEW_MARKER_SUFFIX}\n\n${summary}`;
    await this.octokit.rest.issues.createComment({ owner, repo, issue_number: pullNumber, body });
  }

  async createReviewComment(
    owner: string,
    repo: string,
    pullNumber: number,
    commitId: string,
    filePath: string,
    body: string,
    side: 'LEFT' | 'RIGHT',
    startLine: number,
    endLine: number,
  ): Promise<void> {
    if (startLine === endLine) {
      await this.octokit.rest.pulls.createReviewComment({
        owner,
        repo,
        pull_number: pullNumber,
        commit_id: commitId,
        path: filePath,
        body,
        side,
        line: startLine,
      });
    } else {
      await this.octokit.rest.pulls.createReviewComment({
        owner,
        repo,
        pull_number: pullNumber,
        commit_id: commitId,
        path: filePath,
        body,
        side,
        line: endLine,
        start_side: side,
        start_line: startLine,
      });
    }
  }

  /** Returns text content of a file at a given ref, or a placeholder for binary/oversized/missing files. */
  async getFileContent(owner: string, repo: string, ref: string, filePath: string): Promise<string> {
    try {
      const { data } = await this.octokit.rest.repos.getContent({ owner, repo, path: filePath, ref });

      if (Array.isArray(data)) {
        return `[directory: ${data.map((e) => e.name).join(', ')}]`;
      }
      if (data.type !== 'file') {
        return `[${data.type}, not shown]`;
      }
      if (data.size > MAX_FILE_BYTES) {
        return `[file too large to display: ${Math.round(data.size / 1024)}KB]`;
      }
      if (!data.content || data.encoding !== 'base64') {
        return '[binary or unavailable file content]';
      }
      return Buffer.from(data.content, 'base64').toString('utf-8');
    } catch (error) {
      core.warning(`getFileContent(${filePath}@${ref}) failed: ${(error as Error).message}`);
      return `[error reading file: ${(error as Error).message}]`;
    }
  }

  validateCommentTarget(files: ChangedFile[], filePath: string, side: 'LEFT' | 'RIGHT', line: number): string | null {
    const file = files.find((f) => f.filename === filePath);
    if (!file) return `File "${filePath}" is not part of this pull request's diff.`;
    if (!file.patch) return `File "${filePath}" has no diff hunk to comment on.`;
    if (!isLineInPatch(file.patch, side, line)) {
      return `Line ${line} (side ${side}) of "${filePath}" is not part of the diff hunk. Pick a line that was actually added/removed.`;
    }
    return null;
  }
}
