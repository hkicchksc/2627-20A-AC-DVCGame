const link = document.querySelector("#link-game");
const roundEl = document.querySelector("#now-round");
const timerEl = document.querySelector("#now-timer");
const matchedEl = document.querySelector("#now-matched");
const p1El = document.querySelector("#now-p1");
const p2El = document.querySelector("#now-p2");
const noteEl = document.querySelector("#now-note");
const startBtn = document.querySelector("#btn-start");
const nextBtn = document.querySelector("#btn-next");

let stageBus = null;
try { stageBus = createRemoteBus("backstage"); } catch (error) { stageBus = null; }

let state = null;
let seenAt = 0;

function online() {
  return performance.now() - seenAt < 2500;
}

function send(action) {
  if (!online()) {
    noteEl.textContent = "Open the game view first. These controls run on that page.";
    paint();
    return;
  }
  stageBus?.postMessage({ from: "backstage", type: "command", action });
}

function paint() {
  const on = online();
  link.dataset.on = String(on);
  link.textContent = on ? "Game view connected" : "Game view offline";
  startBtn.disabled = !on;
  nextBtn.disabled = !on || !state?.started;
  if (!on || !state) {
    roundEl.textContent = "—";
    timerEl.textContent = "—";
    matchedEl.textContent = "—";
    p1El.textContent = "—";
    p2El.textContent = "—";
    if (!on) noteEl.textContent = "Open the game view first. These controls run on that page.";
    return;
  }
  roundEl.textContent = state.started ? String(state.round) : "Title";
  timerEl.textContent = state.started ? state.timer : "—";
  matchedEl.textContent = state.started ? `${state.matched}/${state.total}` : "—";
  p1El.textContent = state.p1 == null ? "—" : String(state.p1);
  p2El.textContent = state.p2 == null ? "—" : String(state.p2);
  noteEl.textContent = state.started ? "" : "The game view is on the title screen. Start sends it into the first round.";
}

if (stageBus) {
  stageBus.onmessage = (event) => {
    const msg = event.data;
    if (!msg || msg.from !== "game" || msg.type !== "state") return;
    state = msg;
    seenAt = performance.now();
    paint();
  };
}

startBtn.addEventListener("click", () => send("start"));
nextBtn.addEventListener("click", () => send("next"));

const oscForm = document.querySelector("#osc-form");
const oscHost = document.querySelector("#osc-host");
const oscPort = document.querySelector("#osc-port");
const oscLine = document.querySelector("#osc-line");
const blackBtn = document.querySelector("#btn-black");
const blackLine = document.querySelector("#black-line");
const oscWrote = { host: null, port: null };
let blackOn = false;

function paintBlack(row) {
  if (!blackLine) return;
  blackOn = Boolean(row?.black);
  const where = `UDP ${row?.listenPort || ""} ${row?.listenAddress || ""}`.trim();
  blackLine.textContent = blackOn ? `Black screen, no sound. ${where}` : `Picture on. ${where}`;
  if (blackBtn) blackBtn.textContent = blackOn ? "Restore picture" : "Black screen";
}

function oscText(row) {
  if (!row?.enabled) return "OSC off. Set a host to send /dvc.";
  if (!row.last) return `OSC ${row.host}:${row.port} · no message yet`;
  const sent = row.last.sent ? "sent" : "not sent";
  return `${sent} ${row.last.address} ${row.last.kind} · ${row.last.text} · ${row.last.value}`;
}

async function paintOsc() {
  try {
    const row = await fetch("/api/osc").then((response) => response.json());
    const host = row.host || "";
    const port = row.port == null ? "8000" : String(row.port);
    if (oscWrote.host !== host && document.activeElement !== oscHost) {
      oscWrote.host = host;
      oscHost.value = host;
    }
    if (oscWrote.port !== port && document.activeElement !== oscPort) {
      oscWrote.port = port;
      oscPort.value = port;
    }
    oscLine.textContent = oscText(row);
    paintBlack(row);
  } catch {
    oscLine.textContent = "OSC status unavailable";
  }
}

oscForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const row = await fetch("/api/osc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ host: oscHost.value.trim(), port: Number(oscPort.value) }),
  }).then((response) => response.json());
  oscWrote.host = null;
  oscWrote.port = null;
  oscLine.textContent = row.rejected?.length ? "OSC host or port was rejected." : oscText(row);
  paintBlack(row);
});
blackBtn?.addEventListener("click", async () => {
  blackBtn.disabled = true;
  try {
    const row = await fetch("/api/black", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ black: !blackOn }),
    }).then((response) => response.json());
    paintBlack(row);
  } finally {
    blackBtn.disabled = false;
  }
});
paintOsc();
setInterval(paintOsc, 1000);
fetch("/remote-host").then((response) => response.json()).then((info) => {
  const line = document.querySelector("#remote-line");
  if (!line || !info.addresses?.length) return;
  line.textContent = info.addresses.map((address) => `http://${address}:${info.port}/backstage`).join(" · ");
}).catch(() => {});
paint();
setInterval(paint, 400);
