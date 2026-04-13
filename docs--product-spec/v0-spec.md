# Princess v0 Spec

## Product statement

Princess is a safe repo transformer that takes an existing repository, infers the purpose of each directory, and produces a renamed sibling copy that is more legible to AI agents and humans without mutating the source repo.

The core promise is simple:

- Princess never edits the source repo.
- Princess operates on a copied repo only.
- Princess renames directories conservatively.
- Princess rewrites references in the copied repo when needed.
- Princess leaves low-confidence paths unchanged.

## v0 goals

1. Accept a local JS/TS repository as input.
2. Build a dossier for each candidate directory.
3. Use static analysis plus a model to propose normalized names.
4. Create a sibling output repo.
5. Apply safe directory renames in the output repo.
6. Rewrite imports and known path references in the output repo.
7. Produce a machine-readable manifest and a readable report.
8. Verify the transformed repo with lightweight checks.

## Non-goals

- Supporting every language or framework in v0
- Renaming files in v0
- Editing the source repo in place
- Forcing a universal folder naming standard
- Full semantic correctness guarantees across arbitrary build systems

## Primary workflow

```bash
princess optimize ./my-repo
```

Expected behavior:

1. Scan the input repo.
2. Detect framework and repo shape.
3. Build folder dossiers.
4. Ask the model for rename proposals under a constrained grammar.
5. Create `./my-repo-princess`.
6. Apply approved renames inside the copied repo.
7. Rewrite imports and config paths in the copied repo.
8. Run verification.
9. Write a manifest and report to `.princess/`.

## CLI surface

### `princess optimize <repo>`

Required behavior:

- Resolve the absolute source path.
- Refuse to run if the output directory already exists unless `--force` is set.
- Refuse to run if the output path is inside the source repo.
- Default output path: sibling directory named `<repo>-princess`.

Flags:

- `--out <path>`: explicit output path
- `--dry-run`: analyze and emit a plan without copying or renaming
- `--json`: print the final plan or manifest as JSON
- `--max-depth <n>`: limit analysis depth
- `--min-confidence <0-1>`: minimum confidence required to rename
- `--include-hidden`: analyze hidden directories except ignored system paths
- `--preserve-git`: copy the `.git` directory when present
- `--force`: allow replacing an existing output directory

### `princess verify <repo>`

Run post-transform checks against an already generated Princess repo and emit a verification summary.

## Candidate directory selection

Princess should not ask the model about every directory indiscriminately.

Candidate inclusion heuristics:

- Directory contains source, config, docs, assets, tests, or templates
- Directory is not a dependency cache or generated output
- Directory has at least one non-ignored file in its subtree

Candidate exclusion heuristics:

- `.git`
- `node_modules`
- build outputs like `dist`, `build`, `.next`, `coverage`
- package manager caches and lockfile stores

## Folder dossier

Each candidate directory is summarized before any model call.

Required dossier fields:

- relative path
- current directory name
- parent path
- child directory names
- representative file names
- file extension counts
- import graph hints
- framework hints
- test adjacency hints
- local instruction files present
- short static summary

The model should reason over dossiers, not raw repo dumps.

## Princess naming grammar

Princess names are normalized and conservative.

Grammar:

```text
<purpose>[--<directive>][--<directive>][--<directive>]
```

Rules:

- Lowercase ASCII only
- Words are slugged with single hyphens
- Double hyphens separate semantic segments
- Maximum 4 total segments
- Maximum 56 characters total
- Segment 1 is mandatory and represents folder purpose
- Directives are optional and chosen from a controlled vocabulary when possible

Examples:

- `components--shared-ui`
- `hooks--react-state`
- `lib--pure-ts`
- `routes--auth-required`
- `docs--design-decisions`

Bad examples:

- `this-folder-has-all-of-our-shared-user-interface-components`
- `components__shared`
- `Components`
- `ui--things`

## Rename policy

Princess should rename only when the proposal meets all of the following:

- Confidence is at or above threshold
- New name is valid under Princess grammar
- New name is materially better than the current name
- No collision exists among siblings after rename
- No path policy or ignore rule blocks the rename

Princess should leave a folder unchanged when:

- Confidence is below threshold
- The current name is already strong
- The proposal is generic or redundant
- The folder appears generated or external

## Static analysis before model use

Model reasoning should be informed by hard evidence:

- file extensions and dominant languages
- framework fingerprints in config files
- import path patterns
- exported symbols and naming patterns
- colocated tests and stories
- route structure and special filenames
- asset and content patterns

The model is a planner over evidence, not the sole analyzer.

## Model output requirements

The model must return structured JSON only.

For each proposal:

- `relativePath`
- `currentName`
- `proposedName`
- `purpose`
- `directives`
- `confidence`
- `reasoning`
- `decision`
- `riskFlags`

Allowed decisions:

- `rename`
- `keep`
- `ignore`

## Reference rewriting scope

v0 should support reference rewriting for common JS/TS cases:

- relative imports in `.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.cjs`
- path aliases in `tsconfig.json` and `jsconfig.json`
- known config references in Vite, Next.js, Vitest, Jest, and package scripts when safe

v0 should not attempt blanket text replacement across the entire repo.

Priority order:

1. AST or parser-backed rewrites where feasible
2. Structured JSON rewrites for configs
3. Explicitly scoped string rewrites for known config fields

## Verification

Minimum v0 verification:

- all renamed paths exist
- no planned target path collisions occurred
- no unresolved internal path rewrites remain in tracked edits
- optional framework-aware checks if available in repo

Examples of optional checks:

- `tsc --noEmit`
- `vite build`
- `next lint`
- `vitest --run`

Princess should record verification status but not pretend success if checks were skipped.

## Safety invariants

- Source repo remains byte-for-byte untouched
- Output repo is created first and transformed second
- Every rename is recorded in order
- Every rewritten file is listed in the manifest
- Failed verification marks the run incomplete
- Low-confidence proposals default to no-op

## Output layout

Inside the transformed repo:

```text
.princess/
  report.md
  rename-plan.json
  run-manifest.json
```

`rename-plan.json` is the intended set of rename decisions.

`run-manifest.json` is the executed result, including rewrites and verification outcomes.

## Rollback model

Princess does not mutate the source repo, so rollback is simple:

- If the run fails before copy completion, remove partial output.
- If the run fails after copy completion, mark the output repo partial and keep logs.
- If a single rename cannot be verified safely, skip it and continue unless it breaks dependent rewrites.

## Metrics for v0

- percentage of directories renamed
- percentage of renames later reverted by verification
- percentage of unchanged low-confidence folders
- verification pass rate
- average path-length delta
- user acceptance rate in dry-run mode

## Milestones

1. Dry-run analyzer with JSON proposals
2. Safe copy engine
3. Rename planner and collision detection
4. JS/TS reference rewriter
5. Verification and reporting
6. Interactive review mode later if needed

