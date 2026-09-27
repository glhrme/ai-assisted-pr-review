import * as core from '@actions/core';
import { loadConfig } from './config';
import { GitHubClient } from './github-client';
import { LlmClient } from './llm-client';
import { ReviewAgent } from './review-agent';
import { filterChangedFiles } from './diff-filter';

async function run(): Promise<void> {
  const config = loadConfig();
  const github = new GitHubClient(config.githubToken);

  try {
    const pullRequest = await github.getPullRequest(config.owner, config.repo, config.pullNumber);
    const headSha = pullRequest.head.sha;

    const lastReviewedSha = await github.findLastReviewedCommit(config.owner, config.repo, config.pullNumber);
    const baseSha = lastReviewedSha ?? pullRequest.base.sha;
    if (lastReviewedSha) {
      core.info(`Found a previous review; diffing incrementally from ${lastReviewedSha} to ${headSha}.`);
    } else {
      core.info('No previous review found; reviewing the full PR diff.');
    }

    const allChangedFiles = await github.getFilesBetweenCommits(config.owner, config.repo, baseSha, headSha);
    const changedFiles = filterChangedFiles(allChangedFiles, {
      includeExtensions: config.includeExtensions,
      excludeExtensions: config.excludeExtensions,
      includePaths: config.includePaths,
      excludePaths: config.excludePaths,
    }).slice(0, config.maxFiles);

    if (changedFiles.length === 0) {
      core.info('No files to review after filtering.');
      return;
    }
    core.info(`Reviewing ${changedFiles.length} file(s).`);

    let reviewRulesContent: string | null = null;
    if (config.reviewRulesFile) {
      reviewRulesContent = await github.getFileContent(config.owner, config.repo, headSha, config.reviewRulesFile);
      if (reviewRulesContent.startsWith('[error') || reviewRulesContent.startsWith('[binary')) {
        core.warning(`Could not load review_rules_file "${config.reviewRulesFile}": ${reviewRulesContent}`);
        reviewRulesContent = null;
      }
    }

    const llm = new LlmClient({ apiKey: config.apiKey, baseURL: config.baseUrl, extraHeaders: config.extraHeaders });
    const agent = new ReviewAgent({
      llm,
      github,
      model: config.model,
      temperature: config.temperature,
      maxIterations: config.maxIterations,
      owner: config.owner,
      repo: config.repo,
      pullNumber: config.pullNumber,
      headSha,
      baseSha,
      reviewRulesContent,
    });

    const summary = await agent.run(changedFiles);
    await github.createSummaryComment(config.owner, config.repo, config.pullNumber, headSha, summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof Error) core.debug(error.stack ?? message);
    if (config.failActionIfReviewFailed) {
      core.setFailed(message);
    } else {
      core.warning(`AI review failed but the step was configured not to fail the workflow: ${message}`);
    }
  }
}

run();
