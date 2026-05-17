import { parseKeyEvents, parseKeyEventBuffer } from "./input.ts";

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

// Helpers for streaming-input simulation: feed the parser a sequence of
// stdin chunks, threading the `pending` buffer between calls just like
// `startInputLoop` does in production.

function streamParse(chunks: Buffer[]): { names: string[]; pendingLength: number } {
  let pending: Buffer = Buffer.alloc(0);
  const names: string[] = [];
  for (const chunk of chunks) {
    const combined: Buffer = pending.length > 0 ? Buffer.concat([pending, chunk]) : chunk;
    const result = parseKeyEventBuffer(combined);
    pending = result.pending;
    for (const event of result.events) names.push(event.name);
  }
  return { names, pendingLength: pending.length };
}

section("SGR mouse — atomic sequence in one chunk");

{
  // \x1b[<64;1;1M is a scroll-up event. Should produce one `pageup`.
  const data = Buffer.from("\x1b[<64;1;1M", "ascii");
  const events = parseKeyEvents(data);
  assertEq(events.map((e) => e.name), ["pageup"], "scroll-up maps to pageup");
}

{
  const data = Buffer.from("\x1b[<65;1;1M", "ascii");
  const events = parseKeyEvents(data);
  assertEq(events.map((e) => e.name), ["pagedown"], "scroll-down maps to pagedown");
}

{
  // Click press/release (Cb=0, suffix M then m). Both are dropped silently.
  const data = Buffer.from("\x1b[<0;10;10M\x1b[<0;10;10m", "ascii");
  const events = parseKeyEvents(data);
  assertEq(events.map((e) => e.name), [], "click press+release produce no key events");
}

section("SGR mouse — sequence split across reads");

{
  // The regression: mouse event split into two stdin chunks. The
  // partial first chunk used to be dropped as `skip 3 bytes`, leaking
  // the residue `0;10;10M` as printable keystrokes into the editor.
  const r = streamParse([
    Buffer.from("\x1b[<0;1", "ascii"),
    Buffer.from("0;10M", "ascii"),
  ]);
  assertEq(r.names, [], "split mouse event produces no junk keystrokes");
  assertEq(r.pendingLength, 0, "buffer is fully consumed after the second chunk");
}

{
  // Worst-case split: `ESC` alone in chunk 1, rest in chunk 2.
  const r = streamParse([
    Buffer.from("\x1b", "ascii"),
    Buffer.from("[<64;1;1M", "ascii"),
  ]);
  assertEq(r.names, ["pageup"], "ESC-only first chunk holds for the rest");
}

{
  // `ESC [` in chunk 1, third byte arrives later.
  const r = streamParse([
    Buffer.from("\x1b[", "ascii"),
    Buffer.from("A", "ascii"),
  ]);
  assertEq(r.names, ["up"], "ESC[ alone is buffered, completes as arrow key");
}

{
  // Three-way split — fully exercises the streaming buffer.
  const r = streamParse([
    Buffer.from("\x1b[", "ascii"),
    Buffer.from("<65;1", "ascii"),
    Buffer.from(";1M", "ascii"),
  ]);
  assertEq(r.names, ["pagedown"], "three-way split assembles correctly");
}

section("SGR mouse — runaway sequence guard");

{
  // Unterminated `\x1b[<` followed by 300 digits — should not consume
  // unbounded memory. Defensive cap kicks in and the parser moves on.
  const flood = "\x1b[<" + "1".repeat(300);
  const { pending } = parseKeyEventBuffer(Buffer.from(flood, "ascii"));
  assert(pending.length === 0, "runaway sequence triggers the 256-byte guard");
}

section("standalone escape vs sequence");

{
  // Bare Escape (no following bytes for a while) should still emit
  // `escape` — but ONLY once it's clear no `[` follows.
  const first = parseKeyEventBuffer(Buffer.from("\x1b", "ascii"));
  assertEq(first.events.map((e) => e.name), [], "lone ESC at end of chunk is buffered");
  assertEq(first.pending.length, 1, "buffered ESC sits in pending");

  // If the next chunk is something OTHER than `[`, we emit Escape and
  // then process the following byte normally.
  const r = streamParse([Buffer.from("\x1b", "ascii"), Buffer.from("a", "ascii")]);
  assertEq(r.names, ["escape", "a"], "ESC + non-[ resolves to Escape + the next key");
}

section("arrows and PgUp/PgDn still work");

{
  const events = parseKeyEvents(Buffer.from("\x1b[A\x1b[B\x1b[C\x1b[D\x1b[5~\x1b[6~", "ascii"));
  assertEq(
    events.map((e) => e.name),
    ["up", "down", "right", "left", "pageup", "pagedown"],
    "arrow keys + page up/down still parse correctly",
  );
}

console.log(`\n${"─".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else console.log("All tests passed!");
