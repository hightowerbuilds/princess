import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, readFile, readdir, stat, rm } from "node:fs/promises";
import { getPaths, } from "../paths.ts";
import { bootstrap, createPrompt, listPrompts } from "./index.ts";

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
      assert(inboxStat.isDirectory(), "bootstrap creates inbox directory");
      assert(agentText.includes("Princess Prompt Stacker"), "bootstrap writes agent instructions");
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
      } finally {
        console.log = original;
      }

      assert(logs.some((line) => line.includes("Inbox Prompts:")), "listPrompts prints top-level header");
      assert(logs.some((line) => line.includes("alpha.md")), "listPrompts prints files");
      assert(logs.some((line) => line.includes("Inbox Prompts in folder:")), "listPrompts prints category header");
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
