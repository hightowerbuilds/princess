# Princess Aesthetic Redesign — Roadmap

A plan to move Princess from its current blue/green/white-on-gray look to a **black-and-orange, panel-based** aesthetic modeled on **btop**, with structural cues borrowed from **htop** and **gotop**, and a **Pipes**-flavored block-cursor logo.

Status: **planning only.** No code changes have been made.

---

## 1. References — what we're borrowing from

### htop
- Flat, no panel borders; a single inverse-video header row.
- Reserved bottom row for `F1 Help  F2 Setup  …` keycaps in inverse video.
- 8-color ncurses palette; meters layered as colored bar segments.
- **What we take:** the bottom-row keycap convention. Princess's current footer line is close to this already.

### btop (the primary reference)
- Four bordered "boxes" (`cpu_box`, `mem_box`, `net_box`, `proc_box`), each a full Unicode container.
- Rounded box glyphs `╭ ╮ ╰ ╯ ─ │` in truecolor mode, falling back to `┌ ┐ └ ┘` in TTY.
- Titles inline on the top border using `┤ title ├`-style cut-ins; bold in `theme.title` color, distinct from the border color.
- Hotkey hints inline on the **bottom** border (`─┤ q quit ├─`).
- Focused box: border drawn in `hi_fg` (bright accent), title bolded.
- Ships an `orange` theme: `main_bg #000000`, `main_fg #ffa500`, all box borders `#ffa500`, dim `#332100`, inactive `#4d3200`, selection inverts to `#000` on `#ffa500`. **This is our north star palette.**
- Gradient meters: each meter has `start/mid/end` hex stops, interpolated per-character in truecolor.
- Startup banner: the letters `b t o p ++` drawn from `▀ ▄ █` half-blocks, ~6 rows tall, with a vertical color sweep.

### gotop / bottom
- Plain `┌ ┐ └ ┘ ─ │` borders, left-aligned inline titles.
- Per-CPU lines cycle a fixed numeric ANSI palette.
- Focused widget brightens its border color.
- **What we take:** the simpler border set for non-truecolor terminals (a fallback tier).

### Pipes (pipes.sh / pipes-rs)
- Ten glyph sets; the relevant ones for us are `rounded` (`╭ ╮ ╰ ╯ ─ │`) and `light box` (`┌ ┐ └ ┘ ─ │`).
- One solid color per pipe; pipes-rs's `--rainbow` mode shifts hue per frame, producing a gradient *along the pipe's length* as it grows.
- Visual identity comes from **corner-elbow joinery** — every turn produces a `╮` or `┗` that visibly fits the previous cell.
- **What we take:** the technique of using one accented elbow color at panel junctions to suggest panels are "wired together"; the per-character growing-gradient trick for an animated splash tendril.

---

## 2. Current state audit (what's there now)

### Color usage today
- **Logo gradient (`views/inbox.ts`):** pulses between lime green `[50,255,50]` and blue `[0,120,255]` via a cyan midpoint `[25,187,152]`. *This is the most visible thing to change.*
- **"PROJECT LOCAL" badge:** `bgPink(black(...))`.
- **Chrome (location card, list card, selected row, headers across all views):** `bgGray(white(...))` — solid mid-gray background with white text.
- **Prompt status pills:** `green` (ready), `yellow` (draft), `cyan` (anything else).
- **Help view section headings:** `green` and `cyan`.
- **Diff view:** `green`/`red` for +/− lines, `cyan` for the title row.
- **STAGE_PALETTES** in `aesthetics.ts` defines seven pipeline palettes (welcome/scanning/inference/review/applying/complete/error). They're blue/cyan/purple/green/yellow/red — **none are amber**, and they appear to be unused by the prompt-inbox flow (vestige of an earlier app concept).

### Container/box usage today
- **Already built:** `typeset-compose.ts` exports a `box()` primitive with `BorderStyle = "none" | "single" | "double" | "rounded" | "heavy"` and a complete `BORDER_CHARS` table. The rounded set we want is already there.
- **What's drawn as a box today:** in the inbox view, the *location card* and *list card* are `border: "single"`, `borderColor: white`, content style `bgGray(white(...))`. Both also get a `dropShadow` underneath.
- **What's not boxed:** the editor body, the revisions list, the diff, the help view, and the revision preview all use a `bgGray(white(" Title… "))` header bar followed by bare-line content — flat, htop-style, no surrounding frame.
- **No title-on-border helper:** `box()` doesn't currently support inline titles on the top or bottom border; this is the one new piece of layout code we need.

### What's already in our favor
- `gradientText` / `gradientTextMulti` in `aesthetics.ts` already do per-character truecolor interpolation — same technique btop uses for meters and its banner. Logo work is largely a palette swap.
- `dropShadow` exists.
- Color capability detection (`supportsTrueColor`, `supports256Color`, `supportsColor`) and graceful degradation are already wired through `colors.ts`.

---

## 3. Target palette — black & orange

Modeled on btop's `orange.theme`, expressed as TypeScript RGB triples.

| Role | RGB | Hex | Notes |
|---|---|---|---|
| `bg` | `[0, 0, 0]` | `#000000` | terminal default; we don't paint full-screen bg, just panel interiors when needed |
| `fg` | `[255, 165, 0]` | `#ffa500` | primary readable orange |
| `fgDim` | `[179, 116, 0]` | `#b37400` | body text where today we use `dim()` |
| `fgInactive` | `[77, 50, 0]` | `#4d3200` | unfocused / disabled |
| `border` | `[255, 165, 0]` | `#ffa500` | panel border baseline |
| `borderFocus` | `[255, 204, 102]` | `#ffcc66` | focused panel (btop's `hi_fg`) |
| `title` | `[255, 204, 102]` | `#ffcc66` | inline panel titles, bold |
| `accentBright` | `[255, 224, 130]` | `#ffe082` | pale gold — gradient bright stop, "Ctrl+/" glow, hover hint |
| `accentEmber` | `[180, 60, 0]` | `#b43c00` | deep ember — gradient dark stop, status "rejected" |
| `selectionBg` | `[255, 165, 0]` | `#ffa500` | selected row background |
| `selectionFg` | `[0, 0, 0]` | `#000000` | selected row text (inverted) |
| `divLine` | `[51, 33, 0]` | `#332100` | inner dividers / faint grid |
| `statusReady` | `[255, 204, 102]` | `#ffcc66` | gold (was green) |
| `statusDraft` | `[255, 165, 0]` | `#ffa500` | core orange (was yellow) |
| `statusUsed` | `[150, 100, 40]` | `#966428` | ash-amber (was cyan) |
| `statusStale` | `[100, 70, 30]` | `#64461e` | very dim |
| `statusRejected` | `[180, 60, 0]` | `#b43c00` | ember — only red-leaning color |
| `diffAdded` | `[255, 204, 102]` | `#ffcc66` | gold (was green) |
| `diffRemoved` | `[180, 60, 0]` | `#b43c00` | ember (was red) |
| `localBadgeBg` | `[255, 165, 0]` | `#ffa500` | "PROJECT LOCAL" pill (was pink) |
| `localBadgeFg` | `[0, 0, 0]` | `#000000` | |

### Capability tiers
1. **Truecolor (default):** the RGB values above.
2. **256-color fallback:** map to xterm-256 — `208` (#ff8700) for `fg`, `214` (#ffaf00) for `borderFocus`, `172` (#d75f00) for `accentEmber`, `94` (#875f00) for `fgInactive`, `52` (#5f0000) for `statusRejected`. This is what `fg256()` is for.
3. **16-color terminal:** `yellow` (ANSI 33) for everything orange, `red` (ANSI 31) for ember/removed, `white` for titles. We already degrade gracefully via `colors.ts`.
4. **No-color terminal:** existing `getCapabilities().supportsColor` check already passes text through unstyled.

### What disappears
- `bgPink`, `bgDodgerBlue`, `bgCyan`, `bgGreen`, `green`, `cyan`, `magenta`, `blue`, `yellow` — keep the named ANSI helpers in `colors.ts` (they're cheap), but views should stop importing them and route through a new `theme` module instead.
- `STAGE_PALETTES` — either delete (it's unused in the inbox flow) or recolor every stage into orange variants for consistency.

---

## 4. Container system — the btop boxes

### New primitive: titled box

Extend `typeset-compose.ts`'s `box()` (or add a sibling `panel()`) with these options:

```ts
interface PanelOptions extends BoxOptions {
  title?: string;             // inline on top border
  titleAlign?: "left" | "center";
  hotkeys?: string;           // inline on bottom border, e.g. " q quit "
  focused?: boolean;          // swaps border + title color to focus tier
  accent?: (s: string) => string;  // per-panel accent for border
}
```

Rendering rule (btop-faithful):
- Default border style: `"rounded"` when truecolor is available, `"single"` otherwise.
- Title is rendered as `─┤ Title ├─` cut into the top border at `titleAlign` position. Title text is `theme.title` + bold; the `┤ ├` brackets are border color.
- Hotkeys render as `─┤ q quit ├─` cut into the bottom border, right-aligned. The key letter (`q`) is `accentBright`; the label is `fgDim`.
- When `focused: true`, both border and title use `borderFocus` / `title` tier; otherwise both use the panel's `accent` (default `border`).

### Where panels appear in Princess

| View | Today | After |
|---|---|---|
| Inbox | Logo, location card (boxed), list card (boxed), bare footer line | Logo, **`Location`** panel (title in top edge), **`Inbox`** panel (title + count badge), bottom-bar hotkeys on inbox panel itself |
| Editor | `bgGray` title bar, bare lines | **`Editor — filename.md`** panel wrapping the buffer; **`Save State`** mini-panel docked top-right showing clean/dirty/saving/error/conflict; hotkeys on bottom border |
| Revisions list | `bgGray` title bar, bare rows | **`Revisions — filename.md`** panel; revision rows inside |
| Revision preview | `bgGray` title bar, bare body | **`Preview — <timestamp>`** panel |
| Diff | `cyan` bold title, bare body | **`Diff — filename.md`** panel; old/new sub-panels stacked or columned when width permits |
| Help | `bgGray` title bar, color-headed sections | **`Help`** panel with internal section dividers using Pipes-style `─╮…╰─` jogs |

This is **one new layout helper plus a search-and-replace through six view files** — the structure of each view stays the same; we just wrap the content in `panel()` and drop the redundant `bgGray` header bar.

### Inter-panel connector (the Pipes touch)

Where the inbox view stacks the Location panel directly above the Inbox panel, draw a one-cell "junction" between them:

```
╰──╮ … ╭──╯   ← bottom of upper panel
   │       │
   ╰───────╯   ← top of lower panel
```

Becomes:

```
╰──╮ … ╭──╯
   ├───────┤   ← single-row junction line in `accentEmber → borderFocus → accentEmber` gradient
   ╰───────╯
```

This is one line of code and an enormous identity signal. Same trick on the editor's `Save State` mini-panel docked into the main `Editor` panel.

---

## 5. Logo — "princess" in block cursor

### Direction
**Block-cursor wordmark, 3 rows tall, horizontal black→amber→bright-orange gradient, no animation by default** (animation reserved for first-run / splash).

### Glyph set
Half-block elements from Unicode Block Elements range U+2580–U+259F: `▀ ▄ █ ▌ ▐ ` (plus space). This is the same construction technique as btop's startup banner — every cell is either an upper half, lower half, full block, left half, right half, or empty, which gives crisp letterforms at 3-row height.

### Letter widths (3 rows × 4 cols per letter, 1-col gap)
8 letters × 4 cols + 7 gaps = **39 columns**, fits any reasonable terminal.

Approximate forms (one of several viable variants — implementer can refine):

```
█▀▀▄ █▀▀▄ █ █▄ █ ▄▀▀ █▀▀▀ ▄▀▀▀ ▄▀▀▀
█▄▄▀ █▄▄▀ █ █ ▀█ █    █▀▀  ▀▀▄  ▀▀▄
█    █  █ █ █  █ ▀▄▄  █▄▄▄ ▄▄▄▀ ▄▄▄▀
```

(P · R · I · N · C · E · S · S — letters separated by single-space gaps; final rendered art will be hand-tuned, this is a structural sketch.)

### Gradient
A 3-stop horizontal interpolation across the 39 visible columns, applied per-character using existing `gradientTextMulti`:

```ts
const PRINCESS_LOGO_STOPS: Array<[number, [number, number, number]]> = [
  [0.0, [80,  30, 0]],     // deep ember (left edge — reads as "almost black")
  [0.5, [255, 140, 0]],    // core orange (mid)
  [1.0, [255, 220, 130]],  // pale gold (right edge — the "highlight")
];
```

The left edge needs to be *just* visible on a black terminal — pure `#000000` would vanish. `[80, 30, 0]` is the darkest ember that still reads against black. On a light terminal it reads as a saturated brown, which still feels right.

### Pulse (kept, recolored)
The current logo pulses every 8s (`LOGO_PULSE_PERIOD_MS`). Keep the pulse machinery but swap stops so it cycles **ember → orange → gold → orange → ember** (a brightness sweep rather than a hue sweep). Subtler and never leaves the brand family.

### Splash variant (optional, first-run only)
Borrow the Pipes growing-tendril idea: on first launch, draw a single `╭─╮` tendril from `(0,0)` that turns twice, terminates next to the wordmark, then the wordmark gradient-reveals left-to-right over ~600ms using the existing `inboxReveal` staggered reveal primitive. Total animation budget: under one second.

---

## 6. Implementation phases

Each phase is independently shippable and reversible.

### Phase A — palette module (the foundation)
- **New file:** `src/tui/theme.ts` — exports the typed `Theme` interface, the `princess` (black/orange) palette object, and helper functions `themed.fg(text)`, `themed.title(text)`, `themed.border(text)`, `themed.accent(text)`, `themed.dim(text)`, `themed.status(status, text)`, `themed.diff('added' | 'removed', text)`.
- Internally `theme.ts` delegates to `colors.ts` (`rgb` / `fg256` / 16-color fallbacks) based on `getCapabilities()`.
- **No view changes yet.** Just the new module + tests.

### Phase B — view recolor (mechanical)
- Replace every direct `green / cyan / yellow / blue / magenta / bgPink / bgGray / bgDodgerBlue` call in the six view files with the corresponding `themed.*` call.
- Recolor the logo gradient stops in `inbox.ts` to `PRINCESS_LOGO_STOPS`.
- Delete the unused `STAGE_PALETTES` block (or recolor; recommend delete).
- One PR. Snapshot the screen before/after for the user.

### Phase C — titled panel primitive
- Extend `box()` in `typeset-compose.ts` with `title` + `hotkeys` + `focused` options, or add a `panel()` sibling.
- Add unit tests for the title-on-border cut-in rendering at various widths (including titles wider than the content, and ≤2-col widths where titles must collapse).

### Phase D — adopt panels in every view
- Wrap each view's body in `panel({ title, hotkeys, focused: true })`.
- Remove the now-redundant `bgGray(white(" Title "))` header bars.
- Inbox: stack two panels (`Location`, `Inbox`) with a Pipes-junction line between them.
- Editor: dock the `Save State` mini-panel into the `Editor` panel's top-right corner using `┤ saving… ├` style cut-in.

### Phase E — splash polish (optional)
- First-run growing-tendril animation as described in §5.
- Gated behind `PRINCESS_SPLASH=1` env or a one-time first-run flag, so it never interrupts a returning user.

### Phase F — tests + screenshots
- Update `src/tui/aesthetics.test.ts` to lock in palette outputs.
- Add `src/tui/views/*.test.ts` snapshots for each view at 80×24 and 120×40.
- Manual: run `princess tui` in `iTerm2`, `Terminal.app`, `Alacritty`, and `Linux console` (TTY) to confirm fallback tiers.

---

## 7. Risks and open questions

- **Background painting.** btop's orange theme assumes a truly black terminal background. Many users run light themes. Decision needed: do we paint panel interiors black explicitly (`\x1b[40m…`) or trust the terminal background? Recommend **explicit black** for panel interiors only, to preserve the look — but only when truecolor is available, since 16-color black-on-yellow is hard on the eyes.
- **The "PROJECT LOCAL" badge becomes orange-on-black**, which now visually competes with the panel borders. Consider switching it to **black-on-pale-gold** (inverted) to stand out without clashing.
- **`bgGray` for the selected row** loses its contrast against an orange-bordered panel. The plan replaces it with `selectionBg/selectionFg` (orange bg, black fg), btop-style. Confirm legibility for prompt-status pills inside a selected row.
- **Color blindness.** A monochromatic orange palette is friendly to red-green blindness but loses semantic distinction between status types. Mitigation: keep status pills as **`[draft]` text labels** (already the case), and use brightness tiers (gold / orange / ash) rather than relying on hue.
- **Pipes junction line is decorative.** It adds one row of vertical space between panels. On 24-row terminals that may be the row that pushes the footer off. Make it conditional on `rows >= 30`.

---

## 8. Decision points needed from you

1. **Orange brightness target.** "Hunter-orange" `#ff5500` reads as more aggressive than btop's `#ffa500`. Which feels right?
2. **Panel border style.** Rounded (`╭ ╮`, softer, btop-default) or heavy (`┏ ┓`, more "Pipes circuit-board")?
3. **Splash animation.** In scope for this redesign, or defer to a separate ticket?
4. **Logo letterforms.** Use the 3-row half-block sketch in §5, or commission something taller (5–6 rows, btop-banner-scale)?
5. **Should we delete `STAGE_PALETTES`** outright, or keep it as a recolored-orange variant for some future pipeline view?

Once you greenlight the palette + container plan, the work falls naturally into the six phases in §6.
