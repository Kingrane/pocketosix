import { test, expect, type Locator, type Page } from "@playwright/test";
import { mockSDK, MOCK_SDK_URL, type MockSDKState } from "./mock-sdk";

// Mock SDK frames and captured input exercise browser UI contracts only.
// These tests do not prove Linux boot, guest shortcuts or durable disk writes.
const OVERLAY_ID = "pocketosix-alpine-20251007-v1";
const KMS_INPUT = "body > textarea[data-pocketosix-kms-input]";
const panels = ["display", "terminal", "disk", "network", "shortcuts", "logs"] as const;
const headings = { display: "Display", terminal: "Terminal", disk: "Disk", network: "Network", shortcuts: "Keyboard shortcuts", logs: "Logs" };
type FixtureWindow = Window & {
  __pocketTest: MockSDKState;
  __desktopNodes: { canvas: Element | null; console: Element | null; panel: Element | null };
  __desktopDocument?: boolean;
  __keyProbe: { type: string; key: string }[];
  __fullscreenExitCalls: number;
};

test.beforeEach(async ({ context }) => { await mockSDK(context, { nativeKms: true }); });

const state = (page: Page) => page.evaluate(() => (window as unknown as FixtureWindow).__pocketTest);
const trigger = (page: Page, name: typeof panels[number]) => page.locator(`[data-panel-trigger="${name}"]`);
const toolbar = (page: Page) => page.getByRole("navigation", { name: "Desktop controls", exact: true });

async function boot(page: Page) {
  await page.getByRole("button", { name: "> boot", exact: true }).click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-vm-phase", "ready");
  await expect(page.locator(KMS_INPUT)).toBeAttached();
}

async function openRun(page: Page) { await page.goto("/run"); await boot(page); }

async function rect(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

async function rememberNodes(page: Page) {
  await page.evaluate(() => {
    (window as unknown as FixtureWindow).__desktopNodes = { canvas: document.querySelector(".linux-canvas"), console: document.querySelector(".system-console"), panel: document.querySelector("#desktop-panel") };
  });
}

async function expectSameNodes(page: Page) {
  expect(await page.evaluate(() => {
    const nodes = (window as unknown as FixtureWindow).__desktopNodes;
    return nodes.canvas === document.querySelector(".linux-canvas") && nodes.console === document.querySelector(".system-console") && nodes.panel === document.querySelector("#desktop-panel") && Object.values(nodes).every((node) => node?.isConnected);
  })).toBe(true);
}

async function openTerminal(page: Page) {
  await trigger(page, "terminal").click();
  await page.locator("#desktop-panel").getByRole("button", { name: "Open terminal", exact: true }).click();
  const input = page.locator(".xterm-helper-textarea");
  await expect(input).toBeAttached();
  await input.focus();
  return input;
}

async function enterImmersive(page: Page) {
  await page.getByRole("button", { name: "Immersive", exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
  await expect(page.locator(".app-shell")).toHaveAttribute("data-mode", "immersive");
  await expect(page.locator(KMS_INPUT)).toBeFocused();
}

async function revealControls(page: Page) {
  await page.mouse.move(page.viewportSize()!.width / 2, 12);
  await expect(toolbar(page)).toHaveCSS("opacity", "1");
  await toolbar(page).hover();
}

test("direct /run and preboot rail panels make no SDK/CDN request or mock session", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => { if (request.url() === MOCK_SDK_URL || /cxrtnc\.leaningtech\.com|disks\.webvm\.io/.test(request.url())) requests.push(request.url()); });
  await page.goto("/run");
  await expect(page.locator(".app-shell")).toHaveAttribute("data-vm-phase", "idle");
  await expect(page.locator(".app-shell")).toHaveAttribute("data-mode", "docked");
  await expect(page.getByRole("button", { name: "> boot", exact: true })).toBeEnabled();
  await expect(page.locator(".system-console")).toBeAttached();
  await expect(toolbar(page)).not.toBeAttached();
  for (const name of panels) {
    await trigger(page, name).click();
    await expect(page.locator("#desktop-panel")).toBeVisible();
    if (name === "display") await expect(page.getByRole("button", { name: "Lock pointer", exact: true })).toBeDisabled();
    if (name === "terminal") await expect(page.locator("#desktop-panel").getByRole("button", { name: "Open terminal", exact: true })).toBeDisabled();
    if (name === "disk") {
      await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
      await expect(page.getByRole("button", { name: "Restart", exact: true })).toBeDisabled();
      await expect(page.getByRole("button", { name: "Reset disk", exact: true })).toBeDisabled();
    }
    if (name === "network") await expect(page.getByRole("button", { name: "Connect Tailscale", exact: true })).toBeDisabled();
    expect(await page.evaluate(() => "__pocketTest" in window)).toBe(false);
  }
  await trigger(page, "logs").click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  expect(requests).toEqual([]);
  await expect(page.locator(".app-shell")).toHaveAttribute("data-vm-phase", "idle");
});

test("48px rail and 8px inset become one 320px pushing panel; switching and repeat-collapse reuse canvas, pre and dialog", async ({ page }) => {
  await openRun(page);
  const rail = page.getByRole("navigation", { name: "Desktop rail", exact: true });
  const stage = page.locator(".desktop-stage");
  const panel = page.locator("#desktop-panel");
  const viewport = page.viewportSize()!;
  const collapsed = await rect(stage);
  expect((await rect(rail)).width).toBeCloseTo(48, 0);
  expect(collapsed.x).toBeCloseTo(56, 0);
  expect(collapsed.y).toBeCloseTo(8, 0);
  expect(viewport.width - collapsed.x - collapsed.width).toBeCloseTo(8, 0);
  expect(viewport.height - collapsed.y - collapsed.height).toBeCloseTo(8, 0);
  await expect(stage).toHaveCSS("border-radius", "10px");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await rememberNodes(page);
  for (const name of ["disk", "display", "terminal", "network", "shortcuts", "logs"] as const) {
    await trigger(page, name).click();
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("heading", { level: 2 })).toHaveCount(1);
    await expect(panel.getByRole("heading", { level: 2 })).toHaveText(headings[name]);
    await expect(page.locator("dialog[open]")).toHaveCount(1);
    await expect(page.locator('[data-panel-trigger][aria-expanded="true"]')).toHaveCount(1);
    await expect(trigger(page, name)).toHaveAttribute("aria-expanded", "true");
    expect(await panel.evaluate((node) => node.matches(":modal"))).toBe(false);
    expect((await rect(panel)).x).toBeCloseTo(48, 0);
    expect((await rect(panel)).width).toBeCloseTo(320, 0);
    const expanded = await rect(stage);
    expect(expanded.x - collapsed.x).toBeCloseTo(320, 0);
    expect(collapsed.width - expanded.width).toBeCloseTo(320, 0);
    await expectSameNodes(page);
  }
  await expect(page.locator(".system-console")).toContainText("[test fixture] init started");
  await trigger(page, "logs").click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(trigger(page, "logs")).toHaveAttribute("aria-expanded", "false");
  expect(await rect(stage)).toEqual(collapsed);
  await expect(page.locator(".system-console")).toBeAttached();
  await expectSameNodes(page);
  expect((await state(page)).boots).toBe(1);
});

for (const locale of ["en", "ru"] as const) {
  test(`390px ${locale} panels overlay without shrinking the canvas or horizontal text overflow`, async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "pocketosix-locale", value: locale, url: baseURL! }]);
    await page.setViewportSize({ width: 390, height: 844 });
    await openRun(page);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    const stageBox = await rect(page.locator(".desktop-stage"));
    const canvasBox = await rect(page.locator(".linux-canvas"));
    await rememberNodes(page);
    for (const name of panels) {
      await trigger(page, name).click();
      const panel = page.locator("#desktop-panel");
      await expect(panel).toBeVisible();
      const box = await rect(panel);
      expect(box.x).toBeCloseTo(48, 0);
      expect(box.width).toBeCloseTo(320, 0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
      await expect(panel.getByRole("heading", { level: 2 })).toHaveCount(1);
      expect(await panel.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await rect(page.locator(".desktop-stage"))).toEqual(stageBox);
      expect(await rect(page.locator(".linux-canvas"))).toEqual(canvasBox);
      await expect(page.locator("#main-content")).toHaveAttribute("inert", "");
      await expectSameNodes(page);
    }
    await trigger(page, "logs").click();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect(page.locator("#main-content")).not.toHaveAttribute("inert", "");
    expect(await rect(page.locator(".linux-canvas"))).toEqual(canvasBox);
  });
}

test("boot stepper shows real completed checks and a single current pulse", async ({ page, context }) => {
  await mockSDK(context, { nativeKms: true, blackFrame: true });
  await page.goto("/run");
  await page.getByRole("button", { name: "> boot", exact: true }).click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-vm-phase", "starting");
  const steps = page.getByRole("list", { name: "Startup stages", exact: true });
  await expect(steps.locator("li > svg")).toHaveCount(3);
  await expect(steps.locator('[aria-current="step"]')).toHaveCount(1);
  await expect(steps.locator('[aria-current="step"]')).toHaveText("Starting Xorg & i3");
  await expect(steps.locator('[aria-current="step"] > span')).toHaveCSS("animation-duration", "1.8s");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(steps.locator('[aria-current="step"] > span')).toHaveCSS("animation-name", "none");
});

test("Ctrl+K is delivered to native KMS and tty1, but opens the palette from browser UI focus", async ({ page }) => {
  await openRun(page);
  await page.locator(".linux-canvas").focus();
  await expect(page.locator(KMS_INPUT)).toBeFocused();
  await page.keyboard.press("Control+k");
  expect((await state(page)).kmsKeys).toEqual(["Control", "k"]);
  await expect(page.locator("dialog:modal")).toHaveCount(0);
  const tty = await openTerminal(page);
  await page.keyboard.press("Control+k");
  await expect.poll(async () => (await state(page)).consoleInput).toEqual([11]);
  await expect(tty).toBeFocused();
  await expect(page.locator("dialog:modal")).toHaveCount(0);
  await trigger(page, "display").focus();
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Command palette", exact: true });
  const search = palette.getByRole("textbox", { name: "Search actions…", exact: true });
  await expect(search).toBeFocused();
  await search.fill("Disk");
  await expect(palette.getByRole("button", { name: "Disk", exact: true })).toBeVisible();
  await expect(palette.getByRole("button", { name: "Network", exact: true })).toHaveCount(0);
  await palette.getByRole("button", { name: "Disk", exact: true }).click();
  await expect(page.locator("#desktop-panel")).toHaveAccessibleName("Disk");
  expect((await state(page)).consoleInput).toEqual([11]);
});

test("only the documented M chord is intercepted from KMS and tty1; modifier events and other guest keys remain guest-owned", async ({ page }) => {
  await openRun(page);
  await page.evaluate(() => {
    (window as unknown as FixtureWindow).__keyProbe = [];
    for (const type of ["keydown", "keyup"]) document.addEventListener(type, (event) => {
      (window as unknown as FixtureWindow).__keyProbe.push({ type, key: (event as KeyboardEvent).key });
    });
  });
  await page.locator(".linux-canvas").focus();
  await page.keyboard.press("Control+Alt+Shift+n");
  expect((await state(page)).kmsKeys).toEqual(["Control", "Alt", "Shift", "n"]);
  await expect(page.locator("dialog:modal")).toHaveCount(0);
  await page.keyboard.press("Control+Alt+Shift+m");
  const menu = page.getByRole("dialog", { name: "Desktop menu", exact: true });
  await expect(menu).toBeVisible();
  const keys = (await state(page)).kmsKeys;
  expect(keys.slice(4)).toEqual(["Control", "Alt", "Shift"]);
  const events = await page.evaluate(() => (window as unknown as FixtureWindow).__keyProbe);
  expect(events.some((event) => event.key.toLowerCase() === "m")).toBe(false);
  expect(events.filter((event) => event.type === "keydown").slice(0, 4).map((event) => event.key)).toEqual(["Control", "Alt", "Shift", "n"]);
  await menu.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator(KMS_INPUT)).toBeFocused();
  const tty = await openTerminal(page);
  await page.keyboard.press("Control+Alt+Shift+m");
  await expect(menu).toBeVisible();
  expect((await state(page)).consoleInput).toEqual([]);
  await menu.getByRole("button", { name: "Close", exact: true }).click();
  await expect(tty).toBeFocused();
});

test("a nonmodal docked panel permits tty1 sends; a modal menu or reset blocks even synthetic sends", async ({ page }) => {
  await openRun(page);
  const tty = await openTerminal(page);
  await page.keyboard.press("a");
  await expect.poll(async () => (await state(page)).consoleInput).toEqual([97]);
  await trigger(page, "logs").click();
  expect(await page.locator("#desktop-panel").evaluate((node) => node.matches(":modal"))).toBe(false);
  await tty.focus();
  await page.keyboard.press("b");
  await expect.poll(async () => (await state(page)).consoleInput).toEqual([97, 98]);
  await page.keyboard.press("Control+Alt+Shift+m");
  const menu = page.getByRole("dialog", { name: "Desktop menu", exact: true });
  await expect(menu).toBeVisible();
  const key = { key: "a", code: "KeyA", keyCode: 65, which: 65, bubbles: true, cancelable: true };
  await tty.dispatchEvent("keydown", key);
  expect((await state(page)).consoleInput).toEqual([97, 98]);
  await menu.getByRole("button", { name: "Disk", exact: true }).click();
  await page.locator("#desktop-panel").getByRole("button", { name: "Reset disk", exact: true }).click();
  const confirmation = page.getByLabel("Type pocketosix to confirm", { exact: true });
  await expect(confirmation).toBeFocused();
  await page.keyboard.type("pocketosix");
  await tty.dispatchEvent("keydown", key);
  expect((await state(page)).consoleInput).toEqual([97, 98]);
  expect((await state(page)).kmsKeys).toEqual([]);
  await expect(confirmation).toHaveValue("pocketosix");
  await page.getByRole("button", { name: "Keep my disk", exact: true }).click();
  await tty.dispatchEvent("keydown", key);
  await expect.poll(async () => (await state(page)).consoleInput).toEqual([97, 98, 97]);
});

test("menu starts with Back to home; Leave focuses Stay and ignores Escape and backdrop without reset", async ({ page }) => {
  await openRun(page);
  await page.locator(".linux-canvas").focus();
  await page.keyboard.press("Control+Alt+Shift+m");
  const menu = page.getByRole("dialog", { name: "Desktop menu", exact: true });
  const home = menu.getByRole("button", { name: "Back to home", exact: true });
  expect(await home.evaluate((button) => button.parentElement?.firstElementChild === button)).toBe(true);
  await home.click();
  const leave = page.getByRole("dialog", { name: "Leave desktop?", exact: true });
  const stay = leave.getByRole("button", { name: "Stay", exact: true });
  await expect(stay).toBeFocused();
  await expect(leave).toContainText("Files already committed");
  await expect(leave).toContainText("pending changes may be lost");
  await page.keyboard.press("Escape");
  await expect(leave).toBeVisible();
  expect(await leave.evaluate((node) => node.matches(":modal"))).toBe(true);
  await page.mouse.click(4, 4);
  await expect(leave).toBeVisible();
  const previous = await state(page);
  await stay.click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.locator(KMS_INPUT)).toBeFocused();
  expect((await state(page)).kmsKeys).toEqual(previous.kmsKeys);
  expect((await state(page)).resets).toBe(0);
  expect(await page.evaluate(() => sessionStorage.getItem("pocketosix:reset-disk"))).toBeNull();
  await page.getByRole("navigation", { name: "Desktop rail", exact: true }).getByRole("button", { name: "Exit to home", exact: true }).click();
  await expect(stay).toBeFocused();
  await stay.click();
  await expect(page.getByRole("navigation", { name: "Desktop rail", exact: true }).getByRole("button", { name: "Exit to home", exact: true })).toBeFocused();
});

test("Leave hard-navigates to a new document without resetting the mock disk and releases its lock for the other tab", async ({ page, context }) => {
  await openRun(page);
  expect((await state(page)).rootOverlayId).toBe(OVERLAY_ID);
  expect(await page.evaluate(async (id) => (await navigator.locks.query()).held?.some((lock) => lock.name === id), OVERLAY_ID)).toBe(true);
  await page.evaluate(() => {
    (window as unknown as FixtureWindow).__desktopDocument = true;
    localStorage.setItem("pocketosix:ui-test-kept", "retained");
    addEventListener("pagehide", () => {
      const snapshot = (window as unknown as FixtureWindow).__pocketTest;
      sessionStorage.setItem("pocketosix:ui-test-left", JSON.stringify({ resets: snapshot.resets, deletes: snapshot.deletes, overlay: snapshot.rootOverlayId }));
    }, { once: true });
  });
  const other = await context.newPage();
  await other.goto("/run");
  expect(await other.evaluate(() => "__pocketTest" in window)).toBe(false);
  await other.getByRole("button", { name: "> boot", exact: true }).click();
  await expect(other.getByRole("heading", { name: "Your disk is open in another tab.", exact: true })).toBeVisible();
  expect(await other.evaluate(() => "__pocketTest" in window)).toBe(false);
  const navigations: string[] = [];
  page.on("request", (request) => { if (request.isNavigationRequest() && new URL(request.url()).pathname === "/") navigations.push(request.url()); });
  await page.getByRole("navigation", { name: "Desktop rail", exact: true }).getByRole("button", { name: "Exit to home", exact: true }).click();
  await Promise.all([page.waitForEvent("load"), page.getByRole("dialog", { name: "Leave desktop?", exact: true }).getByRole("button", { name: "Leave", exact: true }).click()]);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".app-shell")).not.toBeAttached();
  expect(navigations).toHaveLength(1);
  expect(await page.evaluate(() => "__desktopDocument" in window || "__pocketTest" in window)).toBe(false);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("pocketosix:ui-test-left")!))).toEqual({ resets: 0, deletes: 0, overlay: OVERLAY_ID });
  expect(await page.evaluate(() => localStorage.getItem("pocketosix:ui-test-kept"))).toBe("retained");
  expect(await page.evaluate(() => sessionStorage.getItem("pocketosix:reset-disk"))).toBeNull();
  await expect.poll(() => page.evaluate(async (id) => (await navigator.locks.query()).held?.some((lock) => lock.name === id) ?? false, OVERLAY_ID)).toBe(false);
  await other.reload();
  await boot(other);
  expect((await state(other)).rootOverlayId).toBe(OVERLAY_ID);
  expect((await state(other)).boots).toBe(1);
  expect((await state(other)).resets).toBe(0);
  await other.close();
});

test("HTML immersive includes body KMS; 40x4 notch and timed pill never resize canvas, and drawer close restores guest focus", async ({ page }) => {
  await page.clock.install();
  await openRun(page);
  await rememberNodes(page);
  await enterImmersive(page);
  await expect(page.getByRole("navigation", { name: "Desktop rail", exact: true })).not.toBeVisible();
  expect(await page.locator(KMS_INPUT).evaluate((input) => input.parentElement === document.body && document.fullscreenElement?.contains(input))).toBe(true);
  const canvas = page.locator(".linux-canvas");
  const full = await rect(canvas);
  const size = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  expect(full).toEqual({ x: 0, y: 0, width: size.width, height: size.height });
  await revealControls(page);
  const pill = await rect(toolbar(page));
  expect(pill.y).toBeGreaterThanOrEqual(56);
  expect(pill.height).toBeCloseTo(40, 0);
  const notch = await rect(page.getByRole("button", { name: "Show desktop controls", exact: true }).locator("span"));
  expect(notch.width).toBeCloseTo(40, 0);
  expect(notch.height).toBeCloseTo(4, 0);
  expect(await rect(canvas)).toEqual(full);
  await canvas.focus();
  await page.mouse.move(size.width / 2, size.height / 2);
  await page.clock.fastForward(2500);
  await expect(toolbar(page)).toHaveCSS("opacity", "0");
  await expect(toolbar(page)).toHaveCSS("pointer-events", "none");
  await expect(toolbar(page)).toHaveAttribute("inert", "");
  expect(await rect(canvas)).toEqual(full);
  await revealControls(page);
  await page.clock.fastForward(2500);
  await expect(toolbar(page)).toHaveCSS("opacity", "1");
  expect(await rect(canvas)).toEqual(full);
  await toolbar(page).getByRole("button", { name: "Keyboard shortcuts", exact: true }).click();
  const drawer = page.locator("#desktop-panel");
  await expect(drawer).toBeVisible();
  expect(await drawer.evaluate((node) => node.matches(":modal"))).toBe(true);
  expect((await rect(drawer)).width).toBeCloseTo(360, 0);
  await expect(page.locator("#main-content")).toHaveAttribute("inert", "");
  await page.keyboard.press("Tab");
  await expect.poll(() => drawer.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Shift+Tab");
  await expect.poll(() => drawer.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  expect(await rect(canvas)).toEqual(full);
  await drawer.getByRole("button", { name: "Close panel", exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await expect(page.locator(KMS_INPUT)).toBeFocused();
  expect(await page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
  await expectSameNodes(page);
  await revealControls(page);
  await toolbar(page).getByRole("button", { name: "Exit immersive", exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-mode", "docked");
  expect((await state(page)).boots).toBe(1);
});

test("delivered guest Escape does not call the app fullscreen exit; trusted Escape remains a browser decision", async ({ page }) => {
  await openRun(page);
  await enterImmersive(page);
  await page.evaluate(() => {
    (window as unknown as FixtureWindow).__fullscreenExitCalls = 0;
    const exit = document.exitFullscreen.bind(document);
    document.exitFullscreen = () => { (window as unknown as FixtureWindow).__fullscreenExitCalls++; return exit(); };
  });
  // A synthetic delivered event avoids conflating Chromium's native Escape
  // fullscreen shortcut with an application keyboard handler or a Linux key.
  await page.locator(KMS_INPUT).dispatchEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true });
  expect((await state(page)).kmsKeys).toEqual(["Escape"]);
  expect(await page.evaluate(() => (window as unknown as FixtureWindow).__fullscreenExitCalls)).toBe(0);
  expect(await page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => (window as unknown as FixtureWindow).__fullscreenExitCalls)).toBe(0);
});

test("browser fullscreen exit cannot dismiss a Leave confirmation", async ({ page }) => {
  await openRun(page);
  await page.getByRole("button", { name: "Immersive", exact: true }).click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-mode", "immersive");
  await page.locator(".linux-canvas").focus();
  await page.keyboard.press("Control+Alt+Shift+m");
  await page.getByRole("dialog", { name: "Desktop menu", exact: true }).getByRole("button", { name: "Back to home", exact: true }).click();
  const leave = page.getByRole("dialog", { name: "Leave desktop?", exact: true });
  await expect(leave.getByRole("button", { name: "Stay", exact: true })).toBeFocused();
  await page.evaluate(() => document.exitFullscreen());
  await expect(page.locator(".app-shell")).toHaveAttribute("data-mode", "docked");
  await expect(leave).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(leave).toBeVisible();
  expect((await state(page)).resets).toBe(0);
});

test("a rejected browser Fullscreen request leaves the UI docked and reports a localized alert", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Element.prototype, "requestFullscreen", { configurable: true, value: () => Promise.reject(new DOMException("Test-only denial", "NotAllowedError")) });
  });
  await openRun(page);
  const before = await rect(page.locator(".linux-canvas"));
  await page.getByRole("button", { name: "Immersive", exact: true }).click();
  await expect(page.locator(".app-shell").getByRole("alert")).toContainText("The browser did not allow fullscreen. Continue in the window.");
  await expect(page.locator(".app-shell")).toHaveAttribute("data-mode", "docked");
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
  expect(await rect(page.locator(".linux-canvas"))).toEqual(before);
  expect((await state(page)).boots).toBe(1);
});
