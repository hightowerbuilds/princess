# Princess Legend System

## Overview

The Legend is a comprehensive taxonomy and symbolic encoding system that allows Princess to deeply introspect every folder in a codebase and classify its contents against a standardized vocabulary. Each folder gets a **signal profile** — an array of codes drawn from the Legend — that describes its technology stack, role, structural patterns, and quantitative metrics.

The Legend serves three purposes:

1. **Detection** — defines what Princess looks for inside folders
2. **Classification** — maps detected signals to standardized codes
3. **Encoding** — selects the most distinctive codes to compose into folder names

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Scanner    │────▶│   Classifier │────▶│   Encoder    │────▶│  Folder Name │
│              │     │              │     │              │     │              │
│ reads files, │     │ matches      │     │ picks most   │     │ purpose--    │
│ parses       │     │ against      │     │ distinctive  │     │  directive   │
│ imports,     │     │ legend       │     │ codes for    │     │              │
│ counts,      │     │ taxonomy     │     │ the name     │     │              │
│ detects      │     │              │     │              │     │              │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
                                                │
                                                ▼
                                          ┌──────────────┐
                                          │   Manifest   │
                                          │              │
                                          │ stores FULL  │
                                          │ signal       │
                                          │ profile per  │
                                          │ folder       │
                                          └──────────────┘
```

The folder name carries the **most useful** 1-3 signals as human-readable directives. The manifest (`.princess/signal-profiles.json`) carries the **complete** signal array for every folder, which the TUI and other tools can display.

## The Legend Taxonomy

### Tier 1 — Technology

What languages, frameworks, and tooling are present in the folder. Detected from file extensions, import statements, and configuration markers.

| Code | Signal             | Detection Method                                              |
|------|--------------------|---------------------------------------------------------------|
| `r`  | React              | Imports from `react`, JSX/TSX files with component patterns   |
| `v`  | Vue                | `.vue` files, `defineComponent`, `<script setup>`             |
| `ng` | Angular            | `@angular/core` imports, `.component.ts` naming               |
| `sv` | Svelte             | `.svelte` files                                               |
| `sd` | SolidJS            | Imports from `solid-js`                                       |
| `ts` | TypeScript         | `.ts`/`.tsx` files present, no `.js`-only                     |
| `js` | JavaScript-only    | `.js`/`.jsx` files present, no TypeScript                     |
| `cs` | CSS                | `.css` files (vanilla CSS)                                    |
| `sc` | SCSS/Sass          | `.scss`/`.sass` files                                         |
| `le` | LESS               | `.less` files                                                 |
| `tw` | Tailwind           | Tailwind classes in JSX/HTML, `tailwind.config` references    |
| `cm` | CSS Modules        | `.module.css`/`.module.scss` files                            |
| `sc` | Styled Components  | `styled-components` or `@emotion` imports                     |
| `ht` | HTML               | `.html`/`.htm` files, template literals with HTML             |
| `md` | Markdown           | `.md`/`.mdx` files                                            |
| `sq` | SQL                | `.sql` files, raw SQL query strings                           |
| `gq` | GraphQL            | `.graphql`/`.gql` files, `gql` tagged template literals       |
| `py` | Python             | `.py` files                                                   |
| `go` | Go                 | `.go` files                                                   |
| `rs` | Rust               | `.rs` files                                                   |
| `sh` | Shell              | `.sh`/`.bash`/`.zsh` files                                    |
| `dk` | Docker             | `Dockerfile`, `docker-compose.yml`                            |
| `yn` | YAML config        | `.yml`/`.yaml` files (non-Docker)                             |
| `jn` | JSON data          | `.json` files (non-package.json, non-tsconfig)                |
| `wa` | WebAssembly        | `.wasm` files                                                 |

### Tier 2 — Role

What the code in the folder **does**. Detected from export patterns, naming conventions, framework idioms, and file structure.

| Code  | Signal              | Detection Method                                                          |
|-------|----------------------|---------------------------------------------------------------------------|
| `cmp` | UI Components        | PascalCase exports returning JSX, `.component.ts`, component registries   |
| `hk`  | Hooks/Composables    | `use*` named exports, `composables` naming                                |
| `ctx` | Context/Providers    | `createContext`, `Provider` exports, context file naming                  |
| `st`  | State Management     | Redux slices, Zustand stores, Jotai atoms, MobX stores, Pinia stores     |
| `api` | API Handlers         | HTTP method exports (`GET`, `POST`), Express/Hono/Fastify route handlers |
| `mw`  | Middleware           | `middleware` naming, request/response/next signatures                     |
| `db`  | Database/ORM         | Prisma schema, Drizzle schema, TypeORM entities, Knex migrations         |
| `mg`  | Migrations           | Sequential numbered files, `migrate`/`migration` naming                  |
| `sd`  | Seeds/Fixtures       | `seed` naming, bulk insert patterns                                      |
| `tst` | Tests                | `.test.*`/`.spec.*` files, `describe`/`it`/`test` calls                  |
| `e2e` | End-to-end Tests     | Playwright/Cypress imports, `.e2e.*` files                               |
| `utl` | Utilities/Helpers    | `utils`/`helpers` naming, small pure-function exports                    |
| `typ` | Type Definitions     | `.d.ts` files, type/interface-only exports, no runtime code              |
| `cfg` | Configuration        | Config objects, environment variable loading, settings schemas            |
| `rte` | Routes/Pages         | `page.*`, `route.*`, `layout.*`, router configuration files              |
| `ast` | Static Assets        | Images, fonts, videos, SVGs, favicons                                    |
| `icn` | Icons                | SVG icon files, icon component libraries                                 |
| `fnt` | Fonts                | `.woff`, `.woff2`, `.ttf`, `.otf` files                                  |
| `i18` | Internationalization | Translation JSON/YAML, `t()`/`useTranslation` calls                     |
| `cli` | CLI/Scripts          | `#!/usr/bin` shebangs, `process.argv` parsing, commander/yargs usage     |
| `wrk` | Workers              | `Worker` instantiation, `self.postMessage`, service worker registration  |
| `pkg` | Package Root         | `package.json` present, entry point definitions                          |
| `doc` | Documentation        | Mostly `.md` files, no runtime code                                      |
| `gen` | Generated Code       | `@generated` markers, codegen output                                     |
| `bld` | Build Output         | `dist`/`build`/`.next` naming, compiled artifacts                        |
| `sch` | Schema Definitions   | JSON Schema, Zod schemas, Yup schemas, validation schema exports         |
| `srv` | Service Layer        | Class-based or function-based service abstractions, business logic       |

### Tier 3 — Pattern

Structural and architectural patterns detected within the code. These describe **how** the code is organized, not what technology it uses.

| Code  | Signal              | Detection Method                                                       |
|-------|----------------------|------------------------------------------------------------------------|
| `frm` | Forms                | Form elements, `useForm`, `Formik`, `react-hook-form` patterns         |
| `ath` | Auth/Security        | JWT handling, session management, RBAC/permissions, OAuth flows        |
| `val` | Validation           | Zod/Yup/Joi schemas, validator functions, constraint checking          |
| `ser` | Serialization        | JSON parse/stringify wrappers, protobuf, custom encoders/decoders      |
| `ani` | Animation            | Framer Motion, GSAP, CSS transitions/keyframes, `@keyframes`           |
| `lay` | Layout               | Grid/flex containers, layout components, sidebar/header/footer splits  |
| `nav` | Navigation           | Router links, breadcrumbs, menu/nav components                        |
| `err` | Error Handling       | Error boundaries, try/catch wrappers, error types, fallback UI        |
| `log` | Logging/Telemetry    | Logger instantiation, analytics events, performance markers            |
| `cch` | Caching              | Cache-Control, memoization, Redis/in-memory cache clients              |
| `pub` | Public API Surface   | Barrel `index.ts` re-exporting, explicit public API boundaries         |
| `int` | Internal-only        | No barrel exports, private/internal naming, `_` prefixed               |
| `hoc` | Higher-Order Comp.   | HOC wrappers, `with*` naming patterns                                  |
| `rnr` | Render Props         | Render prop patterns, children-as-function                             |
| `obs` | Observable/Reactive  | RxJS, signals, observable patterns                                     |
| `fsm` | State Machines       | XState, `switch`-on-state patterns, transition tables                  |
| `evn` | Event-driven         | EventEmitter, pub/sub, custom event buses                              |
| `skt` | WebSockets           | `WebSocket`, Socket.io, real-time communication                       |
| `str` | Streaming            | ReadableStream, async iterators, chunked processing                    |
| `dep` | Dependency Injection | Constructor injection, DI containers, provider patterns                |

### Tier 4 — Metrics

Quantitative signals about the folder's size and shape. These are computed, not pattern-matched.

| Code  | Signal            | Computation                                                    |
|-------|-------------------|----------------------------------------------------------------|
| `Nf`  | File count        | Total files in folder (non-recursive)                          |
| `Nfr` | File count (deep) | Total files including all subdirectories                       |
| `Nx`  | Export count      | Number of named/default exports                                |
| `Ni`  | Import sources    | Number of distinct external modules imported                   |
| `Nd`  | Max depth         | Deepest nesting level below this folder                        |
| `Nk`  | KLOC              | Thousands of lines of code (non-blank, non-comment)            |
| `Nc`  | Component count   | Number of detected UI components                               |
| `Nt`  | Test count        | Number of test files                                           |

## Signal Profile

Every folder gets a `SignalProfile` — the full array of detected codes plus their confidence scores:

```typescript
interface SignalEntry {
  code: string;          // legend code, e.g. "r", "cmp", "frm"
  tier: 1 | 2 | 3 | 4;  // which tier this signal belongs to
  confidence: number;    // 0-1 detection confidence
  evidence: string[];    // what triggered detection, e.g. ["import React from 'react'", "Button.tsx"]
}

interface SignalProfile {
  relativePath: string;
  signals: SignalEntry[];
  metrics: Record<string, number>;  // tier-4 computed values
}
```

## From Signals to Folder Names

The encoder selects which signals become part of the Princess folder name. The selection logic:

1. **Filter** — drop signals below a confidence threshold (default 0.7)
2. **Rank** — sort remaining signals by a priority score:
   - Tier 2 (Role) signals rank highest — they answer "what does this folder do?"
   - Tier 1 (Technology) signals rank next — but only when they disambiguate (e.g., a React components folder vs a Vue components folder in the same repo)
   - Tier 3 (Pattern) signals rank third — only when they're the dominant characteristic
   - Tier 4 (Metrics) are never encoded into names
3. **Select** — take the top 1-3 signals that fit within the Princess naming constraints (max 56 chars, max 4 segments)
4. **Translate** — convert codes to human-readable directive words using a code-to-word mapping

Example flow:

```
Folder: src/components/auth
Signals: [r:0.95, ts:0.99, cmp:0.92, frm:0.88, ath:0.91, val:0.75]
Metrics: {Nf: 8, Nx: 5, Nk: 1.2}

Step 1 (filter):  [r:0.95, ts:0.99, cmp:0.92, frm:0.88, ath:0.91, val:0.75]
Step 2 (rank):    cmp > ath > frm > r > ts > val
Step 3 (select):  cmp, ath  (purpose already clear from parent; tech is repo-wide)
Step 4 (encode):  auth → components--auth-ui

Full manifest profile: [r, ts, cmp, frm, ath, val, 8f, 5x, 1.2k]
```

## Code-to-Directive Word Mapping

Legend codes are terse for storage. Folder name directives are human-readable. The mapping:

```
cmp → shared-ui, feature-ui, auth-ui (contextualized)
hk  → react-state, composables
ctx → providers
st  → redux-store, zustand-store, state
api → rest-handlers, graphql-resolvers, api
mw  → middleware
db  → prisma-models, orm, data
tst → test-only, unit-tests, e2e-tests
utl → pure-ts, helpers
typ → domain-types, type-defs
cfg → config
rte → routes, pages
ast → content, media, icons, fonts
i18 → translations
cli → scripts
```

The directive words are selected based on context — what other signals are present, what the parent folder is, what sibling folders exist. `cmp` alone becomes `shared-ui`; `cmp + ath` becomes `auth-ui`; `cmp + frm` becomes `form-ui`.

## Implementation Plan

### Phase 1: Legend Contract and Deep Scanner

**Files to create:**
- `src--cli-and-pipeline/legend.ts` — the legend taxonomy as TypeScript constants: every code, its tier, detection rules, and priority weight
- `src--cli-and-pipeline/scanner.ts` — the deep file scanner that reads file contents and produces raw signal data per folder

**Files to modify:**
- `src--cli-and-pipeline/contracts.ts` — add `SignalEntry`, `SignalProfile`, and `FolderSignals` types
- `src--cli-and-pipeline/discovery.ts` — integrate the deep scanner into the existing dossier-building flow

**What the deep scanner does that the current discovery does not:**
- Reads all text files in a folder (not just the first 8)
- Parses import/export statements (not just framework hints)
- Counts exports by kind (component, function, type, constant)
- Detects CSS methodology (modules, Tailwind, styled-components)
- Identifies form/auth/validation patterns
- Classifies assets by type (icons vs content images vs fonts)
- Computes all Tier 4 metrics

### Phase 2: Classifier

**Files to create:**
- `src--cli-and-pipeline/classifier.ts` — takes raw scanner output and matches it against the legend to produce `SignalProfile` arrays with confidence scores

**Detection strategy per tier:**

- **Tier 1 (Technology):** Deterministic. File extensions and import strings. High confidence.
- **Tier 2 (Role):** Heuristic + structural. Combines naming conventions, export patterns, and framework idioms. Medium-high confidence.
- **Tier 3 (Pattern):** Content analysis. Requires reading function bodies and template structures. Medium confidence.
- **Tier 4 (Metrics):** Computed. Always 1.0 confidence.

### Phase 3: Enhanced Encoder

**Files to modify:**
- `src--cli-and-pipeline/infer.ts` — use signal profiles instead of (or in addition to) the existing heuristic categories to generate rename proposals
- `src--cli-and-pipeline/naming.ts` — add the code-to-directive-word mapping

### Phase 4: Manifest and TUI Integration

**Files to create/modify:**
- Write `signal-profiles.json` to `.princess/` during apply
- Update the TUI "Explore" screen to render signal profiles with the full legend

### Phase 5: Model Integration

- Send signal profiles to the model instead of (or alongside) raw dossiers
- The model can use the structured signal data to produce better rename proposals
- The legend vocabulary constrains model output to valid codes

## Design Principles

1. **Additive, not breaking.** The legend system enhances the existing dossier flow. Current heuristic inference continues to work. Signal profiles are an additional data layer.

2. **Evidence-based.** Every signal must cite evidence — the specific file, line, or pattern that triggered detection. No guessing from folder names alone.

3. **Confidence-scored.** All signals carry a confidence score. Low-confidence signals are stored in the manifest but never encoded into folder names.

4. **Extensible.** New codes can be added to the legend without changing the scanner architecture. Each code is a self-contained detection rule.

5. **Tier-aware.** The system always knows which tier a signal belongs to. This determines priority for name encoding and display ordering in the TUI.

## HTML and CSS Detection Depth

Web technologies deserve special attention since they appear in nearly every frontend codebase. The scanner will classify HTML and CSS at a granular level:

**HTML signals:**
- Semantic HTML (uses `<article>`, `<nav>`, `<section>`, `<aside>`, `<header>`, `<footer>`, `<main>`)
- Accessible HTML (ARIA attributes, `role` attributes, `alt` text, `label` associations)
- Form HTML (form elements, validation attributes, fieldsets)
- Template HTML (Handlebars, EJS, Pug, Jinja — detected from file extensions and syntax)
- Meta/SEO HTML (`<meta>` tags, Open Graph, structured data)

**CSS signals:**
- Methodology: vanilla, BEM, Tailwind, CSS Modules, CSS-in-JS, Styled Components, Emotion
- Layout: Flexbox, Grid, float-based (legacy)
- Responsive: media queries, container queries, `clamp()`/fluid typography
- Animation: `@keyframes`, transitions, `animation-*` properties
- Theming: CSS custom properties (`--var`), dark mode (`prefers-color-scheme`)
- Modern CSS: nesting, `:has()`, `@layer`, `@container`, subgrid

These sub-signals roll up into the top-level `ht` (HTML) and `cs`/`tw`/`cm` (CSS) codes in the legend, but the manifest stores the full granular breakdown.
