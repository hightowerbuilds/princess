import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { atomicWriteFile } from "./storage.ts";

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

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "princess-storage-"));

try {
  section("atomicWriteFile");

  const target = path.join(tempRoot, "prompt.md");
  await writeFile(target, "old content\n", "utf8");
  await atomicWriteFile(target, "new content\n");

  const content = await readFile(target, "utf8");
  assertEq(content, "new content\n", "writes the updated content");

  const entries = await readdir(tempRoot);
  assert(entries.length === 1, "does not leave temp files behind");
  assert(entries[0] === "prompt.md", "only the target file remains");
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log(`\n${"─".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else console.log("All tests passed!");
