import path from "node:path";
import { defaultBrowserOpenCommand } from "./browser.ts";

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

section("defaultBrowserOpenCommand");

{
  const target = path.resolve("/tmp/princess prompt.html");
  assertEq(
    defaultBrowserOpenCommand(target, "darwin"),
    { command: "open", args: [target] },
    "uses open on macOS",
  );
  assertEq(
    defaultBrowserOpenCommand(target, "linux"),
    { command: "xdg-open", args: [target] },
    "uses xdg-open on Linux",
  );
  assertEq(
    defaultBrowserOpenCommand(target, "win32"),
    { command: "cmd", args: ["/c", "start", "", target] },
    "uses cmd start on Windows",
  );
}

console.log(`\n${"-".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else console.log("All tests passed!");
