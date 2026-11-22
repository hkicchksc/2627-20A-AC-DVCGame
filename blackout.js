(function () {
  const savedMedia = new WeakMap();
  const contexts = new Set();
  const jobs = new WeakMap();
  let black = false;
  let cover = null;
  let socketAt = 0;

  function isMedia(value) {
    return typeof HTMLMediaElement !== "undefined" && value instanceof HTMLMediaElement;
  }

  function silence(el) {
    if (!isMedia(el)) return;
    if (!savedMedia.has(el)) savedMedia.set(el, { muted: el.muted, volume: el.volume });
    if (!el.muted) el.muted = true;
    if (el.volume !== 0) el.volume = 0;
  }

  function restore(el) {
    const prev = savedMedia.get(el);
    if (!prev) return;
    el.muted = prev.muted;
    el.volume = prev.volume;
    savedMedia.delete(el);
  }

  function after(ctx, fn) {
    const prev = jobs.get(ctx) || Promise.resolve();
    const next = prev.then(fn, fn);
    jobs.set(ctx, next.catch(() => {}));
  }

  function placeCover() {
    if (!cover) return;
    const parent = document.fullscreenElement || document.body || document.documentElement;
    if (cover.parentElement !== parent) parent.appendChild(cover);
  }

  function hold() {
    placeCover();
    if (cover) cover.classList.add("on");
    document.querySelectorAll("audio, video").forEach(silence);
    for (const ctx of contexts) {
      after(ctx, () => {
        if (!black || ctx.state === "closed") return;
        if (ctx.state === "running") ctx.__wantSound = true;
        return ctx.suspend();
      });
    }
  }

  function release() {
    if (cover) cover.classList.remove("on");
    document.querySelectorAll("audio, video").forEach(restore);
    for (const ctx of contexts) {
      after(ctx, () => {
        if (black || ctx.state === "closed") return;
        if (!ctx.__wantSound) return;
        ctx.__wantSound = false;
        return ctx.resume();
      });
    }
  }

  function setBlack(next, viaSocket) {
    if (viaSocket) socketAt = Date.now();
    else if (Date.now() - socketAt < 800) return;
    const want = Boolean(next);
    if (want === black) {
      if (want) hold();
      return;
    }
    black = want;
    if (black) hold();
    else release();
  }

  function watchContext(Native) {
    if (typeof Native !== "function" || Native.__blackWrap) return Native;
    function Wrapped(...args) {
      const ctx = new Native(...args);
      contexts.add(ctx);
      if (black) {
        ctx.__wantSound = true;
        ctx.suspend();
      }
      return ctx;
    }
    Wrapped.prototype = Native.prototype;
    Object.setPrototypeOf(Wrapped, Native);
    Wrapped.__blackWrap = true;
    return Wrapped;
  }

  const audioProto = window.AudioContext?.prototype || window.webkitAudioContext?.prototype;
  if (audioProto && typeof audioProto.resume === "function" && !audioProto.resume.__blackWrap) {
    const origResume = audioProto.resume;
    function resumePatched(...args) {
      if (black) {
        this.__wantSound = true;
        contexts.add(this);
        return Promise.resolve();
      }
      return origResume.apply(this, args);
    }
    resumePatched.__blackWrap = true;
    audioProto.resume = resumePatched;
  }
  if (typeof window.AudioContext === "function") window.AudioContext = watchContext(window.AudioContext);
  if (typeof window.webkitAudioContext === "function" && window.webkitAudioContext !== window.AudioContext) {
    window.webkitAudioContext = watchContext(window.webkitAudioContext);
  }

  function ensureCover() {
    if (cover) return;
    const style = document.createElement("style");
    style.textContent = "#game-blackout{position:fixed;inset:0;z-index:2147483647;display:none;background:#000;cursor:none}#game-blackout.on{display:block}";
    document.head.appendChild(style);
    cover = document.createElement("div");
    cover.id = "game-blackout";
    cover.setAttribute("aria-hidden", "true");
    (document.body || document.documentElement).appendChild(cover);
  }

  async function pull() {
    try {
      const row = await fetch("/api/black", { cache: "no-store" }).then((response) => response.json());
      if (row && typeof row.black === "boolean") setBlack(row.black, false);
    } catch {
      /* the socket still carries the cue */
    }
  }

  function connect() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    let socket;
    try {
      socket = new WebSocket(`${proto}//${location.host}/remote`);
    } catch {
      setTimeout(connect, 1000);
      return;
    }
    socket.addEventListener("message", (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (!msg || msg.type !== "black") return;
      setBlack(msg.value, true);
    });
    socket.addEventListener("close", () => setTimeout(connect, 1000));
    socket.addEventListener("error", () => {});
  }

  function boot() {
    ensureCover();
    document.addEventListener("play", (event) => {
      if (black) silence(event.target);
    }, true);
    document.addEventListener("volumechange", (event) => {
      if (black) silence(event.target);
    }, true);
    document.addEventListener("fullscreenchange", () => {
      if (black) hold();
    });
    pull();
    setInterval(pull, 400);
    connect();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
