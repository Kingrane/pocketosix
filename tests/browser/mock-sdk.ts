import type { BrowserContext } from "@playwright/test";

export const MOCK_SDK_URL = "https://cxrtnc.leaningtech.com/1.4.0/cx.esm.js";

export type MockGuestWindow = {
  containerId: number; windowId: number; title: string; className: string;
  hidden: boolean; floating: boolean; focused: boolean;
};

export type MockSDKState = {
  boots: number;
  creates: number;
  deletes: number;
  resets: number;
  resetIds: string[];
  rootOverlayId: string | null;
  webPath: string | null;
  events: string[];
  consoleInput: number[];
  consoleSize: { columns: number; rows: number } | null;
  mounts: { type: string; path: string }[] | null;
  init: { filename: string; args: string[]; options: { uid: number; gid: number } } | null;
  kmsBindings: number;
  kmsClicks: number;
  kmsKeys: string[];
  kmsKeyUps: string[];
  guestRuns: { filename: string; args: string[]; options: { uid: number; gid: number; cwd?: string } }[];
  guestProbes: number;
  guestTrees: number;
  guestAcks: number;
  guestAckStatuses: number[];
  guestWindows: MockGuestWindow[];
  pendingGuestWindows: MockGuestWindow[];
  subscriberStarts: number;
  activeSubscribers: number;
  maxSubscribers: number;
  stopTokens: string[];
};

export type MockSDKControl = { revealWindows: () => void; confirmFloating: () => void; finishCloses: () => void };
type MockSDKOptions = {
  blackFrame?: boolean; loginUrl?: string; nativeKms?: boolean;
  probeFailure?: boolean; missingApps?: string[]; delayedWindow?: boolean;
  delayedFloating?: boolean; ackFailure?: "launch" | "window"; highBitIds?: boolean; delayedClose?: boolean;
};

// This fixture exists ONLY in Playwright's network interception. It tests the
// React/controller contract, not Linux. Production always imports the real SDK.
const SOURCE = String.raw`
const guestOptions = /* GUEST_OPTIONS */;
window.__pocketTest = { boots: 0, creates: 0, deletes: 0, resets: 0, resetIds: [], rootOverlayId: null, webPath: null, events: [], consoleInput: [], consoleSize: null, mounts: null, init: null, kmsBindings: 0, kmsClicks: 0, kmsKeys: [], kmsKeyUps: [], guestRuns: [], guestProbes: 0, guestTrees: 0, guestAcks: 0, guestAckStatuses: [], subscriberStarts: 0, activeSubscribers: 0, maxSubscribers: 0, stopTokens: [], pendingGuestWindows: [], guestWindows: [
  { containerId: 101, windowId: 501, title: 'Test terminal', className: 'XTerm', hidden: false, floating: false, focused: true },
  { containerId: 102, windowId: 502, title: 'Test terminal', className: 'XTerm', hidden: false, floating: false, focused: false },
  { containerId: 103, windowId: 503, title: 'Already floating', className: 'FixtureApp', hidden: false, floating: true, focused: false }
] };
class Device {
  constructor(id = null) { this.id = id; }
  delete() {}
  async reset() {
    window.__pocketTest.resets++;
    window.__pocketTest.resetIds.push(this.id);
    window.__pocketTest.events.push('reset:' + this.id);
  }
}
export const CloudDevice = { create: async () => new Device() };
export const HttpBytesDevice = CloudDevice;
export const IDBDevice = { create: async id => new Device(id) };
export const WebDevice = { create: async path => { window.__pocketTest.webPath = path; return new Device(); } };
export const OverlayDevice = { create: async (base, overlay) => new Device(overlay.id) };
export const Linux = { create: async options => {
  window.__pocketTest.creates++;
  window.__pocketTest.mounts = options.mounts.map(m => ({type:m.type,path:m.path}));
  window.__pocketTest.rootOverlayId = options.mounts.find(m => m.path === '/').dev.id;
  let activate, consoleWrite, kmsInput, kmsCanvas, kmsClick;
  let subscriber = null;
  const closing = new Set();
  let nextWindow = 504;
  const state = window.__pocketTest;
  if (guestOptions.highBitIds) state.guestWindows[0].containerId = 2937926608;
  const emit = text => consoleWrite(new TextEncoder().encode(text + '\n'), 0);
  const protocol = message => emit('[pocketosix-guest]' + JSON.stringify(message));
  const floatWindow = window => {
    if (subscriber && !window.hidden && !window.floating) {
      subscriber.saved.add(window.containerId + ':' + window.windowId);
      window.floating = true;
    }
  };
  const revealWindows = () => {
    for (const window of state.pendingGuestWindows.splice(0)) { floatWindow(window); state.guestWindows.push(window); }
  };
  const confirmFloating = () => {
    if (!subscriber || subscriber.confirmed) return;
    subscriber.confirmed = true;
    state.guestWindows.forEach(floatWindow);
    protocol({ operation: 'floating', state: 'enabled', token: subscriber.token, changed: subscriber.saved.size });
  };
  window.__pocketGuestControl = { revealWindows, confirmFloating, finishCloses: () => {
    state.guestWindows = state.guestWindows.filter(window => !closing.has(window.windowId));
    closing.clear();
  } };
  const tree = () => {
    const node = window => ({ type: 'con', id: window.containerId, window: window.windowId, name: window.title,
      window_properties: { class: window.className }, focused: window.focused,
      floating: window.floating ? 'user_on' : 'user_off', scratchpad_state: window.hidden ? 'changed' : 'none',
      rect: { x: 40, y: 60, width: 640, height: 420 }, nodes: [], floating_nodes: [] });
    return { type: 'root', nodes: [
      { type: 'workspace', name: '1', nodes: state.guestWindows.filter(window => !window.hidden && !window.floating).map(node), floating_nodes: state.guestWindows.filter(window => !window.hidden && window.floating).map(node) },
      { type: 'workspace', name: '__i3_scratch', nodes: [], floating_nodes: state.guestWindows.filter(window => window.hidden).map(node) }
    ], floating_nodes: [] };
  };
  // i3-msg 4.21.1 exits 2 for rejected COMMAND replies; send_tick is not COMMAND.
  const ack = (success, command = true) => {
    const status = command && !success ? 2 : 0;
    const reply = { success, ...(success ? {} : { error: 'Test-only i3 command rejection' }) };
    state.guestAcks++; state.guestAckStatuses.push(status);
    emit(JSON.stringify(command ? [reply] : reply));
    return Promise.resolve({ status });
  };
  return {
    delete() { window.__pocketTest.deletes++; },
    registerCallback() {}, unregisterCallback() {},
    setCustomConsole(fn, columns, rows) {
      consoleWrite = fn;
      window.__pocketTest.consoleSize = { columns, rows };
      return keyCode => window.__pocketTest.consoleInput.push(keyCode);
    },
    setActivateConsole(fn) { activate = fn; },
    setKmsCanvas(canvas, width, height) {
      /* NATIVE_KMS */
      canvas.width=width; canvas.height=height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle='#123e37'; ctx.fillRect(0,0,width,height);
      ctx.fillStyle='#b8db86'; ctx.fillRect(0,0,width/2,height/2);
    },
    networkLogin() { options.networkInterface.loginUrlCb('https://login.tailscale.com/a/test'); },
    run(filename, args, options) {
      if (filename === '/sbin/init') {
        state.boots++;
        state.init = { filename, args, options };
        state.events.push('run:' + filename);
        consoleWrite(new TextEncoder().encode('[test fixture] init started\n'), 1);
        queueMicrotask(() => activate(7));
        return new Promise(() => {});
      }
      state.guestRuns.push({ filename, args, options });
      if (filename === '/bin/sh' && args[2] === 'pocketosix-guest-probe') {
        state.guestProbes++;
        const requestId = args.at(-1);
        protocol(guestOptions.probeFailure ? { operation: 'probe', requestId, state: 'error', error: 'Guest desktop probe failed' } : {
          operation: 'probe', requestId, state: 'ready', user: 'test-user',
          session: { uid: 1000, gid: 1000, socketPath: '/tmp/i3-test/ipc-socket.7' },
          apps: ['launcher', 'terminal', 'files', 'lightweight-files', 'windows'].filter(app => !(guestOptions.missingApps || []).includes(app))
        });
        return Promise.resolve({ status: guestOptions.probeFailure ? 1 : 0 });
      }
      if (filename === '/usr/bin/python3' && args[0] === '-B' && args[1] === '-c' && args[2].includes('[pocketosix-tree:')) {
        state.guestTrees++;
        emit('[pocketosix-tree:' + args[3] + ']' + JSON.stringify(tree()));
        return Promise.resolve({ status: 0 });
      }
      if (filename === '/usr/bin/python3' && args[2].includes('pocketosix-window-control:')) {
        const targets = JSON.parse(args[4]);
        for (const [containerId, windowId] of targets) {
          const window = state.guestWindows.find(window => window.containerId === containerId && window.windowId === windowId);
          if (!window || guestOptions.ackFailure === 'window') return ack(false);
          if (args[5] === 'kill') {
            if (guestOptions.delayedClose) closing.add(window.windowId);
            else state.guestWindows = state.guestWindows.filter(candidate => candidate !== window);
          }
          else if (args[5] === 'move scratchpad') window.hidden = true;
          else if (args[5] === 'scratchpad show') window.hidden = !window.hidden;
          else window.floating = args[5] === 'floating enable';
        }
        return ack(true);
      }
      if (filename === '/usr/bin/python3' && args.at(-1).startsWith('pocketosix-floating-stop:')) {
        state.subscriberStarts++; state.activeSubscribers++;
        state.maxSubscribers = Math.max(state.maxSubscribers, state.activeSubscribers);
        return new Promise(resolve => {
          subscriber = { token: args.at(-1), saved: new Set(), resolve, confirmed: false };
          if (!guestOptions.delayedFloating) queueMicrotask(confirmFloating);
        });
      }
      if (filename === '/usr/bin/i3-msg') {
        if (args.includes('send_tick')) {
          const token = args.at(-1);
          state.stopTokens.push(token);
          if (!subscriber || subscriber.token !== token) return ack(false, false);
          for (const window of state.guestWindows) {
            if (subscriber.saved.has(window.containerId + ':' + window.windowId) && !window.hidden && window.floating) window.floating = false;
          }
          protocol({ operation: 'floating', state: 'disabled', token, restoreFailures: 0 });
          state.activeSubscribers--;
          subscriber.resolve({ status: 0 }); subscriber = null;
          return ack(true, false);
        }
        const command = args.at(-1);
        if (command.startsWith('exec --no-startup-id ')) {
          if (guestOptions.ackFailure === 'launch') return ack(false);
          const className = command.includes('/xterm') ? 'XTerm' : command.includes('/thunar') ? 'Thunar' : command.includes('/pcmanfm') ? 'Pcmanfm' : command.includes('/rofi') ? 'Rofi' : null;
          if (!className) return ack(false);
          state.guestWindows.forEach(window => { window.focused = false; });
          const window = { containerId: nextWindow + 1000, windowId: nextWindow++, title: 'Launched ' + className, className, hidden: false, floating: false, focused: true };
          state.pendingGuestWindows.push(window);
          if (!guestOptions.delayedWindow) revealWindows();
          return ack(true);
        }
        const match = command.match(/^\[con_id=(\d+) id=(\d+)\] (kill|move scratchpad|scratchpad show|floating enable|floating disable)$/);
        if (!match || guestOptions.ackFailure === 'window') return ack(false);
        if ([match[1], match[2]].some(value => Number(value) >= 2147483647)) return ack(false);
        const window = state.guestWindows.find(window => window.containerId === Number(match[1]) && window.windowId === Number(match[2]));
        if (!window) return ack(false);
        if (match[3] === 'kill') {
          if (guestOptions.delayedClose) closing.add(window.windowId);
          else state.guestWindows = state.guestWindows.filter(candidate => candidate !== window);
        }
        else if (match[3] === 'move scratchpad') window.hidden = true;
        else if (match[3] === 'scratchpad show') window.hidden = !window.hidden;
        else window.floating = match[3] === 'floating enable';
        return ack(true);
      }
      emit('[test fixture] unsupported guest command');
      return Promise.resolve({ status: 127 });
    }
  };
} };
`;

export async function mockSDK(context: BrowserContext, options: MockSDKOptions = {}) {
  let source = SOURCE.replace("/* GUEST_OPTIONS */", JSON.stringify(options));
  // A diagnostic DOM fixture matching the inspected 1.4.0 input ownership.
  // Keys are recorded by a listener, never executed as a guest command.
  if (options.nativeKms) source = source.replace("/* NATIVE_KMS */", `
      if (kmsInput) document.body.removeChild(kmsInput);
      if (kmsCanvas && kmsClick) kmsCanvas.removeEventListener('click', kmsClick);
      kmsInput = document.createElement('textarea');
      kmsInput.style.position = 'fixed'; kmsInput.style.opacity = '0';
      kmsInput.setAttribute('autocapitalize', 'off');
      kmsInput.setAttribute('aria-label', 'Test-only native KMS input');
      kmsInput.addEventListener('keydown', event => {
        window.__pocketTest.kmsKeys.push(event.key);
        event.preventDefault();
      });
      kmsInput.addEventListener('keyup', event => {
        window.__pocketTest.kmsKeyUps.push(event.key);
        event.preventDefault();
      });
      document.body.appendChild(kmsInput);
      window.__pocketTest.kmsBindings++;
      kmsCanvas = canvas;
      kmsClick = event => {
        window.__pocketTest.kmsClicks++;
        kmsInput.style.left = event.clientX + 'px';
        kmsInput.style.top = event.clientY + 'px';
        kmsInput.focus();
      };
      canvas.addEventListener('click', kmsClick);
  `);
  if (options.blackFrame) source = source.replace("ctx.fillStyle='#123e37'", "ctx.fillStyle='#000000'").replace("ctx.fillStyle='#b8db86'; ctx.fillRect(0,0,width/2,height/2);", "");
  if (options.loginUrl) source = source.replace("https://login.tailscale.com/a/test", options.loginUrl);
  await context.route(MOCK_SDK_URL, (route) => route.fulfill({
    status: 200, contentType: "application/javascript", body: source,
    headers: { "Access-Control-Allow-Origin": "*", "Cross-Origin-Resource-Policy": "cross-origin" },
  }));
}
