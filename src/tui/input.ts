export interface KeyEvent {
  name: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  raw: Buffer;
}

export type KeyHandler = (key: KeyEvent) => void;

export function startInputLoop(handler: KeyHandler): () => void {
  let pending = Buffer.alloc(0) as Buffer<ArrayBufferLike>;

  const onData = (data: Buffer) => {
    const buffer = pending.length > 0 ? Buffer.concat([pending, data]) : data;
    const parsed = parseKeyEventBuffer(buffer);
    pending = parsed.pending;
    const events = parsed.events;
    for (const event of events) {
      handler(event);
    }
  };

  process.stdin.on("data", onData);
  return () => process.stdin.off("data", onData);
}

export function parseKeyEvents(data: Buffer): KeyEvent[] {
  return parseKeyEventBuffer(data).events;
}

export function parseKeyEventBuffer(data: Buffer): { events: KeyEvent[]; pending: Buffer } {
  const events: KeyEvent[] = [];
  let offset = 0;

  while (offset < data.length) {
    const byte = data[offset];

    // Ctrl+C
    if (byte === 0x03) {
      events.push(key("ctrl+c", data, true));
      offset += 1;
      continue;
    }

    // Ctrl+D
    if (byte === 0x04) {
      events.push(key("ctrl+d", data, true));
      offset += 1;
      continue;
    }

    // Tab
    if (byte === 0x09) {
      events.push(key("tab", data));
      offset += 1;
      continue;
    }

    // Enter
    if (byte === 0x0d || byte === 0x0a) {
      events.push(key("enter", data));
      offset += 1;
      continue;
    }

    // Escape sequences
    if (byte === 0x1b) {
      // ESC alone at the very end of the buffer: hold for next read in
      // case a `[` (and the rest of a CSI) is still in flight.
      if (offset + 1 >= data.length) {
        return { events, pending: data.slice(offset) };
      }

      if (data[offset + 1] === 0x5b) {
        // We see `ESC [` but the third byte hasn't arrived — buffer.
        if (offset + 2 >= data.length) {
          return { events, pending: data.slice(offset) };
        }

        const seq = data[offset + 2];

        // Arrow keys
        if (seq === 0x41) { events.push(key("up", data)); offset += 3; continue; }
        if (seq === 0x42) { events.push(key("down", data)); offset += 3; continue; }
        if (seq === 0x43) { events.push(key("right", data)); offset += 3; continue; }
        if (seq === 0x44) { events.push(key("left", data)); offset += 3; continue; }

        // Home/End
        if (seq === 0x48) { events.push(key("home", data)); offset += 3; continue; }
        if (seq === 0x46) { events.push(key("end", data)); offset += 3; continue; }

        // Extended sequences like \x1b[5~ (page up), \x1b[6~ (page down)
        if (seq === 0x35 || seq === 0x36 || seq === 0x33) {
          if (offset + 3 >= data.length) {
            return { events, pending: data.slice(offset) };
          }
          if (data[offset + 3] === 0x7e) {
            if (seq === 0x35) { events.push(key("pageup", data)); offset += 4; continue; }
            if (seq === 0x36) { events.push(key("pagedown", data)); offset += 4; continue; }
            if (seq === 0x33) { events.push(key("delete", data)); offset += 4; continue; }
          }
          // Unrecognized 4-byte CSI — drop the whole sequence safely.
          offset += 4;
          continue;
        }

        // Mouse SGR mode: \x1b[<Cb;Cx;Cy;M or m
        if (seq === 0x3c) {
          const endIdx = data.indexOf(0x4d, offset + 3); // 'M'
          const endIdxSmall = data.indexOf(0x6d, offset + 3); // 'm'
          const actualEnd =
            endIdx !== -1 && (endIdxSmall === -1 || endIdx < endIdxSmall)
              ? endIdx
              : endIdxSmall;

          // Terminator not in buffer yet: hold the whole partial sequence
          // for the next stdin read. This is the bug fix that prevents
          // mouse-event residue (digits, semicolons, `M`/`m`) from
          // leaking out as printable keystrokes into the editor.
          if (actualEnd === -1) {
            // Defensive cap: don't let an unterminated sequence consume
            // unbounded memory. If we've already buffered >256 bytes
            // without a terminator, drop it as malformed.
            if (data.length - offset > 256) {
              offset = data.length;
              continue;
            }
            return { events, pending: data.slice(offset) };
          }

          const str = data.slice(offset + 3, actualEnd).toString();
          const [cb] = str.split(";").map(Number);
          if (cb === 64) {
            events.push(key("pageup", data));
          } else if (cb === 65) {
            events.push(key("pagedown", data));
          }
          offset = actualEnd + 1;
          continue;
        }

        // Unrecognized CSI starting char — consume until we hit a final
        // byte (0x40–0x7E) so we drop the whole sequence atomically.
        let scan = offset + 3;
        while (scan < data.length) {
          const b = data[scan];
          if (b >= 0x40 && b <= 0x7e) break;
          scan++;
        }
        if (scan >= data.length) {
          // Final byte hasn't arrived — buffer (with the same defensive cap).
          if (data.length - offset > 256) {
            offset = data.length;
            continue;
          }
          return { events, pending: data.slice(offset) };
        }
        offset = scan + 1;
        continue;
      }

      // ESC followed by something other than `[` — emit standalone Escape
      // and let the next byte be processed as a normal keystroke.
      events.push(key("escape", data));
      offset += 1;
      continue;
    }

    // Backspace
    if (byte === 0x7f) {
      events.push(key("backspace", data));
      offset += 1;
      continue;
    }

    // Space
    if (byte === 0x20) {
      events.push(key("space", data));
      offset += 1;
      continue;
    }

    // Ctrl+/ or Ctrl+?
    if (byte === 0x1f) {
      events.push(key("ctrl+/", data, true));
      offset += 1;
      continue;
    }

    // Ctrl+letter (0x01-0x1a)
    if (byte >= 0x01 && byte <= 0x1a) {
      const letter = String.fromCharCode(byte + 0x60);
      events.push(key(`ctrl+${letter}`, data, true));
      offset += 1;
      continue;
    }

    // Printable ASCII
    if (byte >= 0x21 && byte <= 0x7e) {
      const char = String.fromCharCode(byte);
      events.push(key(char, data.slice(offset, offset + 1)));
      offset += 1;
      continue;
    }

    const utf8Length = utf8SequenceLength(byte);
    if (utf8Length > 1) {
      if (offset + utf8Length > data.length) {
        return { events, pending: data.slice(offset) };
      }
      const slice = data.slice(offset, offset + utf8Length);
      if (isValidUtf8Sequence(slice)) {
        events.push(key(slice.toString("utf8"), slice));
        offset += utf8Length;
        continue;
      }
    }

    // Unknown byte -- skip
    offset += 1;
  }

  return { events, pending: Buffer.alloc(0) };
}

function utf8SequenceLength(byte: number): number {
  if (byte >= 0xc2 && byte <= 0xdf) return 2;
  if (byte >= 0xe0 && byte <= 0xef) return 3;
  if (byte >= 0xf0 && byte <= 0xf4) return 4;
  return 0;
}

function isValidUtf8Sequence(bytes: Buffer): boolean {
  for (let i = 1; i < bytes.length; i++) {
    if ((bytes[i] & 0xc0) !== 0x80) return false;
  }
  return !bytes.toString("utf8").includes("\uFFFD");
}

function isShiftedKey(name: string): boolean {
  return /^[A-Z]$/.test(name) || /[~!@#$%^&*()_+{}|:"<>?]/.test(name);
}

function key(name: string, raw: Buffer, ctrl = false): KeyEvent {
  return {
    name,
    ctrl,
    meta: false,
    shift: isShiftedKey(name),
    raw,
  };
}
