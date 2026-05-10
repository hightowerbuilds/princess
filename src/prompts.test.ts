import { buildPromptDocument, filterPromptSearchEntries, parsePromptDocument, sanitizePromptTitle } from "./prompts.ts";

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

section("sanitizePromptTitle");

assertEq(sanitizePromptTitle("Hello, World!"), "hello-world", "sanitizes punctuation");
assertEq(sanitizePromptTitle("!!!"), "untitled-prompt", "falls back for empty titles");

section("buildPromptDocument");

const doc = buildPromptDocument("Hello, World!", {
  category: "team/prompts",
  createdAt: "2026-05-09T12:00:00.000Z",
  updatedAt: "2026-05-09T12:00:00.000Z",
  status: "draft",
});

assert(doc.startsWith("---\n"), "document starts with frontmatter");
assert(doc.includes("title: Hello, World!"), "frontmatter includes title");
assert(doc.includes("category: team/prompts"), "frontmatter includes category");
assert(doc.includes("# Hello, World!"), "document includes markdown heading");

section("parsePromptDocument");

const parsed = parsePromptDocument(doc);
assertEq(parsed.metadata.title, "Hello, World!", "parser reads title");
assertEq(parsed.metadata.category, "team/prompts", "parser reads category");
assertEq(parsed.metadata.status, "draft", "parser reads status");
assert(parsed.preview === "# Hello, World!", "preview uses first body line");

const plain = parsePromptDocument("just text");
assertEq(plain.hasFrontmatter, false, "plain text has no frontmatter");
assertEq(plain.preview, "just text", "plain preview uses content");

section("filterPromptSearchEntries");

{
  const entries = [
    {
      name: "alpha.md",
      path: "/tmp/alpha.md",
      relativePath: "alpha.md",
      document: parsePromptDocument(buildPromptDocument("Alpha", { category: "team", status: "ready" })),
    },
    {
      name: "beta.md",
      path: "/tmp/beta.md",
      relativePath: "nested/beta.md",
      document: parsePromptDocument(buildPromptDocument("Beta", { category: "design", status: "draft" })),
    },
  ];

  const byStatus = filterPromptSearchEntries("draft", entries);
  assertEq(byStatus.length, 1, "search filters by status");
  assertEq(byStatus[0].name, "beta.md", "search returns the matching file");

  const byCategory = filterPromptSearchEntries("team", entries);
  assertEq(byCategory.length, 1, "search filters by category");
  assertEq(byCategory[0].name, "alpha.md", "category match returns alpha");
}

console.log(`\n${"─".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else console.log("All tests passed!");
