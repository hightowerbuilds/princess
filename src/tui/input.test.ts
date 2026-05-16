import { parseKeyEvents } from "./input.ts";

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

section("parseKeyEvents ASCII");

{
  const events = parseKeyEvents(Buffer.from("aA?/", "utf8"));
  assertEq(events.map((event) => event.name), ["a", "A", "?", "/"], "parses printable ASCII");
  assertEq(events.map((event) => event.shift), [false, true, true, false], "tracks shifted printable characters");
}

section("parseKeyEvents UTF-8");

{
  const events = parseKeyEvents(Buffer.from("é—🙂", "utf8"));
  assertEq(events.map((event) => event.name), ["é", "—", "🙂"], "emits one event per UTF-8 code point");
  assert(events.every((event) => !event.ctrl && !event.meta), "UTF-8 text is plain input");
}

section("parseKeyEvents controls");

{
  const events = parseKeyEvents(Buffer.from([0x03, 0x1f, 0x7f]));
  assertEq(events.map((event) => event.name), ["ctrl+c", "ctrl+/", "backspace"], "parses control keys");
  assertEq(events.map((event) => event.ctrl), [true, true, false], "tracks ctrl state");
}

console.log(`\n${"─".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else console.log("All tests passed!");
