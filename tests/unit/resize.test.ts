import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { webvm } from "../../lib/webvm";
import type { WebVMSnapshot } from "../../lib/webvm-state";

class TestResizeObserver {
  static latest: TestResizeObserver;
  target: Element | null = null;
  options: ResizeObserverOptions | undefined;
  constructor(private callback: ResizeObserverCallback) { TestResizeObserver.latest = this; }
  observe(target: Element, options?: ResizeObserverOptions) { this.target = target; this.options = options; }
  disconnect() { this.target = null; }
  emit() { this.callback([], this as unknown as ResizeObserver); }
}

function setup(t: TestContext) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const originalObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = TestResizeObserver as unknown as typeof ResizeObserver;
  // Exercise only the production controller's DOM/resize path, never boot the
  // SDK or touch IndexedDB. The stub is not evidence of a real Linux boot.
  const controller = webvm as unknown as {
    vm: { setKmsCanvas(canvas: HTMLCanvasElement, width: number, height: number): void; delete(): void } | null;
    cleanupTask: Promise<void> | null;
  };
  const bindings: { canvas: HTMLCanvasElement; width: number; height: number }[] = [];
  controller.vm = {
    setKmsCanvas(canvas, width, height) { bindings.push({ canvas, width, height }); },
    delete() {},
  };
  const rect = { width: 1440, height: 900 };
  const stage = { getBoundingClientRect: () => rect } as unknown as HTMLElement;
  const canvas = {
    parentElement: stage,
    getBoundingClientRect() { throw new Error("The intrinsic canvas must not be measured."); },
  } as unknown as HTMLCanvasElement;
  const consoleElement = { textContent: "", scrollHeight: 400, scrollTop: 0 } as HTMLPreElement;
  let release: (() => void) | null = webvm.attach(canvas, consoleElement);
  const detach = () => { release?.(); release = null; };
  const attach = (nextCanvas = canvas) => { release = webvm.attach(nextCanvas, consoleElement); };
  t.after(async () => {
    detach();
    t.mock.timers.tick(250);
    await controller.cleanupTask;
    globalThis.ResizeObserver = originalObserver;
  });
  return { bindings, rect, stage, canvas, consoleElement, detach, attach };
}

test("KMS observes the fixed stage border-box, not the intrinsic canvas", (t) => {
  const { bindings, stage, canvas } = setup(t);
  assert.deepEqual(bindings, [{ canvas, width: 1440, height: 900 }]);
  assert.equal(TestResizeObserver.latest.target, stage);
  assert.deepEqual(TestResizeObserver.latest.options, { box: "border-box" });
});

test("a resize burst produces one settled KMS binding and unchanged sizes produce none", (t) => {
  const { bindings, rect } = setup(t);
  rect.width = 1600;
  TestResizeObserver.latest.emit();
  t.mock.timers.tick(75);
  rect.width = 1920;
  rect.height = 1080;
  TestResizeObserver.latest.emit();
  t.mock.timers.tick(149);
  assert.equal(bindings.length, 1);
  t.mock.timers.tick(1);
  assert.equal(bindings.length, 2);
  assert.equal(bindings[1].width, 1920);
  assert.equal(bindings[1].height, 1080);
  TestResizeObserver.latest.emit();
  t.mock.timers.tick(150);
  assert.equal(bindings.length, 2);
});

test("subpixel layout jitter and a temporarily hidden stage do not reset KMS", (t) => {
  const { bindings, rect } = setup(t);
  rect.width = 1440.1;
  rect.height = 899.9;
  TestResizeObserver.latest.emit();
  t.mock.timers.tick(150);
  rect.width = rect.height = 0;
  TestResizeObserver.latest.emit();
  t.mock.timers.tick(150);
  assert.equal(bindings.length, 1);
});

test("StrictMode reattachment of the same canvas does not recreate KMS input", (t) => {
  const { bindings, detach, attach, rect } = setup(t);
  rect.width = 1600;
  TestResizeObserver.latest.emit();
  detach();
  rect.width = 1440;
  attach();
  t.mock.timers.tick(150);
  assert.equal(bindings.length, 1);
});

test("a genuinely new canvas is bound even when its stage size is unchanged", (t) => {
  const { bindings, detach, attach, stage } = setup(t);
  detach();
  const replacement = { parentElement: stage } as HTMLCanvasElement;
  attach(replacement);
  assert.equal(bindings.length, 2);
  assert.equal(bindings[1].canvas, replacement);
});

test("a disconnected observer cannot enqueue resize work after reattachment", (t) => {
  const { bindings, rect, detach, attach } = setup(t);
  const staleObserver = TestResizeObserver.latest;
  detach();
  attach();
  rect.width = 1600;
  staleObserver.emit();
  t.mock.timers.tick(150);
  assert.equal(bindings.length, 1);
  TestResizeObserver.latest.emit();
  t.mock.timers.tick(150);
  assert.equal(bindings.length, 2);
});

test("tty1 input is blocked by an inert terminal overlay or a modal", (t) => {
  const controller = webvm as unknown as { snapshot: WebVMSnapshot; consoleInput: ((keyCode: number) => void) | null };
  const previousSnapshot = controller.snapshot;
  const previousInput = controller.consoleInput;
  const originalDocument = globalThis.document;
  let inert = false;
  let modal = false;
  const terminal = { closest: (selector: string) => selector === "[inert]" && inert ? terminal : null };
  globalThis.document = { querySelector: (selector: string) => selector === ".xterm" ? terminal : modal ? {} : null } as unknown as Document;
  const input: number[] = [];
  controller.snapshot = { ...previousSnapshot, consoleReady: true };
  controller.consoleInput = (keyCode) => input.push(keyCode);
  t.after(() => {
    controller.snapshot = previousSnapshot;
    controller.consoleInput = previousInput;
    globalThis.document = originalDocument;
  });
  webvm.sendTerminal("a");
  inert = true;
  webvm.sendTerminal("b");
  inert = false;
  modal = true;
  webvm.sendTerminal("c");
  modal = false;
  controller.snapshot = { ...controller.snapshot, consoleReady: false };
  webvm.sendTerminal("d");
  assert.deepEqual(input, [97]);
});

test("bursty console output updates the host log once per animation frame", (t) => {
  const { consoleElement } = setup(t);
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  const frames: FrameRequestCallback[] = [];
  globalThis.requestAnimationFrame = (callback) => { frames.push(callback); return frames.length; };
  globalThis.cancelAnimationFrame = () => {};
  const controller = webvm as unknown as { appendLog(text: string): void; log: string };
  const previousLog = controller.log;
  t.after(() => {
    controller.log = previousLog;
    globalThis.requestAnimationFrame = originalRequest;
    globalThis.cancelAnimationFrame = originalCancel;
  });
  controller.appendLog("first ");
  controller.appendLog("second\n");
  assert.equal(consoleElement.textContent, previousLog);
  assert.equal(frames.length, 1);
  frames[0](0);
  assert.equal(consoleElement.textContent, previousLog + "first second\n");
  assert.equal(consoleElement.scrollTop, 400);
});
