# AI Assisted PR Review

A GitHub Action that runs an agentic AI code review on pull requests, against **any OpenAI-compatible endpoint** — not just the big hosted providers.

It grew out of reviewing two existing projects ([`AleksandrFurmenkovOfficial/ai-code-review`](https://github.com/AleksandrFurmenkovOfficial/ai-code-review) and [`villesau/ai-codereviewer`](https://github.com/villesau/ai-codereviewer)) that either hardcode a fixed list of vendor SDKs or only ever talk to `api.openai.com`. This action instead exposes `api_key` + `base_url` (+ optional custom headers) directly, so it works out of the box with:

- OpenAI
- Azure OpenAI
- OpenRouter, Groq, Together, Fireworks, DeepSeek, Mistral (any OpenAI-compatible API)
- A LiteLLM proxy in front of anything (Anthropic, Bedrock, Vertex, ...)
- A self-hosted vLLM / Ollama / LM Studio server

## How it works

1. On `pull_request` (opened/synchronize/reopened), the action fetches the changed files between the base and head commit.
2. It runs an **agentic loop**: the model is given the diff and three tools —
   `get_file_content` (fetch extra context around a hunk), `add_review_comment` (post an inline comment on a line that is actually part of the diff), and `mark_as_done` (finish with a summary).
3. It posts inline review comments plus one summary comment on the PR. The summary comment embeds a hidden marker with the reviewed commit SHA, so the **next push only gets the incremental diff reviewed**, not the whole PR again.

Comment targets are validated against the real diff hunks before calling the GitHub API, so the model can't crash the run by inventing a line number that isn't part of the patch — it gets an error back and can retry.

## Usage

```yaml
name: AI PR Review
on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: your-org/ai-assisted-pr-review@v1
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          api_key: ${{ secrets.LLM_API_KEY }}
          model: gpt-4.1-mini
          # base_url defaults to https://api.openai.com/v1
```

### Azure OpenAI

```yaml
      - uses: your-org/ai-assisted-pr-review@v1
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          api_key: ${{ secrets.AZURE_OPENAI_KEY }}
          base_url: 'https://<resource>.openai.azure.com/openai/deployments/<deployment>'
          model: '<deployment>'
          extra_headers: '{"api-key": "${{ secrets.AZURE_OPENAI_KEY }}"}'
```

### OpenRouter / Groq / Together / any OpenAI-compatible gateway

```yaml
      - uses: your-org/ai-assisted-pr-review@v1
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          api_key: ${{ secrets.OPENROUTER_API_KEY }}
          base_url: 'https://openrouter.ai/api/v1'
          model: 'anthropic/claude-sonnet-4.5'
```

### Self-hosted (vLLM / Ollama / LiteLLM proxy)

```yaml
      - uses: your-org/ai-assisted-pr-review@v1
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          api_key: ${{ secrets.INTERNAL_LLM_KEY }}   # any placeholder value if the gateway doesn't check it
          base_url: 'https://llm-gateway.internal.example.com/v1'
          model: 'llama-3.1-70b-instruct'
```

## Inputs

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| `github_token` | yes | — | Token to read the PR and post comments. Usually `secrets.GITHUB_TOKEN`. |
| `api_key` | yes | — | API key for the LLM endpoint. |
| `base_url` | no | `https://api.openai.com/v1` | Any OpenAI-compatible Chat Completions base URL. |
| `model` | yes | — | Model name / deployment id as expected by the endpoint. |
| `extra_headers` | no | `''` | JSON object of extra headers merged into every request (e.g. Azure's `api-key`). |
| `temperature` | no | `0.2` | Sampling temperature. |
| `max_iterations` | no | `40` | Cap on agent tool-calling round-trips. |
| `max_files` | no | `60` | Cap on number of changed files reviewed per run. |
| `include_extensions` / `exclude_extensions` | no | `''` | Comma-separated extension filters, e.g. `.py,.ts`. |
| `include_paths` / `exclude_paths` | no | `''` | Comma-separated path-prefix/glob filters, e.g. `src/,app/`. |
| `review_rules_file` | no | `''` | Repo-relative path to a file with extra instructions appended to the system prompt. |
| `fail_action_if_review_failed` | no | `false` | Fail the workflow step if the review errors out. |

## Security notes

- `api_key`, `github_token`, and any string values inside `extra_headers` are registered as secrets (masked in logs) as soon as they're read.
- The diff, file contents, and file paths from the PR are treated as **untrusted data** in the system prompt — the model is explicitly told not to follow instructions embedded in them (prompt-injection mitigation). The only tools available to it are read-only file access scoped to the repo (via the GitHub Contents API) and posting a review comment; it has no shell or filesystem access.
- `dist/index.js` is a committed, bundled build (via `esbuild`) — the action does **not** run `npm install` at execution time, so it doesn't pull dependencies from the registry on every PR run.

## Development

```bash
npm install
npm run typecheck
npm run build   # regenerates dist/index.js — commit it
```

CI fails if `dist/` is out of date with `src/`.
