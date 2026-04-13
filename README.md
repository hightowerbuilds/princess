# Princess

Princess is a repo-to-repo transformer.

Given an existing repository, Princess analyzes what each directory is for, proposes a normalized "Princess-optimized" directory name, creates a renamed copy of the repo, rewrites affected references inside that copy, and leaves the original repo untouched.

The first version is intentionally narrow:

- Input: a local JavaScript or TypeScript repo
- Output: a sibling repo with directory renames applied
- Safety: the source repo is never modified
- Scope: directories first, files later if ever

Today the executable scaffold implements the dry-run half of that contract:

- scan a repo
- build folder dossiers
- infer rename proposals with the heuristic engine or the OpenAI model adapter
- emit a rename plan without copying or mutating anything

## Current v0 focus

- Define the CLI contract
- Define the model prompt contract
- Define the rename plan and manifest schemas
- Define the naming grammar and safety rules
- Scaffold implementation-facing TypeScript contracts

## Proposed command

```bash
princess optimize /path/to/repo --out /path/to/repo-princess
```

Supporting modes:

- `princess optimize <repo> --dry-run`
- `princess optimize <repo> --json`
- `princess verify <repo-princess>`

## Run the scaffold

```bash
bun run src--cli-and-pipeline/cli.ts optimize fixtures--sample-repos/sample-repo --dry-run
```

JSON mode:

```bash
bun run src--cli-and-pipeline/cli.ts optimize fixtures--sample-repos/sample-repo --dry-run --json
```

Model mode:

```bash
OPENAI_API_KEY=... bun run src--cli-and-pipeline/cli.ts optimize fixtures--sample-repos/sample-repo --dry-run --engine model
```

Auto mode:

```bash
bun run src--cli-and-pipeline/cli.ts optimize fixtures--sample-repos/sample-repo --dry-run --engine auto
```

`auto` tries the model path first and falls back to heuristics if the API path is unavailable or invalid.

## Model config

Supported environment variables:

- `OPENAI_API_KEY`
- `PRINCESS_OPENAI_MODEL`
- `PRINCESS_OPENAI_BASE_URL`
- `PRINCESS_OPENAI_REASONING_EFFORT`
- `PRINCESS_OPENAI_TIMEOUT_MS`
- `PRINCESS_OPENAI_MAX_DOSSIERS_PER_CALL`

## Repo layout

- [`docs--product-spec/v0-spec.md`](/Users/lukehightower/Desktop/websites/princess/docs--product-spec/v0-spec.md)
- [`docs--product-spec/prompt-contract.md`](/Users/lukehightower/Desktop/websites/princess/docs--product-spec/prompt-contract.md)
- [`schemas--json-contracts/model-output.schema.json`](/Users/lukehightower/Desktop/websites/princess/schemas--json-contracts/model-output.schema.json)
- [`schemas--json-contracts/rename-plan.schema.json`](/Users/lukehightower/Desktop/websites/princess/schemas--json-contracts/rename-plan.schema.json)
- [`schemas--json-contracts/run-manifest.schema.json`](/Users/lukehightower/Desktop/websites/princess/schemas--json-contracts/run-manifest.schema.json)
- [`src--cli-and-pipeline/cli.ts`](/Users/lukehightower/Desktop/websites/princess/src--cli-and-pipeline/cli.ts)
- [`src--cli-and-pipeline/contracts.ts`](/Users/lukehightower/Desktop/websites/princess/src--cli-and-pipeline/contracts.ts)
- [`src--cli-and-pipeline/discovery.ts`](/Users/lukehightower/Desktop/websites/princess/src--cli-and-pipeline/discovery.ts)
- [`src--cli-and-pipeline/infer.ts`](/Users/lukehightower/Desktop/websites/princess/src--cli-and-pipeline/infer.ts)
- [`src--cli-and-pipeline/naming.ts`](/Users/lukehightower/Desktop/websites/princess/src--cli-and-pipeline/naming.ts)
- [`src--cli-and-pipeline/pipeline.ts`](/Users/lukehightower/Desktop/websites/princess/src--cli-and-pipeline/pipeline.ts)
- [`src--cli-and-pipeline/report.ts`](/Users/lukehightower/Desktop/websites/princess/src--cli-and-pipeline/report.ts)
