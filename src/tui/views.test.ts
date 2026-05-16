import { createTuiState } from "./state.ts";
import { buildPromptDocument, parsePromptDocument } from "../prompts.ts";
import { renderInbox } from "./views/inbox.ts";
import { renderEditor } from "./views/editor.ts";
import { renderDiff } from "./views/diff.ts";
import { renderHelp } from "./views/help.ts";
import { renderRevisions } from "./views/revisions.ts";
import { renderRevisionPreview } from "./views/revision-preview.ts";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

function section(name: string) {
  console.log(`\n── ${name} ──`);
}

section("renderInbox");

{
  const state = createTuiState();
  state.setState("terminal", { columns: 80, rows: 24 });

  const content = buildPromptDocument("Inbox Prompt", {
    category: "team/prompts",
    status: "ready",
    createdAt: "2026-05-09T12:00:00.000Z",
    updatedAt: "2026-05-09T12:00:00.000Z",
  });

  state.setState("inbox", "files",[
    {
      name: "inbox-prompt.md",
      path: "/tmp/inbox-prompt.md",
      isDirectory: false,
      prompt: parsePromptDocument(content),
    },
  ]);

  const lines = renderInbox(state, 80, 24);
  assert(lines.some((line) => line.includes("You are here:")), "shows active inbox filesystem path");
  assert(lines.some((line) => line.includes("inbox-prompt.md")), "shows filename");
  assert(lines.some((line) => line.includes("ready")), "shows status metadata");
  assert(lines.some((line) => line.includes("team/prompts")), "shows category metadata");
  assert(lines.some((line) => line.includes("Inbox Prompt")), "shows prompt preview or title");
}

section("renderInbox search");

{
  const state = createTuiState();
  state.setState("terminal", { columns: 80, rows: 24 });
  state.setState("inbox", "searchQuery","draft");
  state.setState("inbox", "searchMode",true);
  state.setState("inbox", "files",[
    {
      name: "team-note.md",
      label: "team/notes/team-note.md",
      path: "/tmp/team-note.md",
      isDirectory: false,
      prompt: parsePromptDocument(
        buildPromptDocument("Team Note", {
          category: "team",
          status: "draft",
          createdAt: "2026-05-09T12:00:00.000Z",
          updatedAt: "2026-05-09T12:00:00.000Z",
        }),
      ),
    },
  ]);

  const lines = renderInbox(state, 80, 24);
  assert(lines.some((line) => line.includes("Search: draft")), "shows search query in footer");
  assert(lines.some((line) => line.includes("team/notes/team-note.md")), "shows search result path label");
}

section("renderInbox status message");

{
  const state = createTuiState();
  state.setState("terminal", { columns: 80, rows: 24 });
  state.setState("error", "Revision copied to clipboard.");

  const lines = renderInbox(state, 80, 24);
  assert(lines.some((line) => line.includes("Status: Revision copied to clipboard.")), "shows neutral status label for notices");
}

section("renderInbox image assets");

{
  const state = createTuiState();
  state.setState("terminal", { columns: 80, rows: 24 });
  state.setState("inbox", "files",[
    {
      name: "wireframe.svg",
      path: "/tmp/wireframe.svg",
      isDirectory: false,
      isAsset: true,
    },
  ]);

  const lines = renderInbox(state, 80, 24);
  assert(lines.some((line) => line.includes("wireframe.svg")), "shows image asset filename");
  assert(lines.some((line) => line.includes("[asset]")), "marks image assets without rendering them");
}

section("renderInbox table data files");

{
  const state = createTuiState();
  state.setState("terminal", { columns: 80, rows: 24 });
  state.setState("inbox", "files",[
    {
      name: "features.csv",
      path: "/tmp/features.csv",
      isDirectory: false,
      isTableData: true,
    },
  ]);

  const lines = renderInbox(state, 80, 24);
  assert(lines.some((line) => line.includes("features.csv")), "shows table data filename");
  assert(lines.some((line) => line.includes("[table]")), "marks table data without rendering it");
}

section("renderInbox empty state");

{
  const state = createTuiState();
  state.setState("terminal", { columns: 80, rows: 24 });

  const lines = renderInbox(state, 80, 24);
  assert(lines.some((line) => line.includes("Welcome to Princess.")), "shows onboarding welcome");
  assert(lines.some((line) => line.includes("create-prompt")), "shows create prompt guidance");
  assert(lines.some((line) => line.includes("Help")), "mentions help shortcut");
}

section("renderInbox delete confirmation");

{
  const state = createTuiState();
  state.setState("terminal", { columns: 80, rows: 24 });
  state.setState("inbox", "deleteConfirm",{
    name: "to-delete.md",
    path: "/tmp/to-delete.md",
    isDirectory: false,
  });

  const lines = renderInbox(state, 80, 24);
  assert(lines.some((line) => line.includes("Delete \"to-delete.md\"? (y/n)")), "shows delete confirmation prompt");
}

section("renderEditor");

{
  const state = createTuiState();
  state.setState("terminal", { columns: 80, rows: 24 });

  const content = buildPromptDocument("Editor Prompt", {
    category: "design",
    status: "draft",
    createdAt: "2026-05-09T12:00:00.000Z",
    updatedAt: "2026-05-09T12:00:00.000Z",
  });

  state.setState("editor", "file","/tmp/editor-prompt.md");
  state.setState("editor", "content",content);
  state.setState("editor", "cursorLine",0);
  state.setState("editor", "cursorCol",0);

  const { lines } = renderEditor(state, 80, 24);
  assert(lines.some((line) => line.includes("Editor Prompt")), "shows document content");
  assert(lines.some((line) => line.includes("draft")), "shows status metadata");
  assert(lines.some((line) => line.includes("design")), "shows category metadata");
  assert(lines.some((line) => line.includes("Ctrl+S")), "shows save shortcut");
  assert(lines.some((line) => line.includes("Ctrl+R")), "shows diff shortcut");
  assert(lines.some((line) => line.includes("[saved]")), "shows saved state");
}

section("renderEditor read-only HTML");

{
  const state = createTuiState();
  state.setState("terminal", { columns: 80, rows: 24 });
  state.setState("editor", "file","/tmp/prompt.html");
  state.setState("editor", "content","<!doctype html>\n");
  state.setState("editor", "readOnly",true);

  const { lines } = renderEditor(state, 80, 24);
  assert(lines.some((line) => line.includes("[read-only]")), "shows read-only indicator");
  assert(lines.some((line) => line.includes("[o] Browser")), "shows browser-open shortcut");
}

section("renderEditor dirty state");

{
  const state = createTuiState();
  state.setState("terminal", { columns: 80, rows: 24 });
  state.setState("editor", "saveState","dirty");
  state.setState("editor", "file","/tmp/editor-prompt.md");
  state.setState("editor", "content","draft text\n");
  const { lines } = renderEditor(state, 80, 24);
  assert(lines.some((line) => line.includes("[dirty]")), "shows dirty indicator");
  }

section("renderEditor conflict state");

{
  const state = createTuiState();
  state.setState("terminal", { columns: 80, rows: 24 });
  state.setState("editor", "saveState", "conflict");
  state.setState("editor", "file", "/tmp/editor-prompt.md");
  state.setState("editor", "content", "in-memory edit\n");
  const { lines } = renderEditor(state, 80, 24);
  assert(lines.some((line) => line.includes("[external change]")), "shows the external-change indicator in the header");
  assert(lines.some((line) => line.includes("File changed on disk")), "shows the conflict footer banner");
  assert(lines.some((line) => line.includes("Overwrite")), "footer offers Ctrl+S overwrite");
  assert(lines.some((line) => line.includes("Discard")), "footer offers Esc discard");
}

section("renderEditor preserves cursor character");

{
  const state = createTuiState();
  state.setState("terminal", { columns: 80, rows: 24 });
  state.setState("editor", "file","/tmp/html-prompt.html");
  state.setState("editor", "content","<!doctype html>\n");
  state.setState("editor", "cursorLine",0);
  state.setState("editor", "cursorCol",0);

  const { lines } = renderEditor(state, 80, 24);
  assert(lines.some((line) => line.includes("<!doctype html>")), "shows the character under the cursor");
}

section("renderDiff");

{
  const state = createTuiState();
  state.setState("terminal", { columns: 80, rows: 24 });
  state.setState("editor", "file","/tmp/diff-prompt.md");
  state.setState("diff", "revisionPath","/tmp/diff-prompt.md/2026-05-10T00-00-00-000Z.md");
  state.setState("diff", "oldContent","line one\nold line\nline three\n");
  state.setState("diff", "newContent","line one\nnew line\nline three\n");

  const lines = renderDiff(state, 80, 24);
  assert(lines.some((line) => line.includes("- old line")), "shows removed line");
  assert(lines.some((line) => line.includes("+ new line")), "shows added line");
  assert(lines.some((line) => line.includes("vs")), "shows revision label");
}

section("renderRevisions");

{
  const state = createTuiState();
  state.setState("terminal", { columns: 80, rows: 24 });
  state.setState("editor", "file","/tmp/history-prompt.md");
  state.setState("revisions", "files",[
    {
      path: "/tmp/history/2026-05-10T00-00-00-000Z.md",
      createdAt: "2026-05-10T00-00-00-000Z",
      content: buildPromptDocument("History Prompt", {
        category: "ops",
        status: "ready",
        createdAt: "2026-05-10T00:00:00.000Z",
        updatedAt: "2026-05-10T00:00:00.000Z",
      }),
    },
  ]);

  const lines = renderRevisions(state, 80, 24);
  assert(lines.some((line) => line.includes("Revisions: history-prompt.md")), "shows revisions title");
  assert(lines.some((line) => line.includes("2026-05-10")), "shows revision timestamp");
  assert(lines.some((line) => line.includes("History Prompt")), "shows revision preview");
  assert(lines.some((line) => line.includes("[Enter] Preview")), "shows preview shortcut");
}

section("renderRevisionPreview");

{
  const state = createTuiState();
  state.setState("terminal", { columns: 80, rows: 24 });
  state.setState("revisions", "previewPath","/tmp/history/2026-05-10T00-00-00-000Z.md");
  state.setState("revisions", "previewContent",
    buildPromptDocument("History Preview", {
      category: "ops",
      status: "ready",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    }),
  );

  const lines = renderRevisionPreview(state, 80, 24);
  assert(lines.some((line) => line.includes("Preview: 2026-05-10T00-00-00-000Z.md")), "shows preview title");
  assert(lines.some((line) => line.includes("History Preview")), "shows revision content");
  assert(lines.some((line) => line.includes("[r] Restore")), "shows restore shortcut");
}

section("renderHelp");

{
  const state = createTuiState();
  state.setState("terminal", { columns: 80, rows: 24 });
  state.setState("inbox", "directory","team/prompts");
  state.setState("editor", "file","/tmp/history-prompt.md");

  const lines = renderHelp(state, 80, 24);
  assert(lines.some((line) => line.includes("Help & Status")), "shows help title");
  assert(lines.some((line) => line.includes("default browser")), "documents browser-open shortcut");
  assert(lines.some((line) => line.includes("Inbox")), "shows inbox storage path");
  assert(lines.some((line) => line.includes("Mode")), "shows current mode");
  assert(lines.some((line) => line.includes("team/prompts")), "shows current directory");
}

console.log(`\n${"─".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else console.log("All tests passed!");
