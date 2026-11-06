// WebSocket client for the Central server at ws://localhost:8787.
// This page connects out. Central does not connect in.
function createCentralClient(station) {
  const fromQuery = new URLSearchParams(location.search).get("central");
  const host = location.hostname;
  const url = fromQuery
    || (host && host !== "localhost" && host !== "127.0.0.1" ? `ws://${host}:8787` : "ws://localhost:8787");
  let socket = null;
  let closed = false;
  let latest = null;
  let lastKey = "";
  let lastSent = 0;

  function send(message) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ role: "station", station, ...message }));
    }
  }

  function connect() {
    if (closed) return;
    try {
      socket = new WebSocket(url);
    } catch (error) {
      console.warn(`[${station}] central client failed`, error);
      setTimeout(connect, 1500);
      return;
    }
    socket.addEventListener("open", () => {
      console.info(`[${station}] central client connected ${url}`);
      lastSent = 0;
      send(latest || { type: "status", phase: "idle", score: 0, update: "Connected", summary: "Connected", detail: {} });
    });
    socket.addEventListener("close", () => {
      socket = null;
      lastSent = 0;
      setTimeout(connect, 1500);
    });
    socket.addEventListener("error", () => {});
  }

  function asScore(value) {
    const score = Number(value);
    return Number.isFinite(score) ? score : 0;
  }

  function status(fields) {
    const update = String(fields.update || fields.summary || "");
    const message = {
      type: "status",
      phase: fields.phase || "idle",
      score: asScore(fields.score),
      update,
      summary: String(fields.summary || update),
      detail: fields.detail && typeof fields.detail === "object" ? fields.detail : {},
    };
    latest = message;
    const key = JSON.stringify(message);
    const now = performance.now();
    if (key === lastKey && now - lastSent < 1000) return;
    lastKey = key;
    lastSent = now;
    send(message);
  }

  connect();

  return {
    url,
    status,
    signal(fields) {
      const update = String(fields.update || fields.summary || "");
      send({
        type: "signal",
        reason: fields.reason || "signal",
        phase: fields.phase || "live",
        score: asScore(fields.score),
        update,
        summary: String(fields.summary || update),
        detail: fields.detail && typeof fields.detail === "object" ? fields.detail : {},
      });
      lastKey = "";
      status(fields);
    },
  };
}
