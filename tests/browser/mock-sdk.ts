import type { BrowserContext } from "@playwright/test";

export const MOCK_SDK_URL = "https://cxrtnc.leaningtech.com/1.4.0/cx.esm.js";

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
};

// This fixture exists ONLY in Playwright's network interception. It tests the
// React/controller contract, not Linux. Production always imports the real SDK.
const SOURCE = `
window.__pocketTest = { boots: 0, creates: 0, deletes: 0, resets: 0, resetIds: [], rootOverlayId: null, events: [], consoleInput: [], consoleSize: null, mounts: null, init: null, kmsBindings: 0, kmsClicks: 0, kmsKeys: [] };
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
      window.__pocketTest.boots++;
      window.__pocketTest.init = { filename, args, options };
      window.__pocketTest.events.push('run:' + filename);
      consoleWrite(new TextEncoder().encode('[test fixture] init started\\n'),1);
      queueMicrotask(() => activate(7));
      return new Promise(() => {});
    }
  };
} };
`;

export async function mockSDK(context: BrowserContext, options: { blackFrame?: boolean; loginUrl?: string; nativeKms?: boolean } = {}) {
  let source = SOURCE;
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
