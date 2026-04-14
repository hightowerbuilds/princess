# Next Agent Handoff

## Current repo state

Recent commits:

- `a25c795 Add config path rewriting`
- `0d44673 Add Princess apply mode`
- `3893e3a Dogfood Princess naming in the sample repo`
- `922a98c Add OpenAI model inference adapter`

The current product loop works locally:

1. analyze a repo
2. build a rename plan
3. optionally call OpenAI for model-backed proposals
4. copy the repo to a sibling `-princess` output
5. apply directory renames in the copy
6. rewrite relative imports and supported config paths
7. write `.princess/rename-plan.json` and `.princess/run-manifest.json`
8. verify the output repo at a basic manifest level

Entry points:

- CLI: [src--cli-and-pipeline/cli.ts](/Users/lukehightower/Desktop/websites/princess/src--cli-and-pipeline/cli.ts)
- Planning/inference: [src--cli-and-pipeline/pipeline.ts](/Users/lukehightower/Desktop/websites/princess/src--cli-and-pipeline/pipeline.ts)
- OpenAI adapter: [src--cli-and-pipeline/model.ts](/Users/lukehightower/Desktop/websites/princess/src--cli-and-pipeline/model.ts)
- Apply/rewrite layer: [src--cli-and-pipeline/apply.ts](/Users/lukehightower/Desktop/websites/princess/src--cli-and-pipeline/apply.ts)
- Discovery/dossier builder: [src--cli-and-pipeline/discovery.ts](/Users/lukehightower/Desktop/websites/princess/src--cli-and-pipeline/discovery.ts)

## How AI is passed into the app

The AI path is CLI-driven, not server-driven.

Flow:

1. `princess optimize <repo>` enters through [src--cli-and-pipeline/cli.ts:41](/Users/lukehightower/Desktop/websites/princess/src--cli-and-pipeline/cli.ts:41).
2. The CLI scans the repo and builds `repoSummary` plus `dossiers` with [analyzeRepository](/Users/lukehightower/Desktop/websites/princess/src--cli-and-pipeline/discovery.ts:76).
3. The CLI calls [buildRenamePlan](/Users/lukehightower/Desktop/websites/princess/src--cli-and-pipeline/pipeline.ts:118).
4. `buildRenamePlan` calls [inferRenameProposals](/Users/lukehightower/Desktop/websites/princess/src--cli-and-pipeline/pipeline.ts:66).
5. `inferRenameProposals` chooses one of three engines in [src--cli-and-pipeline/pipeline.ts:69](/Users/lukehightower/Desktop/websites/princess/src--cli-and-pipeline/pipeline.ts:69):
   - `heuristic`
   - `model`
   - `auto`
6. If `model` or successful `auto` is used, the call goes into [inferModelRenameProposals](/Users/lukehightower/Desktop/websites/princess/src--cli-and-pipeline/model.ts:70).
7. The OpenAI adapter chunks directory dossiers, constructs a strict JSON payload, and sends it to the OpenAI Responses API with `text.format.type = "json_schema"` in [src--cli-and-pipeline/model.ts:193](/Users/lukehightower/Desktop/websites/princess/src--cli-and-pipeline/model.ts:193).

Important detail:

- The AI is not "injected" as a plugin object today.
- The AI integration is hardcoded as an OpenAI Responses client inside `model.ts`.
- The current default model is `gpt-5.4-mini` in [src--cli-and-pipeline/model.ts:12](/Users/lukehightower/Desktop/websites/princess/src--cli-and-pipeline/model.ts:12).

## What data is sent to OpenAI

Princess does not upload the entire repo by default.

What gets sent:

- `repoSummary`
- `thresholds`
- a batch of folder dossiers

The dossier fields sent upstream are assembled from [src--cli-and-pipeline/discovery.ts:258](/Users/lukehightower/Desktop/websites/princess/src--cli-and-pipeline/discovery.ts:258):

- `relativePath`
- `currentName`
- `parentPath`
- `childDirectories`
- `representativeFiles`
- `extensionCounts`
- `frameworkHints`
- `testHints`
- `instructionFiles`
- `staticSummary`

What stays local:

- full raw repo contents are not directly serialized into the model payload
- file inspection is done locally in [inspectFile](/Users/lukehightower/Desktop/websites/princess/src--cli-and-pipeline/discovery.ts:223)
- that inspection reads up to the first 4000 chars of up to 8 text files per directory only to derive hints

Practical implication:

- source code is not sent wholesale
- file names, directory names, path shapes, and high-level structural hints are sent
- sensitive path names can still leak information

## How users provide an API key

Right now the intended mechanism is environment variables.

The resolver lives in [resolveOpenAIModelConfig](/Users/lukehightower/Desktop/websites/princess/src--cli-and-pipeline/model.ts:98).

Current lookup order:

1. `options.apiKey`
2. `Bun.env.OPENAI_API_KEY`

There is no CLI flag for `--api-key`, and that is good. It keeps secrets out of shell history and process lists.

Current user-facing examples are in [README.md:148](/Users/lukehightower/Desktop/websites/princess/README.md:148).

Recommended current usage:

```bash
OPENAI_API_KEY=sk-... princess optimize /path/to/repo --dry-run --engine model
```

Also supported via env:

- `PRINCESS_OPENAI_MODEL`
- `PRINCESS_OPENAI_BASE_URL`
- `PRINCESS_OPENAI_REASONING_EFFORT`
- `PRINCESS_OPENAI_TIMEOUT_MS`
- `PRINCESS_OPENAI_MAX_DOSSIERS_PER_CALL`

Git protection:

- `.env` and `.env.local` are ignored in [.gitignore](/Users/lukehightower/Desktop/websites/princess/.gitignore:7)

Important nuance:

- the code reads from `Bun.env`
- Princess does not currently implement its own env-file loader or keychain storage
- if users rely on `.env`, that is a Bun/runtime concern, not a Princess feature

## Current security posture

What is good right now:

- the key is never committed in the repo by default because `.env` files are ignored
- the CLI sends requests directly to OpenAI over HTTPS from the user's machine
- `store: false` is set in the Responses request body in [src--cli-and-pipeline/model.ts:200](/Users/lukehightower/Desktop/websites/princess/src--cli-and-pipeline/model.ts:200)
- model output is validated before use in [validateModelBatchResponse](/Users/lukehightower/Desktop/websites/princess/src--cli-and-pipeline/model.ts:285)
- invalid model output is retried once and can fall back to heuristics in `auto` mode
- raw model output is not currently written into `.princess` manifests

What is not solved yet:

- there is no secret storage UX beyond env vars
- there is no OS keychain integration
- there is no backend proxy
- there is no per-path redaction policy before dossiers are sent
- there is no allowlist/denylist for directories that must never be sent to the model
- there is no org policy layer like "heuristic only" or "never send hidden dirs"
- there is no cost guardrail beyond chunking and timeout
- there is no audit log of exactly what dossier batches were sent

## Security recommendation for the next build phase

For the current CLI:

- keep using env vars for keys
- do not add a plain `--api-key` flag
- add docs for shell export and local `.env` usage only if you also document the risk clearly

If Princess becomes a desktop app:

- store the API key in the OS keychain, not a plaintext config file

If Princess becomes a web app:

- do not put the OpenAI key in the browser
- move model calls behind a backend you control
- authenticate users to your backend
- meter and rate-limit requests server-side

## Where the next agent should pick up

Highest-value next work:

1. Secret handling UX
- Decide whether Princess remains a local CLI-first tool or becomes a hosted app.
- If CLI-first, add explicit docs for `OPENAI_API_KEY` setup and possibly OS keychain support.
- If app/server-backed, design a backend secret flow before adding any browser UI.

2. Data minimization
- Add a redaction or exclusion layer before `requestModelChunk`.
- Candidate shape: `.princessignore` or CLI flags like `--exclude path1,path2`.
- Hidden/sensitive directories should be blockable even if the scanner sees them.

3. Safer model controls
- Add a `--no-network` or `--engine heuristic` default policy mode for sensitive repos.
- Add better reporting about what was sent to the model.

4. Verification depth
- Current verification is manifest-level only.
- Add optional framework-aware checks such as `tsc --noEmit`, `vite build`, `vitest --run`, etc.

5. Packaging
- `bun link` is enough for local install today.
- Real distribution still needs packaging and release workflow.

## Recommended short-term product position

Tell users this clearly:

- Princess is currently safest as a local CLI for repos you are comfortable summarizing to OpenAI.
- Model mode requires a user-supplied `OPENAI_API_KEY`.
- Heuristic mode is the no-network fallback.
- Browser-side key entry is not a supported design and should not be added casually.
