// shortcut: opens the first granted port that succeeds, upgrade when two allowed devices must be chosen.
// shortcut: repeat events stay flagged, movement uses the first edge only.
const pinKeys = {};
const pinMap = {};
const joystickControls = [
  ['P1 Up', 'ArrowUp'],
  ['P1 Down', 'ArrowDown'],
  ['P1 Left', 'ArrowLeft'],
  ['P1 Right', 'ArrowRight'],
  ['P1 A', ''],
  ['P1 B', ''],
  ['P1 C', ''],
  ['P1 X', ''],
  ['P1 Y', ''],
  ['P1 Z', ''],
  ['P2 Up', ''],
  ['P2 Down', ''],
  ['P2 Left', ''],
  ['P2 Right', ''],
  ['P2 A', ''],
  ['P2 B', ''],
  ['P2 C', ''],
  ['P2 X', ''],
  ['P2 Y', ''],
  ['P2 Z', ''],
  ['Share 1', ' '],
  ['Share 2', ''],
  ['Share 3', '']
];
const controlKeys = Object.fromEntries(joystickControls);

function applyPinMap() {
  for (const pin of Object.keys(pinKeys)) delete pinKeys[pin];
  for (const [pin, name] of Object.entries(pinMap)) pinKeys[pin] = controlKeys[name] || '';
}

function loadJoystickMap() {
  for (const pin of Object.keys(pinMap)) delete pinMap[pin];
  try { Object.assign(pinMap, JSON.parse(localStorage.getItem('joystick-map') || '{}')); } catch (_) { /* no saved map */ }
  applyPinMap();
}

function assignJoystickPin(pin, name) {
  for (const other of Object.keys(pinMap)) {
    if (other === pin || pinMap[other] === name) delete pinMap[other];
  }
  pinMap[pin] = name;
  try { localStorage.setItem('joystick-map', JSON.stringify(pinMap)); } catch (_) { /* private mode */ }
  applyPinMap();
}

loadJoystickMap();
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('storage', event => {
    if (event.key === 'joystick-map') loadJoystickMap();
  });
}

function readJoystickLines(state, chunk) {
  state.buffer += chunk;
  const parts = state.buffer.split(/\r?\n/);
  state.buffer = parts.pop() ?? '';
  if (state.buffer.length > 400) state.buffer = '';
  if (state.held == null) state.held = '';
  const events = [];
  for (const part of parts) {
    const text = part.trim().toUpperCase();
    if (!text) continue;
    if (text === 'NONE') {
      if (state.held) events.push({ name: 'Released', up: true });
      state.held = '';
      continue;
    }
    const pins = [];
    let bad = false;
    for (const token of text.split(',')) {
      const marked = token.trim().match(/^([A-Z])_([A-Z]\d+)$/);
      if (!marked) { bad = true; break; }
      const pin = marked[1] === 'M' ? marked[2] : marked[1] + '_' + marked[2];
      if (!pins.includes(pin)) pins.push(pin);
    }
    if (bad || !pins.length) {
      events.push({ unknown: part.trim() });
      continue;
    }
    const prev = state.held ? state.held.split(',') : [];
    state.held = pins.join(',');
    for (const pin of pins) {
      events.push({ pin, name: pinMap[pin] || pin, key: pinKeys[pin] || '', repeat: prev.includes(pin) });
    }
  }
  return events;
}

function createJoystick({ onText, onStatus }) {
  let port = null;
  let reader = null;
  let readableStreamClosed = null;
  let chain = Promise.resolve();

  function run(fn) {
    const next = chain.then(fn, fn);
    chain = next.then(() => {}, () => {});
    return next;
  }

  async function shutdown() {
    const currentReader = reader;
    const currentClosed = readableStreamClosed;
    const currentPort = port;
    reader = null;
    readableStreamClosed = null;
    port = null;
    try {
      if (currentReader) {
        await currentReader.cancel();
        currentReader.releaseLock();
      }
    } catch (_) { /* ignore */ }
    try { if (currentClosed) await currentClosed; } catch (_) { /* ignore */ }
    try { if (currentPort?.readable?.locked) await currentPort.readable.cancel(); } catch (_) { /* ignore */ }
    try { if (currentPort) await currentPort.close(); } catch (_) { /* ignore */ }
  }

  function pump(active) {
    (async () => {
      try {
        while (active === reader) {
          const { value, done } = await active.read();
          if (done || active !== reader) break;
          if (value) onText(value);
        }
      } catch (_) { /* unplug or cancel */ }
      if (active === reader) {
        await run(async () => {
          await shutdown();
          onStatus('disconnected', 'Joystick disconnected.');
        });
      }
    })();
  }

  async function start(next) {
    await shutdown();
    port = next;
    try {
      await port.open({ baudRate: 115200 });
      const textDecoder = new TextDecoderStream();
      readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
      reader = textDecoder.readable.getReader();
    } catch (error) {
      await shutdown();
      throw error;
    }
    onStatus('connected');
    pump(reader);
  }

  async function auto() {
    if (!navigator.serial) {
      onStatus('error', 'Web Serial needs Chrome or Edge on https or localhost.');
      return;
    }
    const ports = await navigator.serial.getPorts();
    for (const candidate of ports) {
      try {
        await start(candidate);
        return;
      } catch (_) { /* try the next granted port */ }
    }
    onStatus(ports.length ? 'error' : 'needs-permission', ports.length ? 'Saved joystick did not open.' : '');
  }

  function pick() {
    if (!navigator.serial) {
      onStatus('error', 'Web Serial needs Chrome or Edge on https or localhost.');
      return;
    }
    // requestPort has to start in the click, before the open is queued.
    let pending;
    try {
      pending = navigator.serial.requestPort();
    } catch (error) {
      onStatus('error', error.message || String(error));
      return;
    }
    return run(async () => {
      let next;
      try {
        next = await pending;
      } catch (error) {
        if (error.name === 'NotFoundError') {
          onStatus('needs-permission');
          return;
        }
        onStatus('error', error.message || String(error));
        return;
      }
      try {
        await start(next);
      } catch (error) {
        onStatus('error', error.message || String(error));
      }
    });
  }

  if (navigator.serial) {
    navigator.serial.addEventListener('connect', event => {
      run(() => start(event.target).catch(error => onStatus('error', error.message || String(error))));
    });
    navigator.serial.addEventListener('disconnect', () => {
      run(async () => {
        await shutdown();
        onStatus('disconnected', 'Joystick unplugged.');
      });
    });
  }

  return {
    autoConnect() { return run(auto); },
    requestPort: pick,
    disconnect() { return run(async () => { await shutdown(); onStatus('disconnected', 'Disconnected.'); }); }
  };
}

window.pinKeys = pinKeys;
window.pinMap = pinMap;
window.joystickControls = joystickControls;
window.readJoystickLines = readJoystickLines;
window.assignJoystickPin = assignJoystickPin;
window.loadJoystickMap = loadJoystickMap;
window.createJoystick = createJoystick;
