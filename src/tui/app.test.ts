import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { AGENT_LETTER_FILENAME } from "../default-prompts.ts";
import { filterPromptSearchEntries } from "../prompts.ts";
import { collectPromptSearchEntries, compareInboxEntriesForDisplay } from "./app.ts";
import type { InboxEntry } from "./state.ts";

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
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log(`\n${"-".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else console.log("All tests passed!");
