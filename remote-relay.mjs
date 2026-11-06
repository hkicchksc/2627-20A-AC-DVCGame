import crypto from "node:crypto";
import os from "node:os";

export function lanAddresses() {
  const found = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const entry of list || []) {
      if (entry.family === "IPv4" && !entry.internal) found.push(entry.address);
    }
  }
  return found;
}

function acceptKey(key) {
  return crypto.createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
}

function sendFrame(socket, opcode, payload) {
  if (socket.destroyed) return;
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const len = data.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | opcode;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  socket.write(header);
  if (len) socket.write(data);
}

export function attachRemoteRelay() {
  const clients = new Set();

  function relay(from, payload) {
    for (const client of clients) {
      if (client === from || client.destroyed) continue;
      if (client.writableLength > 1_000_000) continue;
      sendFrame(client, 0x1, payload);
    }
  }

  function consume(client) {
    let buf = client.buf;
    while (buf.length >= 2) {
      const fin = (buf[0] & 0x80) !== 0;
      const opcode = buf[0] & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f;
      let offset = 2;
      if (len === 126) {
        if (buf.length < 4) break;
        len = buf.readUInt16BE(2);
        offset = 4;
      } else if (len === 127) {
        if (buf.length < 10) break;
        const big = buf.readBigUInt64BE(2);
        if (big > 8_000_000n) {
          client.destroy();
          return;
        }
        len = Number(big);
        offset = 10;
      }
      if (len > 8_000_000) {
        client.destroy();
        return;
      }
      const maskLen = masked ? 4 : 0;
      if (buf.length < offset + maskLen + len) break;
      const payload = Buffer.from(buf.subarray(offset + maskLen, offset + maskLen + len));
      if (masked) {
        const mask = buf.subarray(offset, offset + 4);
        for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i & 3];
      }
      buf = buf.subarray(offset + maskLen + len);
      if (opcode === 0x8) {
        client.buf = buf;
        sendFrame(client, 0x8, payload);
        client.end();
        return;
      }
      if (opcode === 0x9) {
        sendFrame(client, 0xa, payload);
        continue;
      }
      if (opcode === 0xa) continue;
      if (opcode === 0x1 || opcode === 0x0) {
        if (opcode === 0x1) client.fragments = [payload];
        else {
          if (!client.fragments) client.fragments = [];
          client.fragments.push(payload);
        }
        if (fin) {
          const text = Buffer.concat(client.fragments);
          client.fragments = [];
          relay(client, text);
        }
      }
    }
    client.buf = buf;
  }

  function shake(socket, key) {
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\n" +
        "Upgrade: websocket\r\n" +
        "Connection: Upgrade\r\n" +
        `Sec-WebSocket-Accept: ${acceptKey(key)}\r\n\r\n`,
    );
    socket.setNoDelay(true);
    socket.buf = Buffer.alloc(0);
    socket.fragments = [];
    clients.add(socket);
    socket.on("data", (chunk) => {
      socket.buf = socket.buf.length ? Buffer.concat([socket.buf, chunk]) : chunk;
      consume(socket);
    });
    const drop = () => clients.delete(socket);
    socket.on("close", drop);
    socket.on("end", drop);
    socket.on("error", () => socket.destroy());
  }

  return function takeRemote(req, socket) {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (url.pathname !== "/remote") return false;
    const key = req.headers["sec-websocket-key"];
    if (!key) {
      socket.destroy();
      return true;
    }
    shake(socket, key);
    return true;
  };
}
