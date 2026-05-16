import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, readFile, readdir, stat, rm, writeFile } from "node:fs/promises";
import { getPaths } from "../paths.ts";
import { bootstrap, createClaudeMd, createPrompt, formatCliError, listPrompts, seedExamples } from "./index.ts";
import { AGENT_LETTER_FILENAME, AGENT_LETTER_TITLE } from "../default-prompts.ts";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

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
  console.log(`\n── ${name} ──`);
}

async function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const saved = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(vars)) {
    saved.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of saved.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function withCwd<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const previous = process.cwd();
  process.chdir(dir);
  try {
    return await fn();
  } finally {
    process.chdir(previous);
  }
}

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "princess-cli-"));

try {
  section("formatCliError");

  assertEq(formatCliError(new Error("Readable failure")), "Readable failure", "formats Error objects without stack traces");
  assertEq(formatCliError("plain failure"), "plain failure", "formats non-Error failures");

  section("getPaths");

  await withEnv(
    {
      PRINCESS_HOME: path.join(tempRoot, "custom-home"),
      XDG_DATA_HOME: undefined,
      XDG_CONFIG_HOME: undefined,
    },
    async () => {
      const paths = getPaths();
      assertEq(paths.dataDir, path.join(tempRoot, "custom-home"), "PRINCESS_HOME overrides dataDir");
      assertEq(paths.inboxDir, path.join(tempRoot, "custom-home", "inbox"), "PRINCESS_HOME sets inboxDir");
      assertEq(paths.agentFile, path.join(tempRoot, "custom-home", "AGENT.md"), "PRINCESS_HOME sets agentFile");
      assertEq(paths.isLocal, false, "PRINCESS_HOME is not local mode");
    },
  );

  await withEnv(
    {
      PRINCESS_HOME: undefined,
      XDG_DATA_HOME: undefined,
      XDG_CONFIG_HOME: undefined,
    },
    async () => {
      const projectDir = path.join(tempRoot, "project");
      await mkdir(path.join(projectDir, ".princess"), { recursive: true });
      await withCwd(projectDir, async () => {
        const paths = getPaths();
        assertEq(paths.dataDir, path.join(process.cwd(), ".princess"), "project-local .princess is preferred");
        assertEq(paths.isLocal, true, "project-local mode is detected");
      });
    },
  );

  section("bootstrap");

  await withEnv(
    {
      PRINCESS_HOME: path.join(tempRoot, "bootstrap-home"),
      XDG_DATA_HOME: undefined,
      XDG_CONFIG_HOME: undefined,
    },
    async () => {
      await bootstrap(false);
      const paths = getPaths();
      const inboxStat = await stat(paths.inboxDir);
      const agentText = await readFile(paths.agentFile, "utf8");
      const seededLetter = await readFile(path.join(paths.inboxDir, AGENT_LETTER_FILENAME), "utf8");
      assert(inboxStat.isDirectory(), "bootstrap creates inbox directory");
      assert(agentText.includes("Princess Prompt Stacker"), "bootstrap writes agent instructions");
      assert(seededLetter.includes("## Save a Structured HTML Prompt"), "bootstrap seeds the agent letter prompt");
      assert(seededLetter.includes(`title: ${AGENT_LETTER_TITLE}`), "bootstrap seeds the uppercase agent letter title");
    },
  );

  section("createPrompt");

  await withEnv(
    {
      PRINCESS_HOME: path.join(tempRoot, "prompt-home"),
      XDG_DATA_HOME: undefined,
      XDG_CONFIG_HOME: undefined,
    },
    async () => {
      await createPrompt("Hello, World!", "team/prompts");
      const paths = getPaths();
      const created = path.join(paths.inboxDir, "team", "prompts", "hello-world.md");
      const content = await readFile(created, "utf8");
      assert(content.startsWith("---\n"), "createPrompt writes frontmatter");
      assert(content.includes("title: Hello, World!"), "createPrompt stores title metadata");
      assert(content.includes("category: team/prompts"), "createPrompt stores category metadata");
      assert(content.includes("status: draft"), "createPrompt stores status metadata");
      assert(content.includes("# Hello, World!"), "createPrompt writes the markdown body");

      await createPrompt("Hello, World!", "team/prompts");
      const second = path.join(paths.inboxDir, "team", "prompts", "hello-world-2.md");
      assert((await stat(second).catch(() => null))?.isFile() === true, "createPrompt auto-suffixes colliding markdown prompts");
    },
  );

  await withEnv(
    {
      PRINCESS_HOME: path.join(tempRoot, "prompt-home-2"),
      XDG_DATA_HOME: undefined,
      XDG_CONFIG_HOME: undefined,
    },
    async () => {
      await createPrompt("!!!");
      const paths = getPaths();
      const created = path.join(paths.inboxDir, "untitled-prompt.md");
      const content = await readFile(created, "utf8");
      assert(content.includes("title: !!!"), "blank titles still store the original title");
      assert(content.includes("# !!!"), "blank titles still create the heading body");
    },
  );

  await withEnv(
    {
      PRINCESS_HOME: path.join(tempRoot, "html-prompt-home"),
      XDG_DATA_HOME: undefined,
      XDG_CONFIG_HOME: undefined,
    },
    async () => {
      await createPrompt("HTML Agent Brief", "web", "html");
      const paths = getPaths();
      const workspaceDir = path.join(paths.inboxDir, "web", "html-agent-brief");
      const html = await readFile(path.join(workspaceDir, "prompt.html"), "utf8");
      const manifest = await readFile(path.join(workspaceDir, "manifest.json"), "utf8");
      assert(html.includes("data-princess-prompt"), "createPrompt supports HTML prompt workspaces");
      assert(manifest.includes('"format": "html"'), "HTML prompt workspace has a manifest");

      await createPrompt("HTML Agent Brief", "web", "html");
      const suffixed = path.join(paths.inboxDir, "web", "html-agent-brief-2", "prompt.html");
      assert((await stat(suffixed).catch(() => null))?.isFile() === true, "createPrompt auto-suffixes colliding HTML workspaces");
    },
  );

  section("seedExamples");

  await withEnv(
    {
      PRINCESS_HOME: path.join(tempRoot, "seed-home"),
      XDG_DATA_HOME: undefined,
      XDG_CONFIG_HOME: undefined,
    },
    async () => {
      const paths = getPaths();
      await seedExamples(paths.inboxDir);
      const letterPath = path.join(paths.inboxDir, AGENT_LETTER_FILENAME);
      const letter = await readFile(letterPath, "utf8");
      assert(letter.includes(`title: ${AGENT_LETTER_TITLE}`), "seedExamples includes the uppercase agent letter prompt");
      assert(letter.includes(`# ${AGENT_LETTER_TITLE}`), "seedExamples uses the uppercase agent letter heading");
      assert(letter.includes("## Save a Structured HTML Prompt"), "agent letter explains the HTML prompt builder");
      assert(letter.includes("princess html set-section"), "agent letter documents HTML section authoring");
      assert(letter.includes("princess html add-asset"), "agent letter documents HTML assets");
      assert(letter.includes("princess html open"), "agent letter documents opening HTML prompts in the browser");
      assert(letter.includes("princess html compile"), "agent letter documents HTML compile targets");
      assert((await stat(path.join(paths.inboxDir, "examples", AGENT_LETTER_FILENAME)).catch(() => null)) === null, "agent letter is not seeded under examples");
    },
  );

  section("createClaudeMd");

  await withEnv(
    {
      PRINCESS_HOME: path.join(tempRoot, "claude-home"),
      XDG_DATA_HOME: undefined,
      XDG_CONFIG_HOME: undefined,
    },
    async () => {
      const projectDir = path.join(tempRoot, "claude-project");
      await mkdir(projectDir, { recursive: true });
      await withCwd(projectDir, async () => {
        const claudePath = path.join(projectDir, "CLAUDE.md");
        await writeFile(claudePath, "# Notes\n\nPrincess Leia is not a section sentinel.\n", "utf8");
        await createClaudeMd();
        await createClaudeMd();
        const content = await readFile(claudePath, "utf8");
        const matches = content.match(/^## Princess$/gm) ?? [];
        assertEq(matches.length, 1, "createClaudeMd appends exactly one Princess section");
        assert(content.includes("Princess Leia is not a section sentinel."), "createClaudeMd preserves incidental mentions");
      });
    },
  );

  section("listPrompts");

  await withEnv(
    {
      PRINCESS_HOME: path.join(tempRoot, "list-home"),
      XDG_DATA_HOME: undefined,
      XDG_CONFIG_HOME: undefined,
    },
    async () => {
      const paths = getPaths();
      await mkdir(paths.inboxDir, { recursive: true });
      await mkdir(path.join(paths.inboxDir, "assets"), { recursive: true });
      await writeFile(path.join(paths.inboxDir, "assets", "wireframe.svg"), "<svg></svg>", "utf8");
      await writeFile(path.join(paths.inboxDir, "assets", "features.csv"), "Feature,Value\nSearch,High\n", "utf8");
      await createPrompt("Alpha");
      await createPrompt("Nested", "folder");

      const logs: string[] = [];
      const original = console.log;
      console.log = (...args: unknown[]) => {
        logs.push(args.map(String).join(" "));
      };
      try {
        await listPrompts();
        await listPrompts("folder");
        await listPrompts("assets");
      } finally {
        console.log = original;
      }

      assert(logs.some((line) => line.includes("Inbox Prompts:")), "listPrompts prints top-level header");
      assert(logs.some((line) => line.includes("alpha.md")), "listPrompts prints files");
      assert(logs.some((line) => line.includes("Inbox Prompts in folder:")), "listPrompts prints category header");
      assert(logs.some((line) => line.includes("wireframe.svg")), "listPrompts prints image asset filenames");
      assert(logs.some((line) => line.includes("features.csv")), "listPrompts prints table data filenames");
      const missingCategory = path.join(paths.inboxDir, "missing");
      assert(!(await stat(missingCategory).catch(() => null)), "listPrompts does not create missing categories");
    },
  );

  console.log(`\n${"─".repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  else console.log("All tests passed!");
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
