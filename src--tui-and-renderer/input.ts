export interface KeyEvent {
  name: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  raw: Buffer;
}

export type KeyHandler = (key: KeyEvent) => void;

export function startInputLoop(handler: KeyHandler): () => void {
  const onData = (data: Buffer) => {
    const events = parseKeyEvents(data);
    for (const event of events) {
      handler(event);
    }
  };

  process.stdin.on("data", onData);
  return () => process.stdin.off("data", onData);
}

function parseKeyEvents(data: Buffer): KeyEvent[] {
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
      if (offset + 2 < data.length && data[offset + 1] === 0x5b) {
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
        if (offset + 3 < data.length && data[offset + 3] === 0x7e) {
          if (seq === 0x35) { events.push(key("pageup", data)); offset += 4; continue; }
          if (seq === 0x36) { events.push(key("pagedown", data)); offset += 4; continue; }
          if (seq === 0x33) { events.push(key("delete", data)); offset += 4; continue; }
          offset += 4;
          continue;
        }

        // Unknown escape sequence -- skip 3 bytes
        offset += 3;
        continue;
      }

      // Standalone escape (no following bracket in buffer)
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
      events.push(key(char, data));
      offset += 1;
      continue;
    }

    // UTF-8 multi-byte or unknown -- skip
    offset += 1;
  }

  return events;
}

function key(name: string, raw: Buffer, ctrl = false): KeyEvent {
  return {
    name,
    ctrl,
    meta: false,
    shift: /^[A-Z]$/.test(name),
    raw,
  };
}
