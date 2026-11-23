function createRemoteBus(role) {
  const listeners = new Set();
  let socket = null;
  let closed = false;
  const bus = {
    postMessage(message) {
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      if (socket.bufferedAmount > 500000) return;
      socket.send(JSON.stringify(message));
    },
    set onmessage(fn) {
      listeners.clear();
      if (fn) listeners.add(fn);
    },
  };

  function connect() {
    if (closed) return;
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    try {
      socket = new WebSocket(`${proto}//${location.host}/remote`);
    } catch (error) {
      setTimeout(connect, 1000);
      return;
    }
    socket.addEventListener("message", (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch (error) { return; }
      if (!msg || msg.from === role) return;
      const wrapped = { data: msg };
      for (const listener of listeners) listener(wrapped);
    });
    socket.addEventListener("close", () => {
      socket = null;
      if (!closed) setTimeout(connect, 1000);
    });
    socket.addEventListener("error", () => {});
  }

  connect();
  window.addEventListener("pagehide", () => {
    closed = true;
    socket?.close();
  });
  return bus;
}

window.createRemoteBus = createRemoteBus;
