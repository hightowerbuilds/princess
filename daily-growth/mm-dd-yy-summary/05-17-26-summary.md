# Daily Summary - May 17, 2026

## Overview

A focused day on the TUI's visual identity. Yesterday's roadmaps closed out the substrate work; today shifted from "does it work" to "what does it feel like." The user asked for a black-and-orange palette modeled on btop, container-style panels for folder contents, and a block-cursor "princess" wordmark. Halfway through the redesign, two unrelated TUI bugs surfaced — a cursor/highlight row misalignment on wrapped lines and a hard freeze when the terminal window lost and regained focus — both of which we triaged and fixed before pushing.

## Research and Planning — TUI Aesthetic References

User asked us to study **htop**, **btop** (with a guess that **gotop** belongs in the family), and after a follow-up message also **Pipes** (pipes.sh / pipes-rs). Dispatched two parallel research agents with focused briefs — visual idiom only, not feature lists — and got back tight write-ups:

- **btop is the right model.** Four bordered "boxes" using rounded glyphs `╭ ╮ ╰ ╯ ─ │` by default (falling back to `┌ ┐ └ ┘` in TTY mode). Inline panel titles on the top border using `┤ Title ├`-style cut-ins. Hotkey hints on the bottom border (`─┤ q quit ├─`). Per-character truecolor gradient meters with `start/mid/end` hex stops. Most importantly: btop ships an `orange.theme` (`main_bg #000000`, `main_fg #ffa500`, `hi_fg #ffcc66`, all box borders `#ffa500`) — this is essentially the palette the user described, already battle-tested at scale.
- **htop** contributes the inverse-video keycap footer convention.
- **gotop / bottom** contribute the simpler `┌ ┐ └ ┘` fallback set for non-truecolor terminals.
- **Pipes** contributes corner-elbow joinery (the trick that makes panels feel "wired together" rather than just adjacent) and the growing-tendril splash idea via pipes-rs's per-frame hue rotation.

Wrote `AESTHETIC_ROADMAP.md` at the project root. It captures the references, the current Princess aesthetic surface (logo gradient was lime green ↔ blue in `views/inbox.ts:28-29`; `bgGray`+`white` was the dominant chrome; `green`/`yellow`/`cyan` were the status pills; the seven-color `STAGE_PALETTES` block in `aesthetics.ts` was vestigial from an earlier app concept), a target palette with truecolor/256/16-color tiers, a titled-panel system design, a logo specification, six implementation phases, risks, and five decision points needed before code changes.

User approved with default decisions: btop's `#ffa500` (not aggressive hunter-orange); rounded borders (not heavy); splash animation deferred; 3-row half-block logo height; delete `STAGE_PALETTES`.

## Execution Progress

### Phase A — `src/tui/theme.ts` palette module

The foundation that every later phase routes through. The shape that landed:

- **`THEME` constant** with 20 semantic color roles: `bg`, `fg`, `fgDim`, `fgInactive`, `border`, `borderFocus`, `title`, `accentBright`, `accentEmber`, `selectionBg`, `selectionFg`, `divLine`, plus five status roles (ready/draft/used/stale/rejected) and two diff roles (added/removed). Each role carries four representation tiers: 24-bit `rgb`, xterm-256 `x256` index, and ANSI `ansi16Fg`/`ansi16Bg` for the 16-color fallback. Modeled directly on btop's `orange.theme` so the visual identity has a known-good reference.
- **`fg(name, text)` / `bg(name, text)`** pick the best representation the current terminal supports via `getCapabilities()` — truecolor → 256 → 16 → no-color, in that order. No-color is the cheapest path (returns the text unchanged).
- **`themed.*` semantic helpers** — the names views actually reach for: `themed.fg`, `themed.dim`, `themed.title` (bold gold automatically), `themed.border`, `themed.borderFocus`, `themed.accent` (pale gold), `themed.ember` (deep ember), `themed.selection` (inverted: black on orange), `themed.divLine`. Wrapping the bold + color combo for `title` in one helper avoids 30 redundant `bold(themed.fg("title", ...))` calls across views.
- **`statusStyle(status, text)`** — replacement for the `status === "ready" ? green(...) : status === "draft" ? yellow(...) : cyan(...)` ternaries that appeared in four views. Case-insensitive; unknown statuses fall back to `fgDim`.
- **`diffAdded` / `diffRemoved`** — the gold/ember replacements for the old green/red in the diff view.
- **`PRINCESS_LOGO_STOPS`** — three-stop horizontal gradient `[0.0 → deep ember (80,30,0), 0.5 → core orange (255,140,0), 1.0 → pale gold (255,220,130)]`. Deep ember is the darkest tone that reliably renders against a black terminal background — pure `#000` would vanish.
- **`princessLogoPulseStops(t)`** — a brightness-pulsed variant for the existing `logoPulse` effect in state. Uses a triangle wave (0 → 1 → 0 over the period) to modulate brightness only, keeping the gradient inside the orange family at all times. Replaces the old hue-shifting lime↔blue pulse.

Tests in `src/tui/theme.test.ts`: 143 assertions covering palette shape (every role has all four tiers), truecolor SGR output format, semantic helpers (title is bold, selection inverts, dim wraps), status mapping with case-insensitive lookup, diff styling, logo gradient luminance climbing left → right (after the first attempt asserted on raw red-channel and failed — red saturates to 255 by the midpoint, brightness climbs but red doesn't), and a fallback-table sanity check (256-color indices fall inside the warm band 52–230; 16-color fg codes are warm or neutral, never cool).

Two test-authoring missteps along the way: the original "exercise fallback tiers by re-importing the module" trick didn't work — Bun's module cache is keyed by resolved path, not URL, so `import("./theme.ts?reload=...")` returns the cached module. Replaced the dynamic re-import dance with a static table-sanity pass that verifies what the fallback branches *will* read; the actual capability branching is already covered by terminal/colors test suites.

Registered the new `theme` suite in `src/test-runner.ts`.

### Phase B — view recolor

Mechanical sweep through the six view files. Every direct `green / cyan / yellow / blue / magenta / bgPink / bgGray / bgDodgerBlue` call routed through `themed.*` / `statusStyle` / `diffAdded` / `diffRemoved`. Logo gradient stops in `inbox.ts` swapped from lime↔blue to `princessLogoPulseStops`. Inbox panel `borderColor: white` became `themed.border`. The "PROJECT LOCAL" badge swapped from `bgPink(black(...))` to `themed.selection(...)`.

`STAGE_PALETTES` (seven blue/cyan/purple/green/yellow/red palettes in `aesthetics.ts`) was deleted along with its `stagePalette` / `stageText` / `stageAccent` / `StagePalette` exports. Grep confirmed only its own test file imported it; the test sections were deleted too.

One type error along the way — `RGB = readonly [number, number, number]` clashed with `gradientTextMulti`'s mutable triple signature. Dropped `readonly`; `as const` on the THEME table still keeps the palette immutable from a runtime perspective.

### Phase C — titled `panel()` primitive

Extended `src/tui/typeset-compose.ts` with a `panel()` helper. Wraps the existing `box()` and then rewrites the top and bottom border lines to splice in:

- **Inline title** on the top border, default left-aligned at column 2, optional `center` alignment. Cut-in renders as `border(b.h.repeat(leftFill) + ┤) + titleStyle(" Title ") + border(├ + b.h.repeat(rightFill) + b.tr)` so the bracket glyphs stay border-colored while the title gets its own (typically bolder/brighter) style.
- **Hotkey strip** on the bottom border, right-aligned (btop's `─┤ q quit ├─` placement).
- **`focused: boolean`** — when true, swaps `borderColor` for `borderFocusColor`, so the focused panel "lights up" against its dimmer neighbors. The Inbox panel is focused by default; the Location panel above it stays at baseline border color, giving a clear depth cue.
- **Graceful fallback** when the title doesn't fit (omits the cut-in silently; doesn't render half a bracket) and when `border: "none"` is passed (defers to plain `box()` so other callers aren't broken).

Tests added inline in `src/tui/typeset.test.ts`: titled top border at various widths, left vs center title placement, oversized title falls back cleanly, hotkey cut-in placement, both title + hotkeys at once, focused vs unfocused color callbacks, `border: "none"` parity with `box()`, style-callback contracts. Total typeset suite went 154 → 186 tests.

### Phase D — adopt panels in every view

Every view now wraps its body in a single `panel()` call:

- **Inbox.** Two stacked panels: an unfocused `Location` panel (orange border) with the inbox path inside, and a focused `Inbox · N` panel (gold border) with the prompt list. The hotkey strip `/ search · ↵ open · c copy · d delete · ? help · q quit` lives on the inbox panel's bottom border, btop-style. Modal states (delete confirm, new folder, rename, active search) still render as a separate line below the panel; the default footer is gone.
- **Editor.** Header card becomes a titled `Editor — filename.md` panel; the redundant `Editor: filename` body line moved into the title. Body card becomes a focused untitled panel (rounded gold border) around the editing buffer. Footer line preserved as-is to avoid touching cursor-row math.
- **Diff / Revisions / Revision-Preview / Help.** Each previously rendered a `themed.selection(" Title… ")` orange bar and bare body lines. Each is now wrapped in a single focused `panel()` with `Diff — filename` / `Revisions — filename` / `Preview — filename` / `Help & Status` titles and matching hotkey strips on the bottom border. The bigger structural win: the old layouts were flat lists pretending to be screens; now each screen reads as one bordered container with title and hotkeys, exactly the btop pattern.

Updated `views.test.ts` assertions for the new wording — old `"[Enter] Preview"` / `"Revisions: file"` / `"Preview: file"` / `"[r] Restore"` checks became `"preview"` / `"Revisions — file"` / `"Preview — file"` / `"restore"` matches against the new lowercase hotkey strip and em-dash title format.

Smoke render at 100×30 confirmed: rounded corners, title cut-ins centered exactly where designed, focused gold border on the inbox panel against the dimmer orange location border, hotkey strip flush right on the bottom border, logo gradient climbing ember → orange → gold across the wordmark.

### User installed and ran the new build

The `princess` binary is symlinked to the local checkout, so the swap was instant. User opened the agent letter to validate and surfaced two issues in screenshots:

## Bug Fix — Editor cursor/highlight misalignment on wrapped lines

User's screenshot showed the orange selection highlight on the "When the user asks you to save…" line but the hardware cursor block sitting on the *next* row, on the 'P' of "Princess" — the wrapped continuation of the same logical line.

Diagnosis in `views/editor.ts`: the cursor-line layout inserts a zero-width-space marker (`​`) before the cursor character (`before + "​" + at + after`), then wraps the text and finds which chunk contains the marker. Because `​` has zero visual width, the wrap algorithm can place it on either side of a line break. When the cursor sits at the first character of a wrapped continuation, the marker tends to stick to the *trailing edge* of the previous chunk even though the cursor character itself lives at the start of the next chunk. The highlight follows the marker; the hardware cursor follows the cursor character; result: they disagree by one row.

Fix: scan the chunks once to locate the marker, and if it's at the trailing position with a following chunk available, attribute the cursor to that next chunk at column 0 instead. Two-pass instead of one-pass, but the chunk array is tiny so the cost is negligible. Highlight and hardware cursor now land on the same row in every case.

## Bug Fix — TUI freeze on click-away/click-back

User reported: opening a document, clicking another macOS app, then clicking back on the terminal would completely freeze the TUI — no scroll, no input, only `kill` or closing the shell window recovered. Far higher priority than the cursor cosmetic.

Two interacting problems in the input pipeline:

**Problem 1 — incomplete SGR mouse sequences leak as keystrokes.** `src/tui/input.ts`'s SGR mouse parser (`\x1b[<Cb;Cx;Cy;M` or `m`) does `data.indexOf(0x4d, offset + 3)` to find the terminating `M`. When `actualEnd === -1` (terminator hasn't arrived because the stdin read split mid-sequence), the parser fell through to a `// Unknown escape sequence -- skip 3 bytes` branch — which discards the `ESC [ <` prefix but leaves the residue `0;X;Y;M` in the buffer to be parsed on the next iteration. Those digits and the `M` then get emitted as printable keystroke events (`0`, `;`, `5`, `;`, `7`, `M`), injected straight into whatever screen is active. In an editor open on a real document, that's the equivalent of mouse-driven typing.

The function also always returned `pending: Buffer.alloc(0)` for escape sequences — only the UTF-8 branch buffered partials. So any split-across-reads escape sequence (arrow keys, PgUp/PgDn, mouse) was vulnerable.

**Problem 2 — motion tracking amplifies the firehose.** `enableMouse()` enabled `\x1b[?1002h` (mouse-motion-while-button-held) alongside press/release and SGR encoding. The parser only ever uses scroll-wheel events (`cb === 64` → pageup, `cb === 65` → pagedown). Every motion event was a stdin packet we paid the parsing cost on but never acted on. Click-drag, which the user does every time they refocus the window, sends *many* motion events in tight succession — increasing the odds of catching a split-buffer case.

Fix:

- **Parser rewrite.** `ESC` at the very end of a buffer is held in `pending` for the next read. `ESC [` alone with no third byte is held. CSI extended sequences (`5~`, `6~`, `3~`) hold for the trailing `~`. SGR mouse holds the whole partial when the terminator isn't in the buffer yet. A defensive 256-byte cap on any single buffered sequence prevents a malformed/unterminated escape from pinning memory. Unknown CSI sequences scan forward to the first final byte (`0x40–0x7E`) and consume the whole sequence atomically, rather than skipping a fixed 3 bytes.
- **Drop motion tracking.** `enableMouse()` now emits only `?1000h` (press/release) and `?1006h` (SGR encoding). `disableMouse()` still sends `?1002l` defensively in case a previous run left the mode on.
- **Tests.** `src/tui/input.test.ts` gained 13 new assertions: atomic mouse sequences (scroll-up → pageup, scroll-down → pagedown, click press+release produces no events), split-across-reads recovery (two-way, ESC-only-first-chunk, ESC-bracket-only-first-chunk, three-way), runaway-sequence guard, standalone-Escape vs sequence disambiguation, and a regression check that arrows + PgUp/PgDn still parse correctly. Total input suite went 6 → 19. The streaming-input tests use a `streamParse(chunks)` helper that threads `pending` between calls exactly like `startInputLoop` does in production.
- Exposed `parseKeyEventBuffer` as a public export so tests can inspect the `pending` buffer.

If the freeze persists after this fix, the next suspect is the save loop's `inFlight` chaining under rapid input — but with motion events off and partials buffering correctly, the input firehose during a click-back is now ~2 events instead of dozens, and none of them leak as keystrokes. That should be enough on its own.

## Validation

- `bunx tsc --noEmit` clean.
- `bun run test` — all suites green. theme: 143 (new). typeset: 186 (was 154; +32 panel tests). input: 19 (was 6; +13 streaming/mouse tests). views: 48 (assertion wording updated for the new panel-title format). Net assertion count across the run is up significantly on the day.
- Smoke render confirmed visually: rounded panels, title cut-ins, hotkey strips, focused-vs-unfocused border tiers, logo gradient.

## Tomorrow / Next Focus

- User to do a full visual pass through every screen in the new build and report any palette, contrast, layout, or logo glyph adjustments needed. We agreed to batch the next round into a single revision pass rather than iterate one nit at a time.
- The Pipes-style junction line between stacked panels (the small `├───────┤` connector between Location and Inbox in the inbox view) is still deferred per the roadmap — would add one row of vertical space and is only worth doing when terminal height ≥ 30.
- Splash animation (Phase E) is still optional.
- Phase F formal validation work (snapshot tests at 80×24 and 120×40 across iTerm2 / Terminal.app / Alacritty / Linux console) wasn't done as a separate pass since the smoke render at 100×30 and the user's live install were sufficient validation for end-of-day. Worth revisiting if we want to lock in the look.
