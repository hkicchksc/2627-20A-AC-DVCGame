/** Decode one OSC 1.0 packet and decide the blackout command. */

function readString(buffer, offset, end) {
  if (offset >= end) return null;
  let cursor = offset;
  while (cursor < end && buffer[cursor] !== 0) cursor += 1;
  if (cursor >= end) return null;
  const text = buffer.toString("utf8", offset, cursor);
  const next = (cursor + 4) & ~3;
  if (next > end) return null;
  return { text, offset: next };
}

function readNumber(buffer, offset, end, size, read) {
  if (offset + size > end) return null;
  return { value: read.call(buffer, offset), offset: offset + size };
}

function readMessage(buffer, start, end) {
  const address = readString(buffer, start, end);
  if (!address || !address.text.startsWith("/")) return null;
  const args = [];
  if (address.offset >= end || buffer[address.offset] !== 44) return { address: address.text, args };
  const tags = readString(buffer, address.offset, end);
  if (!tags || !tags.text.startsWith(",")) return null;
  let offset = tags.offset;
  for (const tag of tags.text.slice(1)) {
    if (tag === "i") {
      const value = readNumber(buffer, offset, end, 4, buffer.readInt32BE);
      if (!value) return null;
      args.push(value.value);
      offset = value.offset;
    } else if (tag === "f") {
      const value = readNumber(buffer, offset, end, 4, buffer.readFloatBE);
      if (!value) return null;
      args.push(value.value);
      offset = value.offset;
    } else if (tag === "d") {
      const value = readNumber(buffer, offset, end, 8, buffer.readDoubleBE);
      if (!value) return null;
      args.push(value.value);
      offset = value.offset;
    } else if (tag === "s") {
      const value = readString(buffer, offset, end);
      if (!value) return null;
      args.push(value.text);
      offset = value.offset;
    } else if (tag === "T" || tag === "I") {
      args.push(true);
    } else if (tag === "F") {
      args.push(false);
    } else if (tag === "N") {
      args.push(null);
    } else {
      return null;
    }
  }
  return { address: address.text, args };
}

function readPacket(buffer, start, end) {
  if (end - start >= 8 && buffer.toString("ascii", start, start + 8) === "#bundle\0") {
    const messages = [];
    let offset = start + 16;
    while (offset + 4 <= end) {
      const size = buffer.readInt32BE(offset);
      offset += 4;
      if (size < 0 || offset + size > end) break;
      messages.push(...readPacket(buffer, offset, offset + size));
      offset += size;
    }
    return messages;
  }
  const message = readMessage(buffer, start, end);
  return message ? [message] : [];
}

export function decodeOscPacket(data) {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  return readPacket(buffer, 0, buffer.length);
}

export function blackCommand(station, message) {
  const address = String(message?.address || "").replace(/\/+$/, "").toLowerCase();
  const own = `/${String(station || "").toLowerCase()}/black`;
  if (address !== own && address !== "/black" && address !== "/game/black") return null;
  const args = Array.isArray(message?.args) ? message.args : [];
  if (!args.length) return true;
  const value = args[0];
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    if (!text || text === "on" || text === "black" || text === "true") return true;
    if (text === "0" || text === "off" || text === "false") return false;
    const number = Number(text);
    if (Number.isFinite(number)) return number > 0;
    return true;
  }
  return true;
}
