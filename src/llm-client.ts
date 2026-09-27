import OpenAI from 'openai';
import * as core from '@actions/core';
import { MAX_LLM_RETRIES, RETRY_BASE_DELAY_MS, RETRYABLE_STATUS_CODES } from './constants';

export interface LlmClientOptions {
  apiKey: string;
  baseURL: string;
  extraHeaders: Record<string, string>;
}

/**
 * Thin wrapper around the `openai` SDK configured to talk to *any*
 * OpenAI-compatible Chat Completions endpoint: official OpenAI, Azure OpenAI,
 * OpenRouter, Groq, Together, Fireworks, a LiteLLM proxy, or a self-hosted
 * vLLM/Ollama server. There is deliberately no per-vendor branching here —
 * `baseURL` + `extraHeaders` is enough to reach all of them.
 */
export class LlmClient {
  readonly client: OpenAI;

  constructor(opts: LlmClientOptions) {
    this.client = new OpenAI({
      apiKey: opts.apiKey,
      baseURL: opts.baseURL,
      defaultHeaders: Object.keys(opts.extraHeaders).length > 0 ? opts.extraHeaders : undefined,
    });
  }

  async createChatCompletion(
    params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_LLM_RETRIES; attempt++) {
      try {
        return await this.client.chat.completions.create(params);
      } catch (error) {
        lastError = error;
        const status = (error as { status?: number }).status;
        const retryable = status !== undefined && RETRYABLE_STATUS_CODES.has(status);
        if (!retryable || attempt === MAX_LLM_RETRIES) {
          throw error;
        }
        const delay = RETRY_BASE_DELAY_MS * 2 ** attempt + Math.random() * 250;
        core.warning(`LLM request failed (status ${status}), retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${MAX_LLM_RETRIES})`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  }
}
