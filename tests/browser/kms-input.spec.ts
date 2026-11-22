import { test, expect, type Page } from "@playwright/test";
import { mockSDK, type MockSDKState } from "./mock-sdk";

// Only the native DOM input ownership is modeled. These tests prove UI focus
// and pointer behavior, NOT Linux startup or execution of guest shortcuts.
const inputSelector = "body > textarea[data-pocketosix-kms-input]";
const state = (page: Page) => page.evaluate(() => (window as unknown as { __pocketTest: MockSDKState }).__pocketTest);

test.beforeEach(async ({ page, context }) => {
  await mockSDK(context, { nativeKms: true });
  await page.goto("/run");
  await page.getByRole("button", { name: "> boot", exact: true }).click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-vm-phase", "ready");
  await expect(page.locator(inputSelector)).toBeAttached();
});

test("native input never covers repeated canvas clicks and canvas focus delivers keys to its SDK-owned listener", async ({ page }) => {
  const canvas = page.locator(".linux-canvas");
  await canvas.click({ position: { x: 200, y: 200 } });
  await canvas.click({ position: { x: 210, y: 210 } });
  await expect(page.locator(inputSelector)).toHaveCSS("pointer-events", "none");
  await expect(page.locator(inputSelector)).toHaveAttribute("tabindex", "-1");
  expect((await state(page)).kmsClicks).toBe(2);
  await page.locator('[data-panel-trigger="display"]').focus();
  await canvas.focus();
  await expect(page.locator(inputSelector)).toBeFocused();
  await page.keyboard.press("Alt+Enter");
  expect((await state(page)).kmsKeys).toEqual(["Alt", "Enter"]);
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

test("crossing into mobile overlay transfers focus away from body KMS input", async ({ page }) => {
  await page.locator('[data-panel-trigger="display"]').click();
  await page.locator(".linux-canvas").focus();
  await expect(page.locator(inputSelector)).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  const panel = page.locator("#desktop-panel");
  await expect(page.locator("#main-content")).toHaveAttribute("inert", "");
  await expect(panel.getByRole("button", { name: "Close panel", exact: true })).toBeFocused();
  await page.keyboard.press("a");
  expect((await state(page)).kmsKeys).toEqual([]);
  await page.setViewportSize({ width: 400, height: 844 });
  await expect(panel.getByRole("button", { name: "Close panel", exact: true })).toBeFocused();
  await expect(page.locator(inputSelector)).not.toBeFocused();
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

test("a docked nonmodal Display panel does not block canvas input or focus restoration after KMS resize", async ({ page }) => {
  await page.locator('[data-panel-trigger="display"]').click();
  const panel = page.locator("#desktop-panel");
  await expect(panel).toBeVisible();
  expect(await panel.evaluate((node) => node.matches(":modal"))).toBe(false);
  await page.locator(".linux-canvas").focus();
  await expect(page.locator(inputSelector)).toBeFocused();
  const before = (await state(page)).kmsBindings;
  await page.setViewportSize({ width: 1280, height: 880 });
  await expect.poll(async () => (await state(page)).kmsBindings).toBeGreaterThan(before);
  await expect(page.locator(inputSelector)).toHaveCount(1);
  await expect(page.locator(inputSelector)).toBeFocused();
  await page.keyboard.press("d");
  expect((await state(page)).kmsKeys).toEqual(["d"]);
  await expect(panel).toBeVisible();
});
