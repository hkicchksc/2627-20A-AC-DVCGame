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
fetch("/remote-host").then((response) => response.json()).then((info) => {
  const line = document.querySelector("#remote-line");
  if (!line || !info.addresses?.length) return;
  line.textContent = info.addresses.map((address) => `http://${address}:${info.port}/backstage`).join(" · ");
}).catch(() => {});
paint();
setInterval(paint, 400);
