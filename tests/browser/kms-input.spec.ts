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
  await page.getByRole("button", { name: "Open menu", exact: true }).focus();
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

test("resize does not steal tty1, menu or confirmation focus; dialog keys never reach native KMS", async ({ page }) => {
  const menu = page.getByRole("button", { name: "Open menu", exact: true });
  await menu.click();
  await page.getByRole("dialog", { name: "Desktop menu", exact: true }).getByRole("button", { name: "Open terminal", exact: true }).click();
  const tty = page.locator(".xterm-helper-textarea");
  await expect(tty).toBeAttached();
  await tty.focus();
  await page.setViewportSize({ width: 1280, height: 880 });
  await expect(tty).toBeFocused();
  await page.keyboard.press("b");
  expect((await state(page)).consoleInput).toEqual([98]);
  expect((await state(page)).kmsKeys).toEqual([]);
  await menu.click();
  await page.getByRole("button", { name: "Reset disk", exact: true }).click();
  const confirmation = page.getByLabel("Type pocketosix to confirm");
  await confirmation.focus();
  await page.setViewportSize({ width: 1440, height: 960 });
  await expect(confirmation).toBeFocused();
  await page.keyboard.type("pocketosix");
  await expect(confirmation).toHaveValue("pocketosix");
  expect((await state(page)).kmsKeys).toEqual([]);
  expect((await state(page)).consoleInput).toEqual([98]);
  await page.getByRole("button", { name: "Keep my disk", exact: true }).click();
  await expect(menu).toBeFocused();
});

test("HTML fullscreen includes body-level native KMS and leaves keyboard operational", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
  await page.locator(".linux-canvas").click({ position: { x: 200, y: 200 } });
  await expect(page.locator(inputSelector)).toBeFocused();
  await page.keyboard.press("Alt+Enter");
  expect((await state(page)).kmsKeys).toEqual(["Alt", "Enter"]);
  await page.evaluate(() => document.exitFullscreen());
  await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
  expect(errors).toEqual([]);
});

test("closing a dialog cannot restore stale focus over a subsequent canvas interaction", async ({ page }) => {
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  await page.getByRole("button", { name: "Reset disk", exact: true }).click();
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
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.locator(".linux-canvas").click({ position: { x: 200, y: 200 } });
  await expect(page.locator(inputSelector)).toBeFocused();
  await page.evaluate(() => (window as unknown as { __releaseFocusFrames: () => void }).__releaseFocusFrames());
  await expect(page.locator(inputSelector)).toBeFocused();
  await page.keyboard.press("c");
  expect((await state(page)).kmsKeys).toEqual(["c"]);
});
