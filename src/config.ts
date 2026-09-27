import * as core from '@actions/core';
import * as github from '@actions/github';
import {
  parseBoolInput,
  parseExtraHeaders,
  parseFloatInput,
  parseIntInput,
  sanitizeRepoPath,
  toCsvList,
} from './sanitize';
import { HARD_MAX_FILES, HARD_MAX_ITERATIONS } from './constants';

export interface ActionConfig {
  githubToken: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  extraHeaders: Record<string, string>;
  temperature: number;
  maxIterations: number;
  maxFiles: number;
  includeExtensions: string[];
  excludeExtensions: string[];
  includePaths: string[];
  excludePaths: string[];
  reviewRulesFile: string;
  failActionIfReviewFailed: boolean;
  owner: string;
  repo: string;
  pullNumber: number;
}

export function loadConfig(): ActionConfig {
  const githubToken = core.getInput('github_token', { required: true });
  const apiKey = core.getInput('api_key', { required: true });
  core.setSecret(githubToken);
  core.setSecret(apiKey);

  const baseUrl = core.getInput('base_url') || 'https://api.openai.com/v1';
  const model = core.getInput('model', { required: true });
  const extraHeaders = parseExtraHeaders(core.getInput('extra_headers'));
  for (const value of Object.values(extraHeaders)) core.setSecret(value);

  const pullRequest = github.context.payload.pull_request;
  if (!pullRequest) {
    throw new Error('This action must be triggered by a pull_request (or pull_request_target) event.');
  }

  return {
    githubToken,
    apiKey,
    baseUrl,
    model,
    extraHeaders,
    temperature: parseFloatInput(core.getInput('temperature'), 0.2),
    maxIterations: parseIntInput(core.getInput('max_iterations'), 40, 1, HARD_MAX_ITERATIONS),
    maxFiles: parseIntInput(core.getInput('max_files'), 60, 1, HARD_MAX_FILES),
    includeExtensions: toCsvList(core.getInput('include_extensions')),
    excludeExtensions: toCsvList(core.getInput('exclude_extensions')),
    includePaths: toCsvList(core.getInput('include_paths')),
    excludePaths: toCsvList(core.getInput('exclude_paths')),
    reviewRulesFile: sanitizeRepoPath(core.getInput('review_rules_file')),
    failActionIfReviewFailed: parseBoolInput(core.getInput('fail_action_if_review_failed')),
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    pullNumber: pullRequest.number,
  };
}
