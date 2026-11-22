import type { BrowserContext } from "@playwright/test";

// Opt-in diagnostics only: the real, unchanged SDK still comes from its CDN.
// Unlike mock-sdk, this wrapper does not simulate devices, Linux or graphics.
// It records the created instance so a failed test can read guest log files
// through the documented run() API. It is never bundled into the application.
export async function observeSDK(context: BrowserContext) {
  if (process.env.POCKETOSIX_VM_INPUT_TRACE === "1") await context.addInitScript(() => {
    const events: Record<string, unknown>[] = [];
    Object.assign(window, { __pocketInputTrace: events });
    const identity = (element: EventTarget | null) => element instanceof Element ? `${element.tagName}#${element.id}.${element.getAttribute("aria-label") ?? element.className}` : null;
    const record = (detail: Record<string, unknown>) => {
      events.push({ time: performance.now(), active: identity(document.activeElement), focused: document.hasFocus(), ...detail });
      if (events.length > 3000) events.shift();
    };
    for (const type of ["focusin", "focusout", "mousedown", "mouseup", "keydown", "keyup"]) document.addEventListener(type, event => record({ type, target: identity(event.target), code: event instanceof KeyboardEvent ? event.code : undefined }), true);
    const focus = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function(...args) {
      record({ type: "focus-call", target: identity(this), stack: new Error().stack?.split("\n").slice(2, 5) });
      return Reflect.apply(focus, this, args);
    };
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function(...args) {
      const message = args[0];
      if (message && [76, 94, 95].includes(message.type)) record({ type: "worker", message });
      return Reflect.apply(post, this, args);
    };
  });
  await context.route("https://cxrtnc.leaningtech.com/1.4.0/cx.esm.js", (route) => route.fulfill({
    contentType: "application/javascript",
    headers: { "Access-Control-Allow-Origin": "*", "Cross-Origin-Resource-Policy": "cross-origin" },
    body: `
      export * from "https://cxrtnc.leaningtech.com/1.4.0/cx.esm.js?pocketosix-diagnostics=1";
      import { Linux as RealLinux } from "https://cxrtnc.leaningtech.com/1.4.0/cx.esm.js?pocketosix-diagnostics=1";
      export const Linux = {
        async create(options) {
          const vm = await RealLinux.create(options);
          window.__pocketDiagnosticsVM = vm;
          return vm;
        }
      };
    `,
  }));
}
