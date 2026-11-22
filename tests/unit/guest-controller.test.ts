import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { webvm } from "../../lib/webvm";
import { INITIAL_SNAPSHOT, type WebVMSnapshot } from "../../lib/webvm-state";
import { INITIAL_GUEST_DESKTOP } from "../../lib/guest-desktop-state";
import type { GuestCommand, GuestDesktopSession } from "../../lib/guest-desktop";

const SESSION: GuestDesktopSession = { uid: 1000, gid: 1000, socketPath: "/tmp/i3-unit/ipc-socket.529" };
const EMPTY_TREE = { type: "root", nodes: [], floating_nodes: [] };
const WINDOW = {
  type: "con", id: 101, window: 201, name: "unit shell", focused: true,
  floating: "auto_off", window_properties: { class: "XTerm" },
  rect: { x: 0, y: 0, width: 640, height: 480 }, nodes: [], floating_nodes: [],
};
const TREE = { ...EMPTY_TREE, nodes: [WINDOW] };

type Run = {
  fileName: string; args: string[]; options: GuestCommand["options"];
  requestId?: string;
  finish(status?: number): void;
};
type Controller = {
  snapshot: WebVMSnapshot;
  vm: { run(fileName: string, args: string[], options: GuestCommand["options"]): Promise<{ status: number }>; delete(): void } | null;
  lifetime: number;
  guestSession: GuestDesktopSession | null;
  guestTask: Promise<boolean> | null;
  guestOutput: string;
  guestReply: { id: string; resolve(value: Record<string, unknown>): void; reject(error: Error): void } | null;
  readGuestOutput(text: string): void;
  stopRuntime(): void;
};

// A fixed microtask budget, never a real-time polling loop or a guest boot.
async function drain() { for (let i = 0; i < 20; i++) await Promise.resolve(); }
function observe(task: Promise<boolean>) {
  const outcome: { result?: boolean } = {};
  void task.then(result => { outcome.result = result; });
  return outcome;
}

function setup(t: TestContext, prepared = false) {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  // Same test-only private-field cast/stub as resize.test.ts. No SDK import,
  // browser globals, image access, IndexedDB or exported production adapter.
  const controller = webvm as unknown as Controller;
  const previous = {
    snapshot: controller.snapshot, vm: controller.vm, lifetime: controller.lifetime,
    guestSession: controller.guestSession, guestTask: controller.guestTask,
    guestOutput: controller.guestOutput, guestReply: controller.guestReply,
  };
  const runs: Run[] = [];
  controller.vm = {
    run(fileName, args, options) {
      return new Promise(resolve => { runs.push({ fileName, args, options, requestId: controller.guestReply?.id, finish: (status = 0) => resolve({ status }) }); });
    },
    delete() {},
  };
  controller.snapshot = { ...INITIAL_SNAPSHOT, phase: "ready", guestDesktop: {
    ...INITIAL_GUEST_DESKTOP, phase: prepared ? "ready" : "idle", apps: prepared ? ["terminal"] : [],
  } };
  controller.guestSession = prepared ? SESSION : null;
  controller.guestTask = null;
  controller.guestOutput = "";
  controller.guestReply = null;
  t.after(async () => {
    controller.stopRuntime();
    runs.forEach(run => run.finish());
    await drain();
    t.mock.timers.reset();
    Object.assign(controller, previous);
  });
  const output = (text: string) => controller.readGuestOutput(text);
  const probeText = (run: Run, session: GuestDesktopSession = SESSION) => "[pocketosix-guest]" + JSON.stringify({
    operation: "probe", state: "ready", requestId: run.requestId, session, apps: ["terminal"],
  }) + "\n";
  const treeText = (run: Run, tree: unknown = EMPTY_TREE) => `[pocketosix-tree:${run.requestId}]${JSON.stringify(tree)}\n`;
  const treeReply = async (run: Run, tree: unknown = EMPTY_TREE) => { output(treeText(run, tree)); run.finish(); await drain(); };
  return { controller, runs, output, probeText, treeText, treeReply };
}

test("nonce parser waits for complete lines and ignores stale probe/tree requests", { timeout: 1000 }, async t => {
  const { runs, output, probeText, treeText, controller } = setup(t);
  const outcome = observe(webvm.inspectGuestDesktop());
  assert.equal(runs.length, 1);
  const probe = runs[0];
  output("ordinary guest output\n[pocketosix-guest]{broken json}\n");
  output(probeText(probe).replace(String(probe.requestId), "stale-request_123"));
  probe.finish();
  await drain();
  assert.equal(runs.length, 1);
  assert.equal(controller.guestSession, null);
  const reply = probeText(probe);
  output(reply.slice(0, 17));
  output(reply.slice(17, -1));
  await drain();
  assert.equal(controller.guestSession, null);
  output("\n");
  await drain();
  assert.equal(runs.length, 2);
  const tree = runs[1];
  output(`[pocketosix-tree:${probe.requestId}]${JSON.stringify(TREE)}\n`);
  tree.finish();
  await drain();
  assert.equal(outcome.result, undefined);
  assert.equal(controller.snapshot.guestDesktop.windows.length, 0);
  const treeLine = treeText(tree, TREE);
  output(treeLine.slice(0, 23));
  output(treeLine.slice(23, -1));
  await drain();
  assert.equal(outcome.result, undefined);
  output("\n");
  await drain();
  assert.equal(outcome.result, true);
  assert.equal(controller.snapshot.guestDesktop.windows[0].windowId, WINDOW.window);
});

test("cancelling a query cannot publish a response already queued by the old guest", { timeout: 1000 }, async t => {
  const { runs, controller, output, treeText } = setup(t, true);
  const outcome = observe(webvm.inspectGuestDesktop());
  await drain();
  assert.equal(runs.length, 1);
  runs[0].finish();
  await drain();
  output(treeText(runs[0], TREE));
  controller.stopRuntime();
  await drain();
  assert.equal(outcome.result, false);
  assert.equal(controller.guestSession, null);
  assert.deepEqual(controller.snapshot.guestDesktop, INITIAL_GUEST_DESKTOP);
});

test("control frames following unterminated tty prompts are recognized by nonce", { timeout: 1000 }, async t => {
  const { runs, output, probeText, treeText, controller } = setup(t);
  const outcome = observe(webvm.inspectGuestDesktop());
  output("\r? login: " + probeText(runs[0]));
  runs[0].finish();
  await drain();
  assert.equal(runs.length, 2);
  assert.notEqual(controller.snapshot.guestDesktop.phase, "ready");
  output("guest prompt> " + treeText(runs[1], TREE));
  runs[1].finish();
  await drain();
  assert.equal(outcome.result, true);
  assert.equal(controller.snapshot.guestDesktop.phase, "ready");
  assert.equal(controller.snapshot.guestDesktop.windows[0].windowId, WINDOW.window);
});

test("duplicate guest actions share the busy gate and do not run a second command", { timeout: 1000 }, async t => {
  const { runs, treeReply, controller } = setup(t, true);
  const first = observe(webvm.inspectGuestDesktop());
  const duplicate = observe(webvm.inspectGuestDesktop());
  await drain();
  assert.equal(duplicate.result, false);
  assert.equal(runs.length, 1);
  assert.equal(controller.snapshot.guestDesktop.pending, "inspect");
  await treeReply(runs[0]);
  assert.equal(first.result, true);
  assert.equal(controller.snapshot.guestDesktop.pending, null);
});

test("launch stays busy after IPC acknowledgement until a later tree contains a visible window", { timeout: 1000 }, async t => {
  const { runs, treeReply, controller } = setup(t, true);
  const outcome = observe(webvm.launchGuestApp("terminal"));
  await drain();
  await treeReply(runs[0]);
  assert.equal(runs[1].fileName, "/usr/bin/i3-msg");
  runs[1].finish(); // IPC accepted exec, not proof that XTerm appeared.
  await drain();
  assert.equal(outcome.result, undefined);
  assert.equal(controller.snapshot.guestDesktop.pending, "terminal");
  await treeReply(runs[2]);
  assert.equal(outcome.result, undefined);
  const duplicate = observe(webvm.launchGuestApp("terminal"));
  await drain();
  assert.equal(duplicate.result, false);
  t.mock.timers.tick(499);
  await drain();
  assert.equal(runs.length, 3);
  t.mock.timers.tick(1);
  await drain();
  assert.equal(runs.length, 4);
  await treeReply(runs[3], TREE);
  assert.equal(outcome.result, true);
  assert.equal(controller.snapshot.guestDesktop.pending, null);
  assert.equal(controller.snapshot.guestDesktop.windows[0].windowId, WINDOW.window);
  assert.equal(runs.filter(run => run.fileName === "/usr/bin/i3-msg").length, 1);
});

test("query timeout also bounds an unfinished run and ignores its late output", { timeout: 1000 }, async t => {
  const { runs, controller, output, treeText } = setup(t, true);
  const outcome = observe(webvm.inspectGuestDesktop());
  await drain();
  assert.equal(runs.length, 1);
  t.mock.timers.tick(20000);
  await drain();
  assert.equal(outcome.result, false);
  assert.equal(controller.snapshot.guestDesktop.pending, "stalled");
  assert.ok(controller.snapshot.guestDesktop.error);
  const duplicate = observe(webvm.inspectGuestDesktop());
  await drain();
  assert.equal(duplicate.result, false);
  assert.equal(runs.length, 1);
  output(treeText(runs[0], TREE));
  runs[0].finish();
  await drain();
  assert.equal(controller.snapshot.guestDesktop.pending, null);
  assert.deepEqual(controller.snapshot.guestDesktop.windows, []);
});

test("close waits for actual disappearance after ACK without sending another kill", { timeout: 1000 }, async t => {
  const { runs, treeReply, controller } = setup(t, true);
  const outcome = observe(webvm.controlGuestWindow({ containerId: 101, windowId: 201 }, "close"));
  await drain();
  await treeReply(runs[0], TREE);
  runs[1].finish();
  await drain();
  await treeReply(runs[2], TREE);
  assert.equal(outcome.result, undefined);
  assert.equal(controller.snapshot.guestDesktop.pending, "close");
  assert.equal(await webvm.controlGuestWindow({ containerId: 101, windowId: 201 }, "close"), false);
  t.mock.timers.tick(500);
  await drain();
  await treeReply(runs[3], EMPTY_TREE);
  assert.equal(outcome.result, true);
  assert.deepEqual(controller.snapshot.guestDesktop.windows, []);
  assert.equal(runs.filter(run => run.args.at(-1)?.endsWith(" kill")).length, 1);
});

test("accepted close that leaves the window alive fails honestly without retry or reset", { timeout: 1000 }, async t => {
  const { runs, treeReply, controller } = setup(t, true);
  let now = 0;
  t.mock.method(performance, "now", () => now);
  const outcome = observe(webvm.controlGuestWindow({ containerId: 101, windowId: 201 }, "close"));
  await drain();
  await treeReply(runs[0], TREE);
  runs[1].finish();
  await drain();
  await treeReply(runs[2], TREE);
  for (let attempt = 0; attempt < 20; attempt++) {
    now += 500;
    t.mock.timers.tick(500);
    await drain();
    await treeReply(runs[3 + attempt], TREE);
  }
  assert.equal(outcome.result, false);
  assert.match(controller.snapshot.guestDesktop.error!, /окно ещё открыто/);
  assert.equal(controller.snapshot.guestDesktop.pending, null);
  assert.equal(controller.snapshot.guestDesktop.windows[0].windowId, WINDOW.window);
  assert.equal(runs.filter(run => run.args.at(-1)?.endsWith(" kill")).length, 1);
  assert.equal(controller.snapshot.phase, "ready");
});

test("cold discovery accepts a real reply after 20 seconds without issuing another probe", { timeout: 1000 }, async t => {
  const { runs, output, probeText, treeReply, controller } = setup(t);
  const outcome = observe(webvm.inspectGuestDesktop());
  t.mock.timers.tick(30000);
  await drain();
  assert.equal(outcome.result, undefined);
  assert.equal(controller.snapshot.guestDesktop.error, null);
  assert.equal(await webvm.inspectGuestDesktop(), false);
  assert.equal(runs.length, 1);
  output(probeText(runs[0]));
  runs[0].finish();
  await drain();
  await treeReply(runs[1], TREE);
  assert.equal(outcome.result, true);
});

test("cold discovery still times out at 90 seconds and blocks until its process exits", { timeout: 1000 }, async t => {
  const { runs, controller } = setup(t);
  const outcome = observe(webvm.inspectGuestDesktop());
  t.mock.timers.tick(90000);
  await drain();
  assert.equal(outcome.result, false);
  assert.equal(controller.snapshot.guestDesktop.pending, "stalled");
  assert.match(controller.snapshot.guestDesktop.error!, /90 секунд/);
  assert.equal(await webvm.inspectGuestDesktop(), false);
  assert.equal(runs.length, 1);
  runs[0].finish();
  await drain();
  assert.equal(controller.snapshot.guestDesktop.pending, null);
});

test("default floating is idempotent while starting, after timeout and once enabled", { timeout: 1000 }, async t => {
  const { runs, controller, output, treeReply } = setup(t, true);
  const first = observe(webvm.enableGuestFloating());
  await drain();
  assert.equal(controller.snapshot.guestDesktop.floating, "starting");
  assert.equal(await webvm.enableGuestFloating(), false);
  t.mock.timers.tick(20000);
  await drain();
  assert.equal(first.result, false);
  assert.equal(await webvm.enableGuestFloating(), true);
  assert.equal(runs.length, 1);
  output("[pocketosix-guest]" + JSON.stringify({ operation: "floating", state: "enabled", token: runs[0].args.at(-1) }) + "\n");
  await drain();
  assert.equal(controller.snapshot.guestDesktop.floating, "on");
  assert.equal(await webvm.enableGuestFloating(), true);
  assert.equal(runs.length, 1);
  const stop = observe(webvm.toggleGuestFloating());
  await drain();
  runs[1].finish();
  output("[pocketosix-guest]" + JSON.stringify({ operation: "floating", state: "disabled", token: runs[0].args.at(-1) }) + "\n");
  runs[0].finish();
  await drain();
  await treeReply(runs[2]);
  assert.equal(stop.result, true);
  assert.equal(controller.snapshot.guestDesktop.floating, "off");
  assert.equal(runs.filter(run => run.args.at(-1)?.startsWith("pocketosix-floating-stop:") && run.fileName === "/usr/bin/python3").length, 1);
});

test("default floating attempts once only after a non-uniform real-frame sample", { timeout: 1000 }, async t => {
  const { controller } = setup(t);
  const runtime = controller as Controller & { canvas: HTMLCanvasElement | null; waitForFrame(token: number): void };
  const originalDocument = globalThis.document;
  const originalCanvas = runtime.canvas;
  let painted = false;
  const enable = t.mock.method(webvm, "enableGuestFloating", () => Promise.resolve(true));
  globalThis.document = { createElement: () => ({ getContext: () => ({
    drawImage() {}, getImageData: () => ({ data: painted ? [0, 0, 0, 255, 1, 0, 0, 255] : [0, 0, 0, 255, 0, 0, 0, 255] }),
  }) }) } as unknown as Document;
  runtime.canvas = {} as HTMLCanvasElement;
  controller.snapshot = { ...controller.snapshot, phase: "starting" };
  t.after(() => { globalThis.document = originalDocument; runtime.canvas = originalCanvas; });
  runtime.waitForFrame(controller.lifetime);
  t.mock.timers.tick(500);
  assert.equal(enable.mock.callCount(), 0);
  painted = true;
  t.mock.timers.tick(500);
  assert.equal(enable.mock.callCount(), 1);
  assert.equal(controller.snapshot.phase, "ready");
  runtime.waitForFrame(controller.lifetime);
  t.mock.timers.tick(10000);
  assert.equal(enable.mock.callCount(), 1);
});

test("floating stop waits for subscriber exit, but a missing exit cannot leave the action busy forever", { timeout: 1000 }, async t => {
  const { runs, controller, output, treeReply } = setup(t, true);
  const started = observe(webvm.toggleGuestFloating());
  await drain();
  assert.equal(runs[0].fileName, "/usr/bin/python3");
  output("[pocketosix-guest]" + JSON.stringify({ operation: "floating", state: "enabled", token: runs[0].args.at(-1) }) + "\n");
  await drain();
  await treeReply(runs[1]);
  assert.equal(started.result, true);
  assert.equal(controller.snapshot.guestDesktop.floating, "on");
  const stopped = observe(webvm.toggleGuestFloating());
  await drain();
  assert.ok(runs[2].args.includes("send_tick"));
  runs[2].finish();
  await drain();
  assert.equal(stopped.result, undefined);
  assert.equal(controller.snapshot.guestDesktop.pending, "floating");
  t.mock.timers.tick(20000);
  await drain();
  assert.equal(stopped.result, false);
  assert.equal(controller.snapshot.guestDesktop.pending, null);
  assert.ok(controller.snapshot.guestDesktop.error);
  assert.notEqual(controller.snapshot.guestDesktop.floating, "off");
  assert.equal(runs.filter(run => run.fileName === "/usr/bin/python3" && run.args.at(-1)?.startsWith("pocketosix-floating-stop:")).length, 1);
});

for (const [label, session] of [
  ["root UID", { ...SESSION, uid: 0 }],
  ["negative GID", { ...SESSION, gid: -1 }],
  ["socket containing a newline", { ...SESSION, socketPath: "/tmp/socket\nunit" }],
] as const) {
  test(`probe rejects ${label} before caching a session or reporting ready`, { timeout: 1000 }, async t => {
    const { runs, output, probeText, controller } = setup(t);
    const outcome = observe(webvm.inspectGuestDesktop());
    output(probeText(runs[0], session));
    runs[0].finish();
    await drain();
    assert.equal(outcome.result, false);
    assert.equal(controller.guestSession, null);
    assert.equal(controller.snapshot.guestDesktop.phase, "error");
    assert.equal(controller.snapshot.guestDesktop.pending, null);
    assert.equal(runs.length, 1);
  });
}

test("malformed tree data cannot turn an inspection into a ready desktop", { timeout: 1000 }, async t => {
  const { runs, output, probeText, treeReply, controller } = setup(t);
  const outcome = observe(webvm.inspectGuestDesktop());
  output(probeText(runs[0]));
  runs[0].finish();
  await drain();
  assert.equal(runs.length, 2);
  await treeReply(runs[1], { type: "root", nodes: "not an i3 tree" });
  assert.equal(outcome.result, false);
  assert.notEqual(controller.snapshot.guestDesktop.phase, "ready");
  assert.ok(controller.snapshot.guestDesktop.error);
  assert.equal(controller.snapshot.guestDesktop.pending, null);
  assert.deepEqual(controller.snapshot.guestDesktop.windows, []);
});
