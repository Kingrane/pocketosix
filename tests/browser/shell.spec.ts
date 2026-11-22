import { test, expect, type Page } from "@playwright/test";
import { mockSDK, MOCK_SDK_URL, type MockSDKState } from "./mock-sdk";

// Deterministic shell/controller contracts only. Mock frames, init output and
// captured tty1 input are not evidence that Alpine, Xorg or a shell really boot.
const OVERLAY_ID = "pocketosix-alpine-20251007-v1";

test.beforeEach(async ({ context }) => {
  await mockSDK(context);
});

async function mockState(page: Page) {
  return page.evaluate(() => (window as unknown as { __pocketTest: MockSDKState }).__pocketTest);
}

function activeDialog(page: Page) {
  // The panel and its log node stay mounted, even closed.
  return page.locator("dialog[open]");
}

function toolbar(page: Page) {
  return page.locator("nav[data-desktop-toolbar]");
}

function rail(page: Page) {
  return page.getByRole("navigation", { name: "Desktop rail", exact: true });
}

async function revealToolbar(page: Page) {
  const russian = await page.locator("html").getAttribute("lang") === "ru";
  await page.getByRole("button", { name: russian ? "Показать управление рабочим столом" : "Show desktop controls", exact: true }).hover();
  // Opacity-hidden controls still satisfy Playwright's toBeVisible().
  await expect(toolbar(page)).toHaveCSS("opacity", "1");
}

async function openMenu(page: Page) {
  if (await toolbar(page).count()) {
    await revealToolbar(page);
    await toolbar(page).getByRole("button", { name: "Open menu", exact: true }).click();
  } else {
    await rail(page).getByRole("button", { name: "Disk", exact: true }).focus();
    await page.keyboard.press("Control+Alt+Shift+m");
  }
  await expect(activeDialog(page)).toHaveAccessibleName("Desktop menu");
  await expect(activeDialog(page)).toBeVisible();
  return activeDialog(page);
}

async function openTerminal(page: Page) {
  await rail(page).getByRole("button", { name: "Terminal", exact: true }).click();
  await activeDialog(page).getByRole("button", { name: "Open terminal", exact: true }).click();
  await expect(activeDialog(page)).toHaveCount(0);
  const terminal = page.getByRole("region", { name: "Guest terminal tty1", exact: true });
  await expect(terminal.locator(".xterm-helper-textarea")).toBeAttached();
  return terminal;
}

async function openReset(page: Page) {
  await rail(page).getByRole("button", { name: "Disk", exact: true }).click();
  await activeDialog(page).getByRole("button", { name: "Reset disk", exact: true }).click();
  await expect(activeDialog(page)).toHaveAccessibleName("Start with a clean disk?");
  await expect(activeDialog(page)).toBeVisible();
  return activeDialog(page);
}

async function expectPreflight(page: Page) {
  await expect(page.locator(".app-shell")).toHaveAttribute("data-vm-phase", "idle");
  await expect(page.getByTestId("boot-screen")).toBeVisible();
  await expect(page.getByRole("button", { name: "> boot", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => "__pocketTest" in window)).toBe(false);
}

async function boot(page: Page) {
  await page.getByRole("button", { name: "> boot", exact: true }).click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-vm-phase", "ready");
}

async function openRun(page: Page) {
  await page.goto("/run");
  await expectPreflight(page);
  await boot(page);
}

test("isolated English preflight imports no SDK; a double boot click creates one mock session in StrictMode", async ({ page }) => {
  const sdkRequests: string[] = [];
  page.on("request", (request) => { if (request.url() === MOCK_SDK_URL) sdkRequests.push(request.url()); });
  await page.addInitScript(() => {
    localStorage.setItem("pocketosix-locale", "ru");
    Object.defineProperty(navigator, "language", { configurable: true, get: () => "ru-RU" });
  });
  const response = await page.goto("/run");
  expect(response?.headers()["cross-origin-opener-policy"]).toBe("same-origin");
  expect(response?.headers()["cross-origin-embedder-policy"]).toBe("require-corp");
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expectPreflight(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Open your desktop.");
  await expect(toolbar(page)).not.toBeAttached();
  await expect(page.locator(".workspace-bar, .workspace-nav, [data-active-workspace]")).not.toBeAttached();
  expect(sdkRequests).toEqual([]);
  await page.getByRole("button", { name: "> boot", exact: true }).dblclick();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-vm-phase", "ready");
  const state = await mockState(page);
  expect(sdkRequests).toHaveLength(1);
  expect(state.creates).toBe(1);
  expect(state.boots).toBe(1);
  expect(state.init).toEqual({ filename: "/sbin/init", args: [], options: { uid: 0, gid: 0 } });
  expect(state.mounts).toEqual([
    { type: "ext2", path: "/" }, { type: "dir", path: "/web" }, { type: "devs", path: "/dev" },
    { type: "devpts", path: "/dev/pts" }, { type: "proc", path: "/proc" }, { type: "sys", path: "/sys" },
  ]);
  expect(state.rootOverlayId).toBe(OVERLAY_ID);
  expect(state.webPath).toBe("");
  expect(state.resets).toBe(0);
  await expect(page.getByTestId("boot-screen")).not.toBeAttached();
  await expect(rail(page).getByRole("status")).toHaveAccessibleName("Running");
});

test("missing isolation disables boot and shows only the failed check without importing SDK", async ({ page }) => {
  const sdkRequests: string[] = [];
  page.on("request", (request) => { if (request.url() === MOCK_SDK_URL) sdkRequests.push(request.url()); });
  await page.addInitScript(() => Object.defineProperty(window, "crossOriginIsolated", { get: () => false }));
  await page.goto("/run");
  const preflight = page.getByTestId("boot-screen");
  await expect(preflight).toBeVisible();
  await expect(preflight.getByRole("heading", { level: 1 })).toHaveText("This browser needs a change.");
  await expect(preflight.getByRole("button", { name: "> boot", exact: true })).toBeDisabled();
  await expect(preflight.getByRole("listitem")).toHaveCount(1);
  await expect(preflight.getByRole("listitem")).toContainText("Cross-origin isolation");
  await expect(preflight.getByRole("listitem")).toContainText("COOP and COEP");
  await expect(preflight).toContainText("Resolve these checks before starting Alpine.");
  await expect(page.locator(".app-shell")).toHaveAttribute("data-vm-phase", "idle");
  expect(await page.evaluate(() => "__pocketTest" in window)).toBe(false);
  expect(sdkRequests).toEqual([]);
  await page.reload();
  await expect(preflight.getByRole("button", { name: "> boot", exact: true })).toBeDisabled();
  expect(sdkRequests).toEqual([]);
});

test("mock VT7 waits for a non-uniform frame without stealing the tty1 focus", async ({ page, context }) => {
  await mockSDK(context, { blackFrame: true });
  await page.goto("/run");
  await expectPreflight(page);
  await page.getByRole("button", { name: "> boot", exact: true }).click();
  await expect.poll(async () => (await mockState(page))?.boots).toBe(1);
  await expect(page.locator(".app-shell")).toHaveAttribute("data-vm-phase", "starting");
  await expect(page.getByTestId("boot-screen")).toBeVisible();
  await page.getByRole("button", { name: "Open terminal", exact: true }).click();
  const input = page.locator(".xterm-helper-textarea");
  await expect(input).toBeAttached();
  await input.focus();
  // Let the tile's ResizeObserver finish before changing the fixture's frame.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.locator(".linux-canvas").evaluate((canvas: HTMLCanvasElement) => {
    const context = canvas.getContext("2d")!;
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width / 2, canvas.height / 2);
  });
  await expect(page.locator(".app-shell")).toHaveAttribute("data-vm-phase", "ready");
  await expect(input).toBeFocused();
  expect((await mockState(page)).boots).toBe(1);
});

test("a second tab only checks the writable disk lock after its boot click", async ({ page, context }) => {
  await openRun(page);
  const second = await context.newPage();
  await second.goto("/run");
  await expectPreflight(second);
  await second.getByRole("button", { name: "> boot", exact: true }).click();
  await expect(second.getByRole("heading", { name: "Your disk is open in another tab.", exact: true })).toBeVisible();
  await expect(second.locator(".app-shell")).toHaveAttribute("data-vm-phase", "error");
  expect(await second.evaluate(() => "__pocketTest" in window)).toBe(false);
  expect((await mockState(page)).resets).toBe(0);
  await page.close();
  await second.reload();
  await expectPreflight(second);
  await boot(second);
  expect((await mockState(second)).boots).toBe(1);
  expect((await mockState(second)).rootOverlayId).toBe(OVERLAY_ID);
});

test("immersive shortcuts drawer traps focus and returns it to the guest", async ({ page }) => {
  await openRun(page);
  await rail(page).getByRole("button", { name: "Immersive", exact: true }).click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-mode", "immersive");
  await revealToolbar(page);
  const opener = toolbar(page).getByRole("button", { name: "Keyboard shortcuts", exact: true });
  await opener.focus();
  await page.keyboard.press("Enter");
  const drawer = activeDialog(page);
  await expect(drawer).toHaveAccessibleName("Shortcuts");
  await expect(drawer.getByRole("heading", { name: "Keyboard shortcuts", exact: true })).toBeVisible();
  expect(await drawer.evaluate((element) => element.matches(":modal"))).toBe(true);
  await expect(page.locator("#main-content")).toHaveAttribute("inert", "");
  await expect.poll(() => drawer.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Tab");
  await expect.poll(() => drawer.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Shift+Tab");
  await expect.poll(() => drawer.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await drawer.getByRole("button", { name: "Close panel", exact: true }).click();
  await expect(activeDialog(page)).toHaveCount(0);
  await expect(page.locator("#main-content")).not.toHaveAttribute("inert", "");
  await expect(page.locator(".linux-canvas")).toBeFocused();
});

test("logs remain attached to the controller and typed reset confirmation can be cancelled without deletion", async ({ page }) => {
  await openRun(page);
  const opener = rail(page).getByRole("button", { name: "Logs", exact: true });
  await opener.click();
  const logs = activeDialog(page);
  await expect(logs).toHaveAccessibleName("Logs");
  expect(await logs.evaluate((element) => element.matches(":modal"))).toBe(false);
  await expect(logs.locator(".system-console")).toContainText("[test fixture] init started");
  await logs.getByRole("button", { name: "Close panel", exact: true }).click();
  await expect(activeDialog(page)).toHaveCount(0);
  await expect(page.locator(".system-console")).toBeAttached();
  await expect(opener).toBeFocused();
  const reset = await openReset(page);
  const confirm = reset.getByRole("button", { name: "Delete disk data", exact: true });
  await expect(confirm).toBeDisabled();
  const input = reset.getByLabel("Type pocketosix to confirm", { exact: true });
  await input.fill("wrong");
  await expect(confirm).toBeDisabled();
  await input.fill("pocketosix ");
  await expect(confirm).toBeDisabled();
  await input.fill("pocketosix");
  await expect(confirm).toBeEnabled();
  await reset.getByRole("button", { name: "Keep my disk", exact: true }).click();
  await expect(activeDialog(page)).toHaveCount(0);
  await expect(rail(page).getByRole("button", { name: "Disk", exact: true })).toBeFocused();
  expect((await mockState(page)).resets).toBe(0);
  expect(await page.evaluate(() => sessionStorage.getItem("pocketosix:reset-disk"))).toBeNull();
});

test("terminal panel opens xterm UI wired to the mock console; reopen does not boot again", async ({ page }) => {
  await openRun(page);
  const terminal = await openTerminal(page);
  await expect(terminal.locator(".xterm-helper-textarea")).toBeAttached();
  const input = terminal.locator(".xterm-helper-textarea");
  await input.focus();
  await page.keyboard.press("a");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await mockState(page)).consoleInput).toEqual([97, 13]);
  expect((await mockState(page)).consoleSize).toEqual({ columns: 100, rows: 30 });
  await terminal.getByRole("button", { name: "Close terminal", exact: true }).click();
  await expect(input).not.toBeAttached();
  const reopened = await openTerminal(page);
  const reopenedInput = reopened.locator(".xterm-helper-textarea");
  await reopenedInput.focus();
  await page.keyboard.press("b");
  await expect.poll(async () => (await mockState(page)).consoleInput).toEqual([97, 13, 98]);
  const state = await mockState(page);
  expect(state.consoleSize).toEqual({ columns: 100, rows: 30 });
  expect(state.creates).toBe(1);
  expect(state.boots).toBe(1);
  expect(state.deletes).toBe(0);
  expect(state.resets).toBe(0);
});

test("native drawer and reset dialog block synthetic xterm sends while browser confirmation keys stay local", async ({ page }) => {
  await openRun(page);
  const terminal = await openTerminal(page);
  const input = terminal.locator(".xterm-helper-textarea");
  const key = { key: "a", code: "KeyA", keyCode: 65, which: 65, bubbles: true, cancelable: true };
  // Control: the identical synthetic key really emits xterm onData before a modal.
  // The separate keyboard test covers actual user input, not this probe.
  await input.dispatchEvent("keydown", key);
  await expect.poll(async () => (await mockState(page)).consoleInput).toEqual([97]);
  const drawer = await openMenu(page);
  await input.dispatchEvent("keydown", key);
  expect((await mockState(page)).consoleInput).toEqual([97]);
  await drawer.getByRole("button", { name: "Disk", exact: true }).click();
  await activeDialog(page).getByRole("button", { name: "Reset disk", exact: true }).click();
  const reset = activeDialog(page);
  const confirmation = reset.getByLabel("Type pocketosix to confirm", { exact: true });
  await confirmation.focus();
  await page.keyboard.type("pocketosix");
  await input.dispatchEvent("keydown", key);
  expect((await mockState(page)).consoleInput).toEqual([97]);
  await expect(confirmation).toHaveValue("pocketosix");
  await reset.getByRole("button", { name: "Keep my disk", exact: true }).click();
  await expect(activeDialog(page)).toHaveCount(0);
  await input.dispatchEvent("keydown", key);
  await expect.poll(async () => (await mockState(page)).consoleInput).toEqual([97, 97]);
});

test("guest networking is opt-in and login has a popup-blocking fallback", async ({ page, context }) => {
  await page.addInitScript(() => {
    const calls: string[] = [];
    Object.defineProperty(window, "__popupCalls", { value: calls });
    window.open = (url) => { calls.push(String(url)); return null; };
  });
  await openRun(page);
  expect(context.pages()).toHaveLength(1);
  await rail(page).getByRole("button", { name: "Network", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Network", exact: true });
  await expect(drawer.getByText("Off", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __popupCalls: string[] }).__popupCalls)).toEqual([]);
  await expect(drawer.getByRole("link", { name: "Continue Tailscale sign-in", exact: true })).not.toBeAttached();
  await drawer.getByRole("button", { name: "Connect Tailscale", exact: true }).click();
  const login = drawer.getByRole("link", { name: "Continue Tailscale sign-in", exact: true });
  await expect(login).toHaveAttribute("href", "https://login.tailscale.com/a/test");
  await expect(login).toHaveAttribute("target", "_blank");
  await expect(login).toHaveAttribute("rel", "noopener noreferrer");
  expect(await page.evaluate(() => (window as unknown as { __popupCalls: string[] }).__popupCalls)).toEqual(["/tailscale-login"]);
  expect(context.pages()).toHaveLength(1);
  expect((await mockState(page)).boots).toBe(1);
});

test("confirmed reset reloads to idle and only clears the selected mock overlay after a new boot click", async ({ page }) => {
  await openRun(page);
  await page.evaluate(() => localStorage.setItem("pocketosix:test-kept", "retained"));
  const reset = await openReset(page);
  await reset.getByLabel("Type pocketosix to confirm", { exact: true }).fill("pocketosix");
  await Promise.all([page.waitForEvent("load"), reset.getByRole("button", { name: "Delete disk data", exact: true }).click()]);
  await expectPreflight(page);
  expect(await page.evaluate(() => sessionStorage.getItem("pocketosix:reset-disk"))).toBe(OVERLAY_ID);
  await boot(page);
  const state = await mockState(page);
  expect(state.resets).toBe(1);
  expect(state.resetIds).toEqual([OVERLAY_ID]);
  expect(state.rootOverlayId).toBe(OVERLAY_ID);
  expect(state.events).toEqual([`reset:${OVERLAY_ID}`, "run:/sbin/init"]);
  expect(state.creates).toBe(1);
  expect(state.boots).toBe(1);
  expect(await page.evaluate(() => sessionStorage.getItem("pocketosix:reset-disk"))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("pocketosix:test-kept"))).toBe("retained");
  await page.reload();
  await expectPreflight(page);
  await boot(page);
  expect((await mockState(page)).resets).toBe(0);
});

test("ordinary reload returns to preflight and reopens the same mock overlay without reset", async ({ page }) => {
  await openRun(page);
  const previous = await mockState(page);
  await page.reload();
  await expectPreflight(page);
  expect(await page.evaluate(() => sessionStorage.getItem("pocketosix:reset-disk"))).toBeNull();
  await boot(page);
  const state = await mockState(page);
  expect(state.rootOverlayId).toBe(previous.rootOverlayId);
  expect(state.rootOverlayId).toBe(OVERLAY_ID);
  expect(state.boots).toBe(1);
  expect(state.resets).toBe(0);
  expect(state.resetIds).toEqual([]);
});

test("an unexpected login domain is blocked instead of opening a redirect", async ({ page, context }) => {
  await mockSDK(context, { loginUrl: "https://attacker.example/login" });
  const unexpectedRequests: string[] = [];
  page.on("request", (request) => { if (request.url().includes("attacker.example")) unexpectedRequests.push(request.url()); });
  await openRun(page);
  await rail(page).getByRole("button", { name: "Network", exact: true }).click();
  const drawer = activeDialog(page);
  await page.evaluate(() => { window.open = () => null; });
  await drawer.getByRole("button", { name: "Connect Tailscale", exact: true }).click();
  const error = drawer.getByRole("alert");
  await expect(error).toContainText("Tailscale could not connect.");
  await error.getByText("Technical details", { exact: true }).click();
  await expect(error).toContainText("неожиданный адрес авторизации");
  await expect(drawer.getByRole("link", { name: "Continue Tailscale sign-in", exact: true })).not.toBeAttached();
  expect(unexpectedRequests).toEqual([]);
  expect(context.pages()).toHaveLength(1);
});

test("guest WebDevice listings expose the selected Alpine wallpaper on this origin", async ({ request }) => {
  const directory = await request.get("/assets", { headers: { Range: "bytes=0-0" } });
  expect(directory.status()).toBe(231);
  expect(await directory.body()).toHaveLength(0);
  expect((await request.head("/assets")).status()).toBe(231);
  const root = await request.get("/index.list");
  const assets = await request.get("/assets/index.list");
  const wallpaper = await request.get("/assets/alpine_bg.png");
  expect(root.ok()).toBe(true);
  expect(await root.text()).toBe("assets\n");
  expect(assets.ok()).toBe(true);
  expect(await assets.text()).toBe("alpine_bg.png\n");
  expect(wallpaper.ok()).toBe(true);
  expect(wallpaper.headers()["content-type"]).toContain("image/png");
  expect(Array.from((await wallpaper.body()).subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const range = await request.get("/assets/alpine_bg.png", { headers: { Range: "bytes=0-131071" } });
  expect(range.status()).toBe(206);
  expect(range.headers()["content-range"]).toMatch(/^bytes 0-131071\/\d+$/);
  expect(range.headers()["content-encoding"]).toBeUndefined();
  expect(await range.body()).toHaveLength(131072);
});

test("terminal tile docks, resizes by pointer and keyboard, and expands without reboot or PTY resize", async ({ page }) => {
  await openRun(page);
  const stage = page.locator(".desktop-stage");
  const initialBox = await stage.boundingBox();
  const framebuffer = () => page.locator(".linux-canvas").evaluate((canvas: HTMLCanvasElement) => ({ width: canvas.width, height: canvas.height }));
  const initialFramebuffer = await framebuffer();
  const terminal = await openTerminal(page);
  expect(await stage.boundingBox()).toEqual(initialBox);
  expect(await framebuffer()).toEqual(initialFramebuffer);
  const splitter = page.getByRole("separator", { name: "Terminal size", exact: true });
  await expect(splitter).toHaveAttribute("aria-orientation", "horizontal");
  await expect(splitter).toHaveAttribute("aria-valuenow", "280");
  await splitter.focus();
  await page.keyboard.press("ArrowUp");
  await expect(splitter).toHaveAttribute("aria-valuenow", "304");
  await terminal.getByRole("button", { name: "Change terminal dock", exact: true }).click();
  await expect(splitter).toHaveAttribute("aria-orientation", "vertical");
  const rect = await splitter.boundingBox();
  expect(rect).not.toBeNull();
  await page.mouse.move(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect!.x + rect!.width / 2 - 48, rect!.y + rect!.height / 2);
  await page.mouse.up();
  await expect(splitter).toHaveAttribute("aria-valuenow", "352");
  expect(await stage.boundingBox()).toEqual(initialBox);
  expect(await framebuffer()).toEqual(initialFramebuffer);
  await terminal.getByRole("button", { name: "Expand terminal", exact: true }).click();
  await expect(page.locator(".desktop-stage")).not.toBeVisible();
  await expect(terminal.getByRole("button", { name: "Restore terminal", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(await stage.evaluate(node => node.getBoundingClientRect().width)).toBe(initialBox!.width);
  expect(await framebuffer()).toEqual(initialFramebuffer);
  await terminal.getByRole("button", { name: "Restore terminal", exact: true }).click();
  await expect(page.locator(".desktop-stage")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(splitter).toHaveAttribute("aria-orientation", "horizontal");
  await expect(terminal.getByRole("button", { name: "Change terminal dock", exact: true })).toBeDisabled();
  await page.setViewportSize({ width: 1440, height: 960 });
  await expect(splitter).toHaveAttribute("aria-orientation", "vertical");
  expect((await mockState(page)).boots).toBe(1);
  expect((await mockState(page)).consoleSize).toEqual({ columns: 100, rows: 30 });
});

test("native fullscreen targets HTML, preserves the drawer and exits without another boot", async ({ page }) => {
  await openRun(page);
  await rail(page).getByRole("button", { name: "Immersive", exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
  await expect(page.locator(".desktop-stage")).toBeVisible();
  const drawer = await openMenu(page);
  expect(await drawer.evaluate((element) => element.matches(":modal"))).toBe(true);
  expect(await page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
  // Close explicitly here: native Escape may also exit fullscreen in Chromium.
  await drawer.getByRole("button", { name: "Close", exact: true }).click();
  await expect(activeDialog(page)).toHaveCount(0);
  await expect(page.locator(".linux-canvas")).toBeFocused();
  await revealToolbar(page);
  await toolbar(page).getByRole("button", { name: "Exit immersive", exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await rail(page).getByRole("button", { name: "Immersive", exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
  // Browser-originated exit updates mode without a shell Escape handler.
  await page.evaluate(() => document.exitFullscreen());
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  expect((await mockState(page)).boots).toBe(1);
});

test("pointer lock is requested from the drawer by a user click and releases without another boot", async ({ page }) => {
  await openRun(page);
  expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
  await rail(page).getByRole("button", { name: "Display", exact: true }).click();
  const drawer = activeDialog(page);
  await drawer.getByRole("button", { name: "Lock pointer", exact: true }).click();
  await expect(activeDialog(page)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.pointerLockElement === document.querySelector(".linux-canvas"))).toBe(true);
  await page.evaluate(() => document.exitPointerLock());
  await expect.poll(() => page.evaluate(() => document.pointerLockElement === null)).toBe(true);
  expect((await mockState(page)).boots).toBe(1);
});

test("toolbar auto-hides, reveals near the top and stays available while focused, hovered or a menu is open", async ({ page }) => {
  // Advance the actual two-second UI timer; this does not simulate guest readiness.
  await page.clock.install();
  await openRun(page);
  await rail(page).getByRole("button", { name: "Immersive", exact: true }).click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-mode", "immersive");
  await page.locator("#main-content").focus();
  await page.mouse.move(720, 480);
  await expect(page.locator("#main-content")).toBeFocused();
  await page.clock.fastForward(2500);
  await expect(toolbar(page)).toHaveCSS("opacity", "0");
  await expect(toolbar(page)).toHaveCSS("pointer-events", "none");
  await revealToolbar(page);
  const opener = toolbar(page).getByRole("button", { name: "Open menu", exact: true });
  await opener.focus();
  await expect(opener).toBeFocused();
  await page.clock.fastForward(2500);
  await expect(toolbar(page)).toHaveCSS("opacity", "1");
  await page.locator("#main-content").focus();
  await toolbar(page).hover();
  await page.clock.fastForward(2500);
  await expect(toolbar(page)).toHaveCSS("opacity", "1");
  await opener.click();
  await expect(activeDialog(page)).toHaveAccessibleName("Desktop menu");
  await page.mouse.move(720, 480);
  await page.clock.fastForward(2500);
  await expect(toolbar(page)).toHaveCSS("opacity", "1");
  await expect(opener).toHaveAttribute("aria-expanded", "true");
  await activeDialog(page).getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator(".linux-canvas")).toBeFocused();
  await page.locator("#main-content").focus();
  await page.mouse.move(720, 480);
  await page.clock.fastForward(2500);
  await expect(toolbar(page)).toHaveCSS("opacity", "0");
  expect((await mockState(page)).boots).toBe(1);
});

for (const width of [390, 768, 1440]) {
  for (const locale of ["en", "ru"] as const) {
    test(`boot screen and native drawer fit ${width}px in ${locale} and return keyboard focus`, async ({ page, context, baseURL }) => {
      await context.addCookies([{ name: "pocketosix-locale", value: locale, url: baseURL! }]);
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/run");
      await expectPreflight(page);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const bootRect = await page.getByRole("button", { name: "> boot", exact: true }).boundingBox();
      expect(bootRect).not.toBeNull();
      expect(bootRect!.x).toBeGreaterThanOrEqual(0);
      expect(bootRect!.x + bootRect!.width).toBeLessThanOrEqual(width);
      expect(bootRect!.y + bootRect!.height).toBeLessThanOrEqual(844);
      await boot(page);
      const controls = page.getByRole("navigation", { name: locale === "en" ? "Desktop rail" : "Панель рабочего стола", exact: true });
      await controls.getByRole("button", { name: locale === "en" ? "Immersive" : "Режим погружения", exact: true }).click();
      await expect(page.locator(".app-shell")).toHaveAttribute("data-mode", "immersive");
      await revealToolbar(page);
      const opener = toolbar(page).getByRole("button", { name: locale === "en" ? "Keyboard shortcuts" : "Сочетания клавиш", exact: true });
      await opener.click();
      const drawer = activeDialog(page);
      await expect(drawer).toHaveAccessibleName(locale === "en" ? "Shortcuts" : "Сочетания клавиш");
      await expect(drawer).toBeVisible();
      expect(await drawer.evaluate((element) => element.matches(":modal"))).toBe(true);
      const rect = await drawer.boundingBox();
      expect(rect).not.toBeNull();
      expect(rect!.x).toBeCloseTo(width - Math.min(360, width), 0);
      expect(rect!.y).toBeCloseTo(0, 0);
      expect(rect!.width).toBeCloseTo(Math.min(360, width), 0);
      expect(rect!.height).toBeCloseTo(844, 0);
      expect(await drawer.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.keyboard.press("Tab");
      await expect.poll(() => drawer.evaluate((element) => element.contains(document.activeElement))).toBe(true);
      await drawer.getByRole("button", { name: locale === "en" ? "Close panel" : "Закрыть панель", exact: true }).click();
      await expect(activeDialog(page)).toHaveCount(0);
      await expect(page.locator(".linux-canvas")).toBeFocused();
      expect((await mockState(page)).boots).toBe(1);
    });
  }
}

test("boot language dropdown uses the cookie and its selection persists into the running drawer", async ({ page, context }) => {
  await page.goto("/run");
  await expectPreflight(page);
   const trigger = page.getByTestId("boot-screen").getByRole("button", { name: "Choose language", exact: true });
  await trigger.click();
  await expect(page.getByRole("menuitemradio", { name: "English", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitemradio", { name: "Русский", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  await expect(page.getByTestId("boot-screen").getByRole("button", { name: "Выбрать язык", exact: true })).toBeFocused();
  expect((await context.cookies()).find((cookie) => cookie.name === "pocketosix-locale")?.value).toBe("ru");
  expect(await page.evaluate(() => "__pocketTest" in window)).toBe(false);
  await boot(page);
  const opener = page.locator("[data-panel-trigger=disk]");
  await opener.focus();
  await page.keyboard.press("Control+Alt+Shift+m");
  const drawer = activeDialog(page);
  await drawer.getByRole("button", { name: "Выбрать язык", exact: true }).click();
  await expect(drawer.getByRole("menuitemradio", { name: "Русский", exact: true })).toBeFocused();
  await page.keyboard.press("Home");
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(drawer.getByRole("button", { name: "Choose language", exact: true })).toBeFocused();
  expect((await context.cookies()).find((cookie) => cookie.name === "pocketosix-locale")?.value).toBe("en");
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
  await page.reload();
  await expectPreflight(page);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("landing launch opens only preflight and documentation navigation does not start the guest", async ({ page }) => {
  const guestRequests: string[] = [];
  page.on("request", (request) => {
    if (/cxrtnc\.leaningtech\.com|disks\.webvm\.io/.test(request.url())) guestRequests.push(request.url());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Linux in a browser tab.");
  await expect(page.locator(".app-shell, [data-active-workspace], .workspace-nav, canvas")).not.toBeAttached();
  expect(await page.evaluate(() => "__pocketTest" in window)).toBe(false);
  expect(guestRequests).toEqual([]);
  await page.getByRole("link", { name: "Launch", exact: true }).first().click();
  await expect(page).toHaveURL(/\/run$/);
  await expectPreflight(page);
  expect(guestRequests).toEqual([]);
  const popup = page.waitForEvent("popup");
  await page.getByRole("link", { name: "Docs", exact: true }).click();
  const docs = await popup;
  await expect(docs).toHaveURL(/\/docs$/);
  await expect(docs.getByRole("heading", { level: 1 })).toBeVisible();
  await docs.getByRole("navigation", { name: "On this page", exact: true }).getByRole("link", { name: "Files and storage", exact: true }).click();
  await expect(docs).toHaveURL(/\/docs#storage$/);
  await expect(docs.locator("#storage")).toBeFocused();
  await expect(page).toHaveURL(/\/run$/);
  expect(await docs.evaluate(() => "__pocketTest" in window)).toBe(false);
  expect(guestRequests).toEqual([]);
});
