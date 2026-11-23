import dgram from "node:dgram";
import { blackCommand, controlCommand, decodeOscPacket } from "./osc-listen.mjs";

function oscPad(buffer) {
  const extra = (4 - (buffer.length % 4)) % 4;
  return extra ? Buffer.concat([buffer, Buffer.alloc(extra)]) : buffer;
}

function oscString(value) {
  return oscPad(Buffer.from(`${value}\0`, "utf8"));
}

function oscPacket(address, args) {
  const parts = [oscString(address), oscString(`,${args.map((arg) => arg.type).join("")}`)];
  for (const arg of args) {
    if (arg.type === "s") parts.push(oscString(String(arg.value)));
    else if (arg.type === "f") {
      const buf = Buffer.alloc(4);
      buf.writeFloatBE(Number(arg.value) || 0, 0);
      parts.push(buf);
    }
  }
  return Buffer.concat(parts);
}

function cleanHost(value) {
  const host = String(value ?? "").trim();
  if (!host) return "";
  if (host.length > 253 || /[\s/\\]/.test(host)) return null;
  return host;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 8000) {
        reject(new Error("too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8").trim();
      if (!text) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function reply(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

export function createOsc(station) {
  const address = `/${station}`;
  let host = cleanHost(process.env.OSC_HOST || "") ?? "";
  let port = Math.round(Number(process.env.OSC_PORT || 8000));
  if (!Number.isFinite(port) || port < 1 || port > 65535) port = 8000;
  const listenFallback = { dvc: 9030, ess: 9031, mmpa: 9032, fda: 9033 }[station] || 9030;
  let listenPort = Math.round(Number(process.env.OSC_IN_PORT || listenFallback));
  if (!Number.isFinite(listenPort) || listenPort < 1 || listenPort > 65535) listenPort = listenFallback;
  let socket = null;
  let last = null;
  let stateKey = "";
  let black = false;
  let listenError = "";
  let onBlack = () => {};
  let onControl = () => {};
  let listening = false;
  const controlGap = new Map();
  const controlHeld = new Map();

  function view() {
    return {
      host,
      port,
      enabled: Boolean(host),
      address,
      last,
      listenPort,
      listenAddress: `/${station}/black`,
      black,
      listenError,
    };
  }

  function applyBlack(next) {
    const want = Boolean(next);
    const changed = want !== black;
    black = want;
    onBlack(black);
    if (changed) console.log(`black ${black ? "on" : "off"} · /${station}/black`);
    return view();
  }

  function configure(body) {
    const rejected = [];
    if (typeof body?.host === "string") {
      const next = cleanHost(body.host);
      if (next == null) rejected.push("host");
      else host = next;
    }
    if (body?.port != null && body.port !== "") {
      const value = Math.round(Number(body.port));
      if (!Number.isFinite(value) || value < 1 || value > 65535) rejected.push("port");
      else port = value;
    }
    return { ...view(), rejected };
  }

  function transmit(kind, text, value) {
    const message = String(text || "").slice(0, 180);
    const amount = Number(value);
    const number = Number.isFinite(amount) ? Math.round(amount * 1000) / 1000 : 0;
    last = { at: Date.now(), address, kind, text: message, value: number, sent: Boolean(host) };
    if (!host) return last;
    if (!socket) {
      socket = dgram.createSocket("udp4");
      socket.on("error", (error) => console.error(`OSC ${error.message}`));
    }
    const packet = oscPacket(address, [
      { type: "s", value: kind },
      { type: "s", value: message },
      { type: "f", value: number },
    ]);
    socket.send(packet, port, host, (error) => {
      if (error) console.error(`OSC ${address} ${error.message}`);
    });
    console.log(`osc ${address} ${kind} ${message} ${number}`);
    return last;
  }

  function emit(body) {
    const kind = body?.kind === "clear" ? "clear" : "state";
    const text = String(body?.text || "");
    const amount = Number(body?.value);
    const number = Number.isFinite(amount) ? Math.round(amount * 1000) / 1000 : 0;
    if (kind !== "clear") {
      const key = `${text}|${number}`;
      if (key === stateKey) return last;
      stateKey = key;
    }
    return transmit(kind, text, number);
  }

  function controlEdge(action, down, latched) {
    if (!latched) {
      if (!down) return false;
      const now = Date.now();
      if (now - (controlGap.get(action) || 0) < 400) return false;
      controlGap.set(action, now);
      return true;
    }
    const was = controlHeld.get(action) === true;
    controlHeld.set(action, down);
    if (!down || was) return false;
    const now = Date.now();
    if (now - (controlGap.get(action) || 0) < 400) return false;
    controlGap.set(action, now);
    return true;
  }

  function listen(handler, control) {
    if (typeof handler === "function") onBlack = handler;
    if (typeof control === "function") onControl = control;
    if (listening) return;
    listening = true;
    const inbound = dgram.createSocket("udp4");
    inbound.on("error", (error) => {
      listenError = error.message;
      console.error(`OSC in ${error.message}`);
    });
    inbound.on("message", (data) => {
      let messages = [];
      try {
        messages = decodeOscPacket(data);
      } catch {
        return;
      }
      for (const message of messages) {
        const next = blackCommand(station, message);
        if (next != null) applyBlack(next);
        const run = controlCommand(station, message);
        if (!run || !controlEdge(run.action, run.down, run.latched)) continue;
        console.log(`osc in /${station}/${run.action}`);
        onControl(run.action);
      }
    });
    inbound.bind(listenPort, "0.0.0.0", () => {
      listenError = "";
      console.log(`OSC in udp://0.0.0.0:${listenPort} · /${station}/black /${station}/start /${station}/reset /${station}/restart`);
    });
  }

  return {
    view,
    configure,
    emit,
    listen,
    setBlack: applyBlack,
    where: () => (host ? `${host}:${port}` : "off"),
  };
}

export async function handleOsc(req, res, pathname, osc) {
  if (pathname !== "/api/osc" && pathname !== "/api/osc/event" && pathname !== "/api/black") return false;
  try {
    if (pathname === "/api/black" && req.method === "GET") {
      const row = osc.view();
      reply(res, 200, { black: row.black, listenPort: row.listenPort, listenAddress: row.listenAddress });
      return true;
    }
    if (pathname === "/api/black" && req.method === "POST") {
      const body = await readJson(req);
      reply(res, 200, osc.setBlack(Boolean(body?.black)));
      return true;
    }
    if (pathname === "/api/osc" && req.method === "GET") {
      reply(res, 200, osc.view());
      return true;
    }
    if (pathname === "/api/osc" && req.method === "POST") {
      reply(res, 200, osc.configure(await readJson(req)));
      return true;
    }
    if (pathname === "/api/osc/event" && req.method === "POST") {
      const sent = osc.emit(await readJson(req));
      reply(res, 200, { ok: true, last: sent });
      return true;
    }
    reply(res, 405, { error: "method" });
  } catch {
    if (!res.headersSent) reply(res, 400, { error: "bad json" });
  }
  return true;
}
