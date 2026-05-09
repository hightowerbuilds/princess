# Roadmap: XDG Base Directory Migration

**Goal:** Align Princess with modern system standards by moving from a hardcoded `~/.princess` folder to the XDG Base Directory Specification (and platform-specific equivalents for macOS/Windows).

---

## Phase 1: Research & abstraction (Immediate)
- [ ] **Define Directory Mapping:**
    - **Config:** `XDG_CONFIG_HOME` (Default: `~/.config/princess`) -> For `AGENT.md`.
    - **Data:** `XDG_DATA_HOME` (Default: `~/.local/share/princess`) -> For the `inbox/`.
    - **macOS Exception:** Evaluate if we should use `~/Library/Application Support/princess` or stick to XDG for developer-centric tools.
- [ ] **Path Utility:** Create a centralized `src/tui/paths.ts` to resolve these paths dynamically rather than hardcoding `~/.princess` in multiple files.

## Phase 2: Implementation (Short-term)
- [ ] **Environment Variable Support:** 
    - Support `PRINCESS_HOME` as an override.
    - Respect `XDG_CONFIG_HOME` and `XDG_DATA_HOME` if they are set in the user's shell.
- [ ] **CLI Update:** Update `princess init` to create the new directory structure.
- [ ] **TUI Update:** Update `src/tui/app.ts` to read from the new resolved Data path.

## Phase 3: Migration & Compatibility (Medium-term)
- [ ] **Auto-Migration Script:**
    - On startup, check if `~/.princess` exists and the new XDG paths do NOT.
    - Prompt the user to migrate: `mv ~/.princess/* [New XDG Path]`.
- [ ] **Fallback Logic:** If migration isn't performed, maintain a fallback to `~/.princess` for a few versions but issue a "Deprecated" warning in the TUI footer.

## Phase 4: Project-Local Mode (Advanced)
- [ ] **Local Discovery:** If a `.princess/` directory exists in the current working directory (CWD), prioritize it over the global XDG path. 
    - This allows teams to check prompt inboxes into a git repo for specific projects.

---

## Technical Considerations
- **Node/Bun standard:** Use `os.homedir()` as the base.
- **Dependency:** Consider using a light library like `env-paths` or `xdg-app-paths`, or implement a simple native helper to keep dependencies low.
- **Agent Contract:** Ensure `AGENT.md` instructions are updated to explain that paths may vary based on environment variables.
