interface TestSuite {
  name: string;
  command: string[];
}

const suites: TestSuite[] = [
  { name: "cli", command: ["bun", "run", "src/cli/index.test.ts"] },
  { name: "prompts", command: ["bun", "run", "src/prompts.test.ts"] },
  { name: "html-prompts", command: ["bun", "run", "src/html-prompts.test.ts"] },
  { name: "browser", command: ["bun", "run", "src/browser.test.ts"] },
  { name: "storage", command: ["bun", "run", "src/storage.test.ts"] },
  { name: "file-lock", command: ["bun", "run", "src/file-lock.test.ts"] },
  { name: "revisions", command: ["bun", "run", "src/revisions.test.ts"] },
  { name: "views", command: ["bun", "run", "src/tui/views.test.ts"] },
  { name: "app", command: ["bun", "run", "src/tui/app.test.ts"] },
  { name: "input", command: ["bun", "run", "src/tui/input.test.ts"] },
  { name: "typeset", command: ["bun", "run", "src/tui/typeset.test.ts"] },
  { name: "motion", command: ["bun", "--conditions=browser", "run", "src/tui/motion.test.ts"] },
  { name: "aesthetics", command: ["bun", "run", "src/tui/aesthetics.test.ts"] },
  { name: "theme", command: ["bun", "run", "src/tui/theme.test.ts"] },
];

const failed: string[] = [];

for (const suite of suites) {
  console.log(`\n=== ${suite.name} ===`);
  const proc = Bun.spawn(suite.command, {
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    failed.push(`${suite.name} (${exitCode})`);
  }
}

console.log(`\n${"=".repeat(40)}`);
if (failed.length > 0) {
  console.error(`Failed suites: ${failed.join(", ")}`);
  process.exit(1);
}

console.log("All suites passed.");

export {};
