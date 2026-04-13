# Princess

Princess is a repo-to-repo transformer for folder names.

Given an existing repository, Princess analyzes what each directory is for, proposes a normalized "Princess-optimized" directory name, creates a renamed copy of the repo, rewrites affected references inside that copy, and leaves the original repo untouched.

The naming grammar is simple:

```text
purpose--directive--directive
```

Examples:

- `docs--product-spec`
- `schemas--json-contracts`
- `src--cli-and-pipeline`
- `components--shared-ui`
- `lib--pure-ts`

## Methodology

Princess does not rename from the current folder name alone. It builds a dossier for each directory from:

- representative filenames
- extension counts
- framework hints
- route and test signals
- local instruction files
- parent and sibling context

Then it applies a conservative decision rule:

- rename only when the purpose is clear
- keep strong names as-is
- ignore generated paths
- leave low-confidence folders untouched

The point is not novelty for its own sake. The point is to make directory purpose legible enough that an AI agent or a human can infer how a repo is organized from the tree itself.

## Install

Princess currently targets Bun.

Local install on this machine:

```bash
bun link
```

After that, the `princess` command is available in your shell.

## Tool

The first version is intentionally narrow:

- Input: a local JavaScript or TypeScript repo
- Output: a sibling repo with directory renames applied
- Safety: the source repo is never modified
- Scope: directories first, files later if ever

Today the executable scaffold implements the dry-run half of that contract:

- scan a repo
- build folder dossiers
- infer rename proposals with the heuristic engine or the OpenAI model adapter
- emit a rename plan in dry-run mode
- create a sibling output repo in apply mode
- rename approved directories in the copied repo
- rewrite affected relative imports in the copied repo
- rewrite supported config paths in the copied repo
- write `.princess/rename-plan.json` and `.princess/run-manifest.json`

The current CLI supports:

- `--engine heuristic` for deterministic local inference
- `--engine model` for OpenAI Responses API inference
- `--engine auto` to try the model path first and fall back to heuristics
- `--dry-run` to analyze without writing
- `--force` to replace an existing output repo
- `--preserve-git` to copy the source `.git` directory into the output repo

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

## We Use It Here

This repo is already using Princess naming at the top level:

- `docs--product-spec`
- `examples--reference-output`
- `fixtures--sample-repos`
- `schemas--json-contracts`
- `src--cli-and-pipeline`

We also ran Princess analysis against the embedded sample repo and applied the resulting folder renames there:

- `src/components` -> `src/components--shared-ui`
- `src/hooks` -> `src/hooks--react-state`
- `src/lib` -> `src/lib--pure-ts`
- `src/types` -> `src/types--domain-types`

That is deliberate dogfooding. The tool is not just describing this method; it is starting to use it inside its own workspace.

At this point, running Princess against this repo in heuristic mode yields zero rename candidates. That is the target behavior once a repo has already taken the naming pass.

## Run the scaffold

```bash
bun run src--cli-and-pipeline/cli.ts optimize . --dry-run
```

Apply mode:

```bash
bun run src--cli-and-pipeline/cli.ts optimize .
```

Verify an output repo:

```bash
bun run src--cli-and-pipeline/cli.ts verify ../princess-princess
```

JSON mode:

```bash
bun run src--cli-and-pipeline/cli.ts optimize . --dry-run --json
```

Model mode:

```bash
OPENAI_API_KEY=... bun run src--cli-and-pipeline/cli.ts optimize . --dry-run --engine model
```

Auto mode:

```bash
bun run src--cli-and-pipeline/cli.ts optimize . --dry-run --engine auto
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

## Current Status

What exists now:

- repo discovery and folder dossier generation
- heuristic inference
- OpenAI model-backed inference with structured JSON output
- dry-run planning and reporting
- copied output repo generation
- applied directory renames in the output repo
- relative import rewriting in the output repo
- config-path rewriting for `tsconfig.json`, `jsconfig.json`, and common JS/TS config files such as `vite.config.ts`
- `.princess` manifest artifacts in the output repo

What does not exist yet:

- package script rewriting and broader config coverage
- framework-aware verification like `tsc`, `vite build`, or `next lint`
- a packaged release beyond local Bun linking

## Config Rewrite Coverage

Princess currently rewrites:

- `compilerOptions.paths` values in `tsconfig.json` and `jsconfig.json`
- other path-oriented fields such as `include`, `exclude`, `files`, `references[].path`, and `extends` in those files
- simple path-like string literals in common JS/TS config files such as `vite.config.ts`

Princess does not yet rewrite arbitrary shell commands in `package.json` scripts.

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
