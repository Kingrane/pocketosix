import { test, expect, type Page } from "@playwright/test";
import { mockSDK, type MockSDKState } from "./mock-sdk";

// Only the native DOM input ownership is modeled. These tests prove UI focus
// and pointer behavior, NOT Linux startup or execution of guest shortcuts.
const inputSelector = "body > textarea[data-pocketosix-kms-input]";
const state = (page: Page) => page.evaluate(() => (window as unknown as { __pocketTest: MockSDKState }).__pocketTest);

test.beforeEach(async ({ page, context }) => {
  await mockSDK(context, { nativeKms: true });
  await page.goto("/run");
  await expect(page.locator(".app-shell")).toHaveAttribute("data-vm-phase", "idle");
  await expect(page.locator(".linux-canvas")).not.toHaveCSS("cursor", "none");
  await expect(page.getByRole("button", { name: "> boot", exact: true })).toHaveCSS("cursor", "pointer");
  await page.getByRole("button", { name: "> boot", exact: true }).click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-vm-phase", "ready");
  await expect(page.locator(inputSelector)).toBeAttached();
});

test("native input never covers repeated canvas clicks and canvas focus delivers keys to its SDK-owned listener", async ({ page }) => {
  const canvas = page.locator(".linux-canvas");
  for (const position of [{ x: 200, y: 200 }, { x: 200, y: 200 }, { x: 210, y: 210 }]) {
    await canvas.click({ position });
    await expect(page.locator(inputSelector)).toBeFocused();
    expect(await canvas.evaluate((node, offset) => {
      const rect = node.getBoundingClientRect();
      return document.elementFromPoint(rect.left + offset.x, rect.top + offset.y) === node;
    }, position)).toBe(true);
  }
  await expect(page.locator(inputSelector)).toHaveCSS("pointer-events", "none");
  await expect(page.locator(inputSelector)).toHaveAttribute("tabindex", "-1");
  expect((await state(page)).kmsClicks).toBe(3);
  await page.locator('[data-panel-trigger="display"]').focus();
  await canvas.focus();
  await expect(page.locator(inputSelector)).toBeFocused();
  await page.keyboard.press("Alt+Enter");
  expect((await state(page)).kmsKeys).toEqual(["Alt", "Enter"]);
  expect((await state(page)).kmsKeyUps).toEqual(["Enter", "Alt"]);
});

test("host cursor is hidden only on a live ready canvas, never browser controls or inactive phases", async ({ page }) => {
  const canvas = page.locator(".linux-canvas");
  const display = page.locator('[data-panel-trigger="display"]');
  await expect(canvas).toHaveCSS("cursor", "none");
  await expect(display).toHaveCSS("cursor", "pointer");
  await expect(page.locator("body")).not.toHaveCSS("cursor", "none");
  await display.click();
  await expect(canvas).not.toHaveCSS("cursor", "none");
  await expect(page.locator("#desktop-panel").getByRole("button", { name: "Fit", exact: true })).toHaveCSS("cursor", "pointer");
  await page.locator("#desktop-panel [data-panel-close]").click();
  await canvas.focus();
  await page.keyboard.press("Control+Alt+Shift+m");
  const menu = page.getByRole("dialog", { name: "Desktop menu", exact: true });
  await expect(menu).toBeVisible();
  await expect(canvas).not.toHaveCSS("cursor", "none");
  await expect(menu.getByRole("button", { name: "Close", exact: true })).toHaveCSS("cursor", "pointer");
  await menu.getByRole("button", { name: "Close", exact: true }).click();
  await expect(canvas).toHaveCSS("cursor", "none");
  // CSS-only state matrix, including stale is-live after failure. Not a VM boot.
  for (const phase of ["idle", "checking", "engine", "disk", "starting", "error", "stopped"]) {
    await page.locator(".app-shell").evaluate((node, value) => { node.setAttribute("data-vm-phase", value); }, phase);
    await expect(canvas).not.toHaveCSS("cursor", "none");
    await expect(display).toHaveCSS("cursor", "pointer");
  }
  await page.locator(".app-shell").evaluate(node => { node.setAttribute("data-vm-phase", "ready"); });
  await canvas.evaluate(node => { node.classList.remove("is-live"); });
  await expect(canvas).not.toHaveCSS("cursor", "none");
});

test("cursor CSS neither acquires nor changes native pointer lock and controls retain their cursor after release", async ({ page }) => {
  const canvas = page.locator(".linux-canvas");
  await canvas.click({ position: { x: 200, y: 200 } });
  expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
  await expect(canvas).toHaveCSS("cursor", "none");
  await canvas.evaluate((node: HTMLCanvasElement) => node.requestPointerLock());
  await expect.poll(() => canvas.evaluate(node => document.pointerLockElement === node)).toBe(true);
  await expect(canvas).toHaveCSS("cursor", "none");
  // Actual cursor invisibility while locked is native browser behavior. This
  // checks ownership/CSS only, not relative mouse delivery to Linux.
  await page.evaluate(() => document.exitPointerLock());
  await expect.poll(() => page.evaluate(() => document.pointerLockElement)).toBeNull();
  const display = page.locator('[data-panel-trigger="display"]');
  await display.click();
  await expect(display).toHaveCSS("cursor", "pointer");
  await expect(page.locator(inputSelector)).not.toBeFocused();
  await page.locator("#desktop-panel [data-panel-close]").click();
  await canvas.click({ position: { x: 200, y: 200 } });
  await expect(page.locator(inputSelector)).toBeFocused();
  expect((await state(page)).kmsClicks).toBe(2);
  expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
});

test("late native input attachment honors existing canvas focus without synthesizing guest events", async ({ page }) => {
  await page.locator('[data-panel-trigger="display"]').focus();
  await page.evaluate(async (selector) => {
    const input = document.querySelector(selector)!;
    input.remove();
    await new Promise<void>(resolve => queueMicrotask(resolve));
    document.querySelector<HTMLCanvasElement>(".linux-canvas")!.focus();
    document.body.appendChild(input);
  }, inputSelector);
  await expect(page.locator(inputSelector)).toBeFocused();
  await expect(page.locator(inputSelector)).toHaveCSS("pointer-events", "none");
  await page.keyboard.press("a");
  expect((await state(page)).kmsKeys).toEqual(["a"]);
  expect((await state(page)).kmsKeyUps).toEqual(["a"]);
});

test("Alt Shift Space cancels only the browser default in KMS and all real releases still reach the native listener", async ({ page }) => {
  const input = page.locator(inputSelector);
  await page.locator(".linux-canvas").focus();
  await page.evaluate((selector) => {
    const events: { type: string; code: string; prevented: boolean; native: boolean; trusted: boolean }[] = [];
    Object.assign(window, { __spaceDefaults: events });
    // Document capture runs after the hook but before the mock SDK's blanket
    // preventDefault; it therefore proves the hook's narrowly scoped behavior.
    const record = (event: KeyboardEvent) => {
      if (event.code === "Space") events.push({ type: event.type, code: event.code, prevented: event.defaultPrevented, native: event.target === document.querySelector(selector), trusted: event.isTrusted });
    };
    document.addEventListener("keydown", record, true);
    document.addEventListener("keyup", record, true);
  }, inputSelector);
  for (const key of ["Alt", "Shift", "Space"]) await page.keyboard.down(key);
  await expect(input).toBeFocused();
  await expect(page.locator("dialog:modal")).toHaveCount(0);
  // Even releasing modifiers before Space must not swallow Space's keyup.
  for (const key of ["Shift", "Alt", "Space"]) await page.keyboard.up(key);
  expect((await state(page)).kmsKeys).toEqual(["Alt", "Shift", " "]);
  expect((await state(page)).kmsKeyUps).toEqual(["Shift", "Alt", " "]);
  await page.keyboard.press("Space");
  await page.locator('[data-panel-trigger="display"]').focus();
  await page.keyboard.press("Alt+Shift+Space");
  const defaults = await page.evaluate(() => (window as unknown as { __spaceDefaults: { type: string; code: string; prevented: boolean; native: boolean; trusted: boolean }[] }).__spaceDefaults);
  expect(defaults).toEqual([
    { type: "keydown", code: "Space", prevented: true, native: true, trusted: true },
    { type: "keyup", code: "Space", prevented: false, native: true, trusted: true },
    { type: "keydown", code: "Space", prevented: false, native: true, trusted: true },
    { type: "keyup", code: "Space", prevented: false, native: true, trusted: true },
    { type: "keydown", code: "Space", prevented: false, native: false, trusted: true },
    { type: "keyup", code: "Space", prevented: false, native: false, trusted: true },
  ]);
  expect((await state(page)).kmsKeys).toEqual(["Alt", "Shift", " ", " "]);
  expect((await state(page)).kmsKeyUps).toEqual(["Shift", "Alt", " ", " "]);
});

test("resize replaces native input without losing guest focus or leaving duplicate listeners", async ({ page }) => {
  await page.locator(".linux-canvas").focus();
  const before = (await state(page)).kmsBindings;
  await page.setViewportSize({ width: 1280, height: 880 });
  await expect.poll(async () => (await state(page)).kmsBindings).toBeGreaterThan(before);
  await expect(page.locator(inputSelector)).toHaveCount(1);
  await expect(page.locator(inputSelector)).toBeFocused();
  await page.keyboard.press("a");
  expect((await state(page)).kmsKeys).toEqual(["a"]);
});

test("menu waits for real modifier keyups before taking KMS focus", async ({ page }) => {
  await page.locator(".linux-canvas").focus();
  for (const key of ["Control", "Alt", "Shift", "KeyM"]) await page.keyboard.down(key);
  await expect(page.locator("dialog:modal")).toHaveCount(0);
  await expect(page.locator(inputSelector)).toBeFocused();
  await page.keyboard.up("KeyM");
  await expect(page.locator("dialog:modal")).toHaveCount(0);
  for (const key of ["Shift", "Alt", "Control"]) await page.keyboard.up(key);
  const menu = page.getByRole("dialog", { name: "Desktop menu", exact: true });
  await expect(menu).toBeVisible();
  expect((await state(page)).kmsKeys).toEqual(["Control", "Alt", "Shift"]);
  expect((await state(page)).kmsKeyUps).toEqual(["Shift", "Alt", "Control"]);
  await menu.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator(inputSelector)).toBeFocused();
  await page.keyboard.press("a");
  expect((await state(page)).kmsKeys.at(-1)).toBe("a");
});

test("physical menu and palette keys work with Russian key values", async ({ page }) => {
  await page.locator(".linux-canvas").focus();
  for (const key of ["Control", "Alt", "Shift"]) await page.keyboard.down(key);
  await page.locator(inputSelector).dispatchEvent("keydown", { code: "KeyM", key: "ь", ctrlKey: true, altKey: true, shiftKey: true, bubbles: true, cancelable: true });
  await page.locator(inputSelector).dispatchEvent("keyup", { code: "KeyM", key: "ь", ctrlKey: true, altKey: true, shiftKey: true, bubbles: true, cancelable: true });
  for (const key of ["Shift", "Alt", "Control"]) await page.keyboard.up(key);
  const menu = page.getByRole("dialog", { name: "Desktop menu", exact: true });
  await expect(menu).toBeVisible();
  expect((await state(page)).kmsKeys).toEqual(["Control", "Alt", "Shift"]);
  await menu.getByRole("button", { name: "Close", exact: true }).click();
  const display = page.locator('[data-panel-trigger="display"]');
  await display.focus();
  await display.dispatchEvent("keydown", { code: "KeyK", key: "л", ctrlKey: true, bubbles: true, cancelable: true });
  await expect(page.getByRole("dialog", { name: "Command palette", exact: true })).toBeVisible();
});

test("M pressed before modifiers retains its matching guest keyup without opening a menu", async ({ page }) => {
  await page.locator(".linux-canvas").focus();
  await page.keyboard.down("KeyM");
  for (const key of ["Control", "Alt", "Shift"]) await page.keyboard.down(key);
  await page.keyboard.up("KeyM");
  for (const key of ["Shift", "Alt", "Control"]) await page.keyboard.up(key);
  await expect(page.locator("dialog:modal")).toHaveCount(0);
  expect((await state(page)).kmsKeys.map(key => key.toLowerCase())).toEqual(["m", "control", "alt", "shift"]);
  expect((await state(page)).kmsKeyUps.map(key => key.toLowerCase())).toEqual(["m", "shift", "alt", "control"]);
});

test("panel overlay keeps native KMS unfocused across desktop and mobile widths", async ({ page }) => {
  await page.locator(".linux-canvas").focus();
  await expect(page.locator(inputSelector)).toBeFocused();
  await page.locator('[data-panel-trigger="display"]').click();
  const panel = page.locator("#desktop-panel");
  for (const width of [1440, 1280, 390, 400]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.locator("[data-panel-overlay=true]")).toBeVisible();
    await expect(page.locator("#main-content")).toHaveAttribute("inert", "");
    await expect(panel.locator("[data-panel-close]")).toBeFocused();
    await expect(page.locator(inputSelector)).not.toBeFocused();
    await page.keyboard.press("a");
    expect((await state(page)).kmsKeys).toEqual([]);
  }
});

test("resize does not steal tty1, menu or confirmation focus; dialog keys never reach native KMS", async ({ page }) => {
  await page.locator('[data-panel-trigger="terminal"]').click();
  await page.locator("#desktop-panel").getByRole("button", { name: "Open terminal", exact: true }).click();
  const tty = page.locator(".xterm-helper-textarea");
  await expect(tty).toBeAttached();
  await tty.focus();
  await page.setViewportSize({ width: 1280, height: 880 });
  await expect(tty).toBeFocused();
  await page.keyboard.press("b");
  await expect.poll(async () => (await state(page)).consoleInput).toEqual([98]);
  expect((await state(page)).kmsKeys).toEqual([]);
  await page.keyboard.press("Control+Alt+Shift+m");
  const menu = page.getByRole("dialog", { name: "Desktop menu", exact: true });
  const menuAction = menu.getByRole("button", { name: "Back to home", exact: true });
  await menuAction.focus();
  await page.setViewportSize({ width: 1360, height: 900 });
  await expect(menuAction).toBeFocused();
  await menu.getByRole("button", { name: "Close", exact: true }).click();
  await expect(tty).toBeFocused();
  const disk = page.locator('[data-panel-trigger="disk"]');
  await disk.click();
  await page.locator("#desktop-panel").getByRole("button", { name: "Reset disk", exact: true }).click();
  const confirmation = page.getByLabel("Type pocketosix to confirm");
  await confirmation.focus();
  await page.setViewportSize({ width: 1440, height: 960 });
  await expect(confirmation).toBeFocused();
  await page.keyboard.type("pocketosix");
  await expect(confirmation).toHaveValue("pocketosix");
  expect((await state(page)).kmsKeys).toEqual([]);
  expect((await state(page)).consoleInput).toEqual([98]);
  await page.getByRole("button", { name: "Keep my disk", exact: true }).click();
  await expect(disk).toBeFocused();
});

test("HTML fullscreen includes body-level native KMS and leaves keyboard operational", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.getByRole("button", { name: "Immersive", exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
  expect(await page.locator(inputSelector).evaluate((input) => input.parentElement === document.body && document.fullscreenElement?.contains(input))).toBe(true);
  await page.locator(".linux-canvas").click({ position: { x: 200, y: 200 } });
  await expect(page.locator(inputSelector)).toBeFocused();
  await page.keyboard.press("Alt+Enter");
  expect((await state(page)).kmsKeys).toEqual(["Alt", "Enter"]);
  await page.evaluate(() => document.exitFullscreen());
  await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-mode", "docked");
  expect(errors).toEqual([]);
});

test("closing a dialog cannot restore stale focus over a subsequent canvas interaction", async ({ page }) => {
  await page.locator('[data-panel-trigger="disk"]').click();
  await page.locator("#desktop-panel").getByRole("button", { name: "Reset disk", exact: true }).click();
  // Hold animation callbacks to reproduce a new user interaction before a
  // deferred dialog focus return. This fixture models DOM timing, not Linux.
  await page.evaluate(() => {
    const original = window.requestAnimationFrame;
    const pending: FrameRequestCallback[] = [];
    window.requestAnimationFrame = callback => pending.push(callback);
    Object.assign(window, { __releaseFocusFrames: () => {
      window.requestAnimationFrame = original;
      for (const callback of pending) callback(performance.now());
    } });
  });
  await page.getByRole("button", { name: "Keep my disk", exact: true }).click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await page.locator(".linux-canvas").click({ position: { x: 200, y: 200 } });
  await expect(page.locator(inputSelector)).toBeFocused();
  await page.evaluate(() => (window as unknown as { __releaseFocusFrames: () => void }).__releaseFocusFrames());
  await expect(page.locator(inputSelector)).toBeFocused();
  await page.keyboard.press("c");
  expect((await state(page)).kmsKeys).toEqual(["c"]);
});

test("a docked Display overlay blocks native focus restoration after KMS resize and releases it on close", async ({ page }) => {
  await page.locator(".linux-canvas").focus();
  await expect(page.locator(inputSelector)).toBeFocused();
  await page.locator('[data-panel-trigger="display"]').click();
  const panel = page.locator("#desktop-panel");
  await expect(panel).toBeVisible();
  await expect(page.locator("[data-panel-overlay=true]")).toBeVisible();
  await expect(page.locator("#main-content")).toHaveAttribute("inert", "");
  await page.locator(".linux-canvas").focus();
  await expect(page.locator(inputSelector)).not.toBeFocused();
  const before = (await state(page)).kmsBindings;
  await page.setViewportSize({ width: 1280, height: 880 });
  await expect.poll(async () => (await state(page)).kmsBindings).toBeGreaterThan(before);
  await expect(page.locator(inputSelector)).toHaveCount(1);
  await expect(page.locator(inputSelector)).not.toBeFocused();
  await page.keyboard.press("d");
  expect((await state(page)).kmsKeys).toEqual([]);
  await expect(panel).toBeVisible();
  await panel.locator("[data-panel-close]").click();
  await expect(page.locator("[data-panel-overlay=true]")).toHaveCount(0);
  await page.locator(".linux-canvas").focus();
  await expect(page.locator(inputSelector)).toBeFocused();
  await page.keyboard.press("d");
  expect((await state(page)).kmsKeys).toEqual(["d"]);
});
