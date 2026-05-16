import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { createRoot } from "solid-js";
import { AGENT_LETTER_FILENAME } from "../default-prompts.ts";
import { filterPromptSearchEntries } from "../prompts.ts";
import { collectPromptSearchEntries, createEditorSaveLoop, loadInboxFiles } from "./app.ts";
import { compareInboxEntriesForDisplay } from "../inbox-files.ts";
import { createTuiState, type InboxEntry } from "./state.ts";

let passed = 0;
let failed = 0;

function assertEq<T>(actual: T, expected: T, message: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
    console.error(`    expected: ${e}`);
    console.error(`    actual:   ${a}`);
  }
}

function section(name: string) {
  console.log(`\n-- ${name} --`);
}

function entry(name: string, isDirectory = false): InboxEntry {
  return {
    name,
    path: `/tmp/${name}`,
    isDirectory,
  };
}

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "princess-app-"));

try {
  section("compareInboxEntriesForDisplay root");

  {
    const entries = [
      entry("examples", true),
      entry("zeta.md"),
      entry(AGENT_LETTER_FILENAME),
      entry("alpha.md"),
    ];

    entries.sort((a, b) => compareInboxEntriesForDisplay("", a, b));

    assertEq(
      entries.map((item) => item.name),
      [AGENT_LETTER_FILENAME, "examples", "alpha.md", "zeta.md"],
      "pins the Princess agent letter first at inbox root",
    );
  }

  section("compareInboxEntriesForDisplay nested");

  {
    const entries = [
      entry("zeta.md"),
      entry(AGENT_LETTER_FILENAME),
      entry("examples", true),
      entry("alpha.md"),
    ];

    entries.sort((a, b) => compareInboxEntriesForDisplay("team", a, b));

    assertEq(
      entries.map((item) => item.name),
      ["examples", AGENT_LETTER_FILENAME, "alpha.md", "zeta.md"],
      "keeps normal directory-first ordering outside the inbox root",
    );
  }

  section("collectPromptSearchEntries HTML workspaces");

  {
    const inboxDir = path.join(tempRoot, "inbox");
    const workspaceDir = path.join(inboxDir, "showcase", "landing-page-build-brief");
    await mkdir(path.join(workspaceDir, "sources"), { recursive: true });
    await mkdir(path.join(workspaceDir, "assets"), { recursive: true });
    await mkdir(path.join(workspaceDir, "partials"), { recursive: true });
    await writeFile(
      path.join(workspaceDir, "manifest.json"),
      `${JSON.stringify({
        version: 1,
        format: "html",
        title: "Landing Page Build Brief",
        slug: "landing-page-build-brief",
        createdAt: "2026-05-16T12:00:00.000Z",
        updatedAt: "2026-05-16T12:00:00.000Z",
        resources: [
          {
            id: "notes",
            type: "source",
            path: "sources/notes.md",
            mediaType: "text/markdown",
            trust: "trusted",
            addedAt: "2026-05-16T12:00:00.000Z",
          },
          {
            id: "wireframe",
            type: "asset",
            path: "assets/wireframe.png",
            mediaType: "image/png",
            alt: "Homepage wireframe for pricing page",
            addedAt: "2026-05-16T12:00:00.000Z",
          },
          {
            id: "features",
            type: "table",
            path: "partials/features.table.html",
            mediaType: "text/html",
            trust: "untrusted",
            originalPath: "/tmp/features.csv",
            addedAt: "2026-05-16T12:00:00.000Z",
          },
        ],
      }, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      path.join(workspaceDir, "prompt.html"),
      `<main data-princess-prompt>
  <section data-princess-role="instructions">
    <h1>Landing Page Build Brief</h1>
    <p>Use accessibility constraints for the hero layout.</p>
  </section>
</main>
`,
      "utf8",
    );
    await writeFile(path.join(workspaceDir, "sources", "notes.md"), "Conversion funnel notes.", "utf8");
    await writeFile(path.join(workspaceDir, "assets", "wireframe.png"), "not a real png", "utf8");
    await writeFile(
      path.join(workspaceDir, "partials", "features.table.html"),
      "<table><tr><th>Feature</th><th>User impact</th></tr><tr><td>Workspace search</td><td>High</td></tr></table>",
      "utf8",
    );

    const entries = await collectPromptSearchEntries(inboxDir, "");
    const workspace = entries.find((item) => item.relativePath === "showcase/landing-page-build-brief");
    assertEq(workspace?.isHtmlWorkspace, true, "indexes HTML workspaces");
    assertEq(workspace?.isDirectory, true, "keeps HTML workspace search result openable as a workspace");
    assertEq(
      entries.some((item) => item.relativePath === "showcase/landing-page-build-brief/sources/notes.md"),
      false,
      "does not index files inside HTML workspaces as separate prompt results",
    );
    assertEq(
      filterPromptSearchEntries("accessibility", entries)[0]?.relativePath,
      "showcase/landing-page-build-brief",
      "search matches prompt.html content",
    );
    assertEq(
      filterPromptSearchEntries("conversion", entries)[0]?.relativePath,
      "showcase/landing-page-build-brief",
      "search matches readable source resource content",
    );
    assertEq(
      filterPromptSearchEntries("wireframe", entries)[0]?.relativePath,
      "showcase/landing-page-build-brief",
      "search matches asset metadata",
    );
    assertEq(
      filterPromptSearchEntries("user impact", entries)[0]?.relativePath,
      "showcase/landing-page-build-brief",
      "search matches imported table partial content",
    );
  }

  section("editor save loop detects external file changes");

  {
    const editorDir = path.join(tempRoot, "editor-conflict");
    await mkdir(editorDir, { recursive: true });
    const filepath = path.join(editorDir, "prompt.md");
    await writeFile(filepath, "v1\n", "utf8");

    const state = createTuiState();
    await new Promise<void>((resolve) => {
      createRoot(async (dispose) => {
        const api = createEditorSaveLoop(state);
        state.setState("editor", "file", filepath);
        state.setState("editor", "content", "v1\n");
        await api.resetBaseline();

        const externalContent = "external edit\n";
        await writeFile(filepath, externalContent, "utf8");
        const future = (await stat(filepath)).mtimeMs + 5000;
        await utimes(filepath, future / 1000, future / 1000);

        state.setState("editor", "content", "user edit\n");
        await api.save(false);
        assertEq(
          state.state.editor.saveState,
          "conflict",
          "save aborts and flips to conflict when on-disk mtime diverges from baseline",
        );
        assertEq(
          await readFile(filepath, "utf8"),
          externalContent,
          "conflicting save does not touch the on-disk file",
        );

        await api.save(true, true);
        assertEq(
          state.state.editor.saveState,
          "clean",
          "explicit overwrite save returns to clean state",
        );
        assertEq(
          await readFile(filepath, "utf8"),
          "user edit\n",
          "overwrite save writes the user's edit to disk",
        );

        dispose();
        resolve();
      });
    });
  }

  section("editor save refreshes frontmatter updatedAt");

  {
    const editorDir = path.join(tempRoot, "editor-updatedat");
    await mkdir(editorDir, { recursive: true });
    const filepath = path.join(editorDir, "prompt.md");
    const oldStamp = "2020-01-01T00:00:00.000Z";
    const originalContent =
      `---\ntitle: Sample\ncreatedAt: ${oldStamp}\nupdatedAt: ${oldStamp}\n---\noriginal body\n`;
    await writeFile(filepath, originalContent, "utf8");

    const state = createTuiState();
    await new Promise<void>((resolve) => {
      createRoot(async (dispose) => {
        const api = createEditorSaveLoop(state);
        state.setState("editor", "file", filepath);
        state.setState("editor", "content", originalContent);
        await api.resetBaseline();

        const editedContent =
          `---\ntitle: Sample\ncreatedAt: ${oldStamp}\nupdatedAt: ${oldStamp}\n---\nupdated body\n`;
        const beforeSave = Date.now();
        state.setState("editor", "content", editedContent);
        await api.save(true);
        const afterSave = Date.now();

        const onDisk = await readFile(filepath, "utf8");
        assertEq(
          onDisk.includes(`updatedAt: ${oldStamp}`),
          false,
          "save rewrites the stale updatedAt frontmatter line",
        );
        assertEq(
          onDisk.includes("updated body"),
          true,
          "save persists the body edit alongside the frontmatter refresh",
        );

        const match = onDisk.match(/^updatedAt: (.+)$/m);
        assertEq(match !== null, true, "save writes a fresh updatedAt frontmatter line");
        const newStamp = match ? match[1] : "";
        const parsedStamp = new Date(newStamp).getTime();
        assertEq(
          Number.isFinite(parsedStamp) && parsedStamp >= beforeSave - 1000 && parsedStamp <= afterSave + 1000,
          true,
          "new updatedAt parses as a Date close to the save moment",
        );

        assertEq(
          state.state.editor.content,
          onDisk,
          "in-memory editor content matches the rewritten on-disk content",
        );

        await api.save(false);
        assertEq(
          state.state.editor.saveState,
          "clean",
          "subsequent save with no further edits is a no-op clean (baseline matches refreshed content)",
        );

        dispose();
        resolve();
      });
    });
  }

  section("loadInboxFiles preserves cursor by name on refresh");

  {
    const inboxDir = path.join(tempRoot, "cursor-preservation");
    await mkdir(inboxDir, { recursive: true });
    await writeFile(path.join(inboxDir, "alpha.md"), "a", "utf8");
    await writeFile(path.join(inboxDir, "bravo.md"), "b", "utf8");
    await writeFile(path.join(inboxDir, "charlie.md"), "c", "utf8");

    const state = createTuiState();
    await loadInboxFiles(state, inboxDir, "");
    assertEq(
      state.state.inbox.files.map((f) => f.name),
      ["alpha.md", "bravo.md", "charlie.md"],
      "initial load lists files in display order",
    );

    state.setState("inbox", "cursor", 1);
    assertEq(state.state.inbox.files[state.state.inbox.cursor]?.name, "bravo.md", "cursor starts on bravo.md");

    await writeFile(path.join(inboxDir, "00-prepended.md"), "z", "utf8");
    await loadInboxFiles(state, inboxDir, "");

    assertEq(
      state.state.inbox.files.map((f) => f.name),
      ["00-prepended.md", "alpha.md", "bravo.md", "charlie.md"],
      "refresh picks up the new file in sorted order",
    );
    assertEq(
      state.state.inbox.files[state.state.inbox.cursor]?.name,
      "bravo.md",
      "cursor follows bravo.md to its new index after a prepended file appears",
    );

    await rm(path.join(inboxDir, "bravo.md"));
    await loadInboxFiles(state, inboxDir, "");
    assertEq(
      state.state.inbox.files.map((f) => f.name),
      ["00-prepended.md", "alpha.md", "charlie.md"],
      "refresh drops the externally-deleted file",
    );
    assertEq(
      state.state.inbox.cursor < state.state.inbox.files.length,
      true,
      "cursor stays within bounds after the selected file disappears externally",
    );
  }
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log(`\n${"-".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else console.log("All tests passed!");
