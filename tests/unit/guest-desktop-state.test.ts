import { test } from "node:test";
import assert from "node:assert/strict";
import { guestWindows, INITIAL_GUEST_DESKTOP } from "../../lib/guest-desktop-state";

// An i3-shaped synthetic IPC fixture. IDs, titles and geometry below are test
// data only; they are not captured guest metadata or a real SDK boot assertion.
const TILED = {
  type: "con", id: 4294967297, window: 2097153, name: "unit shell", focused: true,
  floating: "auto_off", scratchpad_state: "none", window_properties: { class: "XTerm" },
  rect: { x: -1280, y: 24, width: 1280, height: 696 }, nodes: [], floating_nodes: [],
};
const VISIBLE_SCRATCHPAD = {
  type: "con", id: 4294967298, window: 2097154, name: "unit files", focused: false,
  floating: "user_on", scratchpad_state: "changed", window_properties: { class: "Thunar" },
  rect: { x: 160, y: 100, width: 640, height: 480 }, nodes: [], floating_nodes: [],
};
const HIDDEN = {
  type: "con", id: 4294967299, window: 2097155, name: "unit hidden", focused: false,
  floating: "auto_on", scratchpad_state: "fresh", window_properties: { class: "XTerm" },
  rect: { x: 0, y: 0, width: 600, height: 400 }, nodes: [], floating_nodes: [],
};
const TREE = {
  type: "root", id: 1, nodes: [
    { type: "output", name: "unit-output", nodes: [
      { type: "dockarea", nodes: [{ ...TILED, id: 100, window: 200, name: "unit polybar" }] },
      { type: "con", window: null, nodes: [
        { type: "workspace", name: "1", nodes: [
          { type: "con", window: null, nodes: [TILED], floating_nodes: [] },
        ], floating_nodes: [
          { type: "floating_con", window: null, nodes: [VISIBLE_SCRATCHPAD], floating_nodes: [] },
        ] },
      ] },
    ] },
    { type: "output", name: "__i3", nodes: [
      { type: "workspace", name: "__i3_scratch", nodes: [], floating_nodes: [
        { type: "floating_con", nodes: [HIDDEN] },
      ] },
    ] },
  ],
};

test("desktop state begins without fabricated apps, windows or enabled guest actions", () => {
  assert.deepEqual(INITIAL_GUEST_DESKTOP, {
    phase: "idle", apps: [], windows: [], floating: "off", pending: null, error: null,
  });
});

test("i3 tree traversal flattens tiled and floating windows but excludes dockarea descendants", () => {
  assert.deepEqual(guestWindows(TREE), [
    { containerId: TILED.id, windowId: TILED.window, title: TILED.name, className: "XTerm",
      focused: true, floating: false, hidden: false, rect: TILED.rect },
    { containerId: VISIBLE_SCRATCHPAD.id, windowId: VISIBLE_SCRATCHPAD.window,
      title: VISIBLE_SCRATCHPAD.name, className: "Thunar", focused: false, floating: true,
      hidden: false, rect: VISIBLE_SCRATCHPAD.rect },
    { containerId: HIDDEN.id, windowId: HIDDEN.window, title: HIDDEN.name, className: "XTerm",
      focused: false, floating: true, hidden: true, rect: HIDDEN.rect },
  ]);
});

test("only the __i3_scratch workspace marks a window hidden, not scratchpad_state or floating", () => {
  for (const floating of ["auto_off", "user_off", "auto_on", "user_on"]) {
    const visible = guestWindows({ type: "workspace", name: "2", floating_nodes: [
      { ...VISIBLE_SCRATCHPAD, floating, scratchpad_state: "changed" },
    ] })[0];
    assert.equal(visible.hidden, false);
    assert.equal(visible.floating, floating.endsWith("_on"));
    const hidden = guestWindows({ type: "workspace", name: "__i3_scratch", nodes: [
      { type: "con", nodes: [{ ...HIDDEN, floating, scratchpad_state: "none" }] },
    ] })[0];
    assert.equal(hidden.hidden, true);
  }
  assert.equal(guestWindows({ type: "con", name: "__i3_scratch", nodes: [TILED] })[0].hidden, false);
});

test("root, workspace and structural containers never become synthetic windows", () => {
  for (const type of ["root", "output", "workspace", "floating_con"]) {
    assert.deepEqual(guestWindows({ ...TILED, type }), []);
  }
  assert.deepEqual(guestWindows({ ...TILED, window: null }), []);
  assert.deepEqual(guestWindows({ ...TILED, window: 0 }), []);
  assert.deepEqual(guestWindows({ ...TILED, id: "4294967297" }), []);
  assert.deepEqual(guestWindows({ ...TILED, window: "2097153" }), []);
  assert.deepEqual(guestWindows({ ...TILED, id: Number.MAX_SAFE_INTEGER + 1 }), []);
});

test("missing or malformed metadata is not replaced with guessed titles, classes or geometry", () => {
  const [window] = guestWindows({ ...TILED, name: undefined, window_properties: undefined, focused: "true", floating: "on" });
  assert.equal(window.title, "");
  assert.equal(window.className, "");
  assert.equal(window.focused, false);
  assert.equal(window.floating, false);
  assert.deepEqual(window.rect, TILED.rect);
  for (const rect of [undefined, null, {}, { ...TILED.rect, x: NaN }, { ...TILED.rect, y: Infinity },
    { ...TILED.rect, width: "1280" }, { ...TILED.rect, height: undefined }]) {
    assert.deepEqual(guestWindows({ ...TILED, rect }), []);
  }
});

test("focused flags and finite geometry are retained without changing the input tree", () => {
  const node = { ...TILED, rect: { x: -20, y: 12.5, width: 0, height: 480 } };
  const before = structuredClone(node);
  const [window] = guestWindows(node);
  assert.equal(window.focused, true);
  assert.deepEqual(window.rect, node.rect);
  assert.notEqual(window.rect, node.rect);
  window.rect.x = 999;
  assert.deepEqual(node, before);
  assert.equal(guestWindows({ ...TILED, focused: 1 })[0].focused, false);
});

test("titles are bounded and absent tree data produces no windows", () => {
  assert.equal(guestWindows({ ...TILED, name: "x".repeat(200) })[0].title, "x".repeat(160));
  for (const value of [undefined, null, false, 42, "tree", [], {}]) assert.deepEqual(guestWindows(value), []);
  assert.deepEqual(guestWindows({ type: "root", nodes: {}, floating_nodes: "not nodes" }), []);
});
