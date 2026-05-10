import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { getPaths } from "./paths.ts";
import { recordPromptRevision, readLatestPromptRevision, listPromptRevisions } from "./revisions.ts";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

function assertEq<T>(actual: T, expected: T, message: string) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++;
  else {
    failed++;
    console.error(`  FAIL: ${message}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
  }
}

function section(name: string) {
  console.log(`\n── ${name} ──`);
}

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "princess-revisions-"));

try {
  section("recordPromptRevision");

  const home = path.join(tempRoot, "home");
  process.env.PRINCESS_HOME = home;
  const paths = getPaths();
  const filePath = path.join(paths.inboxDir, "team", "prompt.md");
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, "new content\n", "utf8");

  const revisionPath = await recordPromptRevision(filePath, "old content\n", paths);
  assert(revisionPath !== null, "revision path is created");
  const revisionText = revisionPath ? await readFile(revisionPath, "utf8") : "";
  assertEq(revisionText, "old content\n", "revision stores the previous file content");

  section("readLatestPromptRevision");

  const latest = await readLatestPromptRevision(filePath, paths);
  assert(latest !== null, "latest revision exists");
  assertEq(latest?.content, "old content\n", "latest revision reads back snapshot content");

  section("listPromptRevisions");

  const revisions = await listPromptRevisions(filePath, paths);
  assertEq(revisions.length, 1, "one revision is listed");
  assertEq(revisions[0].content, "old content\n", "revision listing preserves content");
} finally {
  delete process.env.PRINCESS_HOME;
  await rm(tempRoot, { recursive: true, force: true });
}

console.log(`\n${"─".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else console.log("All tests passed!");
