# Princess — Senior Dev Review

I read through the source, package manifest, README, agent contract, the CLI (`src/cli/index.ts`, ~880 lines), `html-prompts.ts` (1059 lines), the TUI stack (`tui/app.ts` ~990, `typeset.ts` + `typeset-compose.ts` ~1200, `motion.ts` ~1100, `aesthetics.ts` ~470), and the test suites. Roughly 15k lines of TypeScript.

## What it actually is

A local Markdown inbox with a Bun CLI and a Solid-reactive terminal UI. The headline use case: an AI agent drafts a prompt and drops it in `~/.local/share/princess/inbox/foo.md` instead of leaving it in chat. There is also an HTML "workspace" format with `manifest.json`, sections marked by `data-princess-role`, lint, and a compile step that emits HTML, Markdown, or JSON.

## What's good

- **Engineering hygiene is real.** Atomic temp-then-rename writes (`storage.ts`), per-workspace file locks (`file-lock.ts`), debounced editor saves, external-change detection, revision history, stale-temp cleanup, XDG paths, a migration path from the old layout. Tests exist for every non-trivial module. Commits are tidy and phase-scoped.
- **The TUI rendering pipeline is genuinely interesting craft.** A two-phase `prepare → layout → materialize` engine ostensibly inspired by Pretext.js, with cached segment widths so resizes are pure arithmetic. The motion module is its own little animation runtime. Whoever wrote this enjoyed writing it.
- **Path safety is taken seriously.** `normalizeRelativeSubpath` + `ensureInside` in `html-prompts.ts` block path traversal in the resource-add surface — easy to miss, not missed here.
- **Solid choice of Solid.** Using `solid-js` reactive primitives for a TUI is unusual but coherent; signals + effects do map cleanly onto "redraw when state changes."

## What's harsh

1. **The thesis is thin.** "AI agents need a durable place to drop prompts so they don't get lost in chat." OK — that place already exists. It's called a folder. Or Obsidian. Or a gist. Or a Notion page. Or ChatGPT's own prompt library. Or `~/prompts/` with `fzf`. The differentiator has to be either (a) the TUI is so good people change habits or (b) there's a network/sharing effect. Neither is true here. There is no sync, no sharing, no model invocation, no eval, no templating, no variable substitution, no tagging, no full-text search index — the README admits this. The product is a folder with ceremony.

2. **The code-to-value ratio is brutal.** 15k lines of TypeScript for "save markdown to a folder and let me browse it." `html-prompts.ts` alone is 1,059 lines to model a prompt directory with a manifest, sections, lint, and a three-target compiler. The TUI typesetting stack is bigger than most real CLIs ship. There is a custom motion library *for a prompt inbox*. This is craft-as-end-in-itself, not craft in service of a user.

3. **HTML prompts are a solution looking for a problem.** Most coding agents and frontier-model APIs consume markdown or plain text just fine. Images "remain explicit attachments" — meaning the compile step doesn't actually solve the multimodal handoff, you still have to wire it up at the call site. So the user pays the cost of `add-asset --alt`, `set-section`, `import-table --trust`, `lint`, `compile --target json`, and at the end of it they have… a JSON envelope that still needs custom glue per model. A `.md` file with `![alt](path)` and a code fence would have shipped in an afternoon.

4. **Two-source agent contract.** `AGENT_INSTRUCTIONS.md` (checked in) and `getAgentInstructions()` (in `cli/index.ts`, written to `AGENT.md` on bootstrap) are near-duplicates. They will drift. Pick one and generate the other.

5. **Distribution story is missing.** "Bun >=1.3.10, symlink into `~/.bun/bin/`." That's a personal-rig install, not a product. No npm publish target, no Homebrew, no single-file binary, no Windows path beyond a `clip` mention. Combined with "no sync," the realistic user count is 1.

6. **Significance in the AI era: low.** The interesting problems in agentic tooling right now are prompt eval/regression, model-agnostic structured-output contracts, retrieval grounding, agent memory, and tool sandboxing. Princess does none of these. It is adjacent to the prompt-library category (LangChain Hub, PromptHub, dotprompt, `.cursor/rules`, Claude Code skills/agents themselves) but doesn't compete on any axis those tools compete on — versioning across machines, sharing, parameterization, eval. In a world where `claude` and `cursor` already let you drop a `.md` into `.claude/` or `.cursor/rules/` and have the agent read it automatically, "deposit a prompt and tell the user to run `princess tui`" is a longer round-trip than doing nothing.

7. **Minor smells.** Bootstrap swallows arbitrary `EEXIST` and prints generic errors otherwise. `performMigrationIfNecessary` `catch (err: any)` then logs and continues — silent half-migrations are possible. `tsconfig.json` is 271 bytes, which suggests it's not doing much. `out.log`/`err.log`/`tui-error.log` are committed empty — repo hygiene.

## Score: **4 / 10**

A well-crafted personal project that mistakes engineering volume for product. The internals (atomic writes, file locks, typesetting, Solid in a TUI) would earn 7+ if they were in service of a problem worth solving. The problem isn't. The realistic path to a higher score is brutal: delete the HTML workspace subsystem, delete the custom typesetting and motion engines, replace the TUI with `fzf`-style filtering, and pour the saved budget into the one thing that would actually matter — being the canonical place a coding agent (Claude Code, Cursor, Codex) stores reusable prompts *that those agents already auto-load*. Without that, Princess is a beautifully-built drawer.
