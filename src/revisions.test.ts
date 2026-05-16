import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { getPaths } from "./paths.ts";
import { getPromptRevisionDir, recordPromptRevision, readLatestPromptRevision, listPromptRevisions, formatRevisionTimestamp } from "./revisions.ts";

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

  section("listPromptRevisions deltas");

  const deltaFile = path.join(paths.inboxDir, "team", "delta.md");
  const deltaDir = getPromptRevisionDir(deltaFile, paths);
  await mkdir(deltaDir, { recursive: true });
  await writeFile(path.join(deltaDir, "2026-05-10T00-00-00-000Z.md"), "same\nsame\nkeep\n", "utf8");
  await writeFile(path.join(deltaDir, "2026-05-10T00-00-01-000Z.md"), "same\nkeep\n", "utf8");
  const deltaRevisions = await listPromptRevisions(deltaFile, paths);
  assertEq(deltaRevisions[0].removed, 1, "delta counts removal of one duplicate line");
  assertEq(deltaRevisions[0].added, 0, "delta does not invent additions for duplicate removals");

  section("formatRevisionTimestamp");

  assertEq(
    formatRevisionTimestamp("2026-05-16T18-14-14-450Z"),
    "2026-05-16 18:14:14",
    "formats filename-style timestamps as YYYY-MM-DD HH:MM:SS",
  );
  assertEq(
    formatRevisionTimestamp("2026-05-16T18:14:14.450Z"),
    "2026-05-16 18:14:14",
    "formats raw ISO timestamps as YYYY-MM-DD HH:MM:SS",
  );

  section("external revision paths");

  const firstExternal = getPromptRevisionDir(path.join(tempRoot, "external-a", "foo.md"), paths);
  const secondExternal = getPromptRevisionDir(path.join(tempRoot, "external-b", "foo.md"), paths);
  assert(firstExternal !== secondExternal, "external revision dirs include full-path identity");
} finally {
  delete process.env.PRINCESS_HOME;
  await rm(tempRoot, { recursive: true, force: true });
}

console.log(`\n${"─".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else console.log("All tests passed!");
