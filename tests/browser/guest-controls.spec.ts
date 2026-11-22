import { test, expect, type Page } from "@playwright/test";
import { mockSDK, MOCK_SDK_URL, type MockSDKControl, type MockSDKState } from "./mock-sdk";

// Network-intercepted SDK fixtures verify browser/controller contracts only.
// These tests are not evidence of real Linux apps, i3 IPC or persistent writes.
const KMS_INPUT = "body > textarea[data-pocketosix-kms-input]";
const panels = ["apps", "display", "terminal", "disk", "network", "shortcuts", "logs"] as const;
type FixtureWindow = Window & {
  __pocketTest: MockSDKState;
  __pocketGuestControl: MockSDKControl;
  __guestNodes: (Element | null)[];
};
const state = (page: Page) => page.evaluate(() => (window as unknown as FixtureWindow).__pocketTest);
const panel = (page: Page) => page.locator("#desktop-panel");
const appsTrigger = (page: Page) => page.locator('[data-panel-trigger="apps"]');
const launch = (page: Page, app: string) => panel(page).locator(`[data-guest-launch="${app}"]`);
const floating = (page: Page) => panel(page).locator("[data-guest-floating]");
const row = (page: Page, id: number) => panel(page).locator(`[data-guest-window="${id}"]`);
const refresh = (page: Page) => panel(page).getByRole("button", { name: "Refresh windows", exact: true });
const ipcCommands = (snapshot: MockSDKState) => snapshot.guestRuns.filter(run => run.filename === "/usr/bin/i3-msg").map(run => run.args.at(-1));

test.beforeEach(async ({ context }) => { await mockSDK(context, { nativeKms: true }); });

test.afterEach(async ({ page }) => {
  const snapshot = await page.evaluate(() => (window as unknown as FixtureWindow).__pocketTest);
  if (!snapshot) return;
  expect(snapshot.resets).toBe(0);
  expect(snapshot.deletes).toBe(0);
  expect(snapshot.boots).toBe(1);
  expect(snapshot.init).toEqual({ filename: "/sbin/init", args: [], options: { uid: 0, gid: 0 } });
});

async function boot(page: Page) {
  await page.goto("/run");
  await page.getByRole("button", { name: "> boot", exact: true }).click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-vm-phase", "ready");
  await expect(page.locator(KMS_INPUT)).toHaveCount(1);
}

async function openApps(page: Page) {
  await appsTrigger(page).click();
  await expect(panel(page)).toHaveAccessibleName("Apps");
  await expect(panel(page)).toBeVisible();
}

async function inspect(page: Page) {
  await openApps(page);
  await expect(refresh(page)).toBeEnabled();
  await expect(launch(page, "terminal")).toBeEnabled();
  await expect(row(page, 501)).toBeVisible();
}

test("preboot Apps is inert and makes no SDK/CDN request", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", request => {
    if (request.url() === MOCK_SDK_URL || /cxrtnc\.leaningtech\.com|disks\.webvm\.io/.test(request.url())) requests.push(request.url());
  });
  await page.goto("/run");
  for (let cycle = 0; cycle < 2; cycle++) {
    await openApps(page);
    for (const app of ["launcher", "terminal", "files", "lightweight-files"]) await expect(launch(page, app)).toBeDisabled();
    await expect(refresh(page)).toBeDisabled();
    await expect(floating(page)).toBeDisabled();
    await expect(panel(page).locator("[data-guest-status]")).toContainText("Available after the desktop starts.");
    expect(await page.evaluate(() => "__pocketTest" in window)).toBe(false);
    await panel(page).getByRole("button", { name: "Close panel", exact: true }).click();
  }
  await expect(page.locator(".app-shell")).toHaveAttribute("data-vm-phase", "idle");
  expect(requests).toEqual([]);
});

test("postboot default floating probes the current session once without another init", async ({ page }) => {
  await boot(page);
  await expect.poll(async () => (await state(page)).activeSubscribers).toBe(1);
  await inspect(page);
  const first = await state(page);
  expect(first.guestProbes).toBe(1);
  expect(first.guestTrees).toBe(2);
  expect(first.guestRuns[0].args[2]).toBe("pocketosix-guest-probe");
  expect(first.guestRuns[0].args.at(-1)).toMatch(/^[a-zA-Z0-9_-]{8,64}$/);
  expect(first.guestRuns[0].options).toEqual({ uid: 0, gid: 0, cwd: "/" });
  expect(first.guestRuns[1]).toMatchObject({ filename: "/usr/bin/python3", options: { uid: 1000, gid: 1000, cwd: "/" } });
  expect(first.guestRuns[1].args.slice(0, 2)).toEqual(["-B", "-c"]);
  const tree = first.guestRuns.find(run => run.args[2]?.includes("[pocketosix-tree:"))!;
  expect(tree.args[4]).toBe("/tmp/i3-test/ipc-socket.7");
  expect(tree.args[3]).not.toBe(first.guestRuns[0].args.at(-1));
  await expect(panel(page).locator("[data-guest-window]")).toHaveCount(3);
  await expect(row(page, 501)).toContainText("XTerm · Floating");
  await expect(floating(page)).toHaveAttribute("aria-pressed", "true");
  await expect(row(page, 503)).toContainText("FixtureApp · Floating");
  await refresh(page).click();
  await expect(refresh(page)).toBeEnabled();
  expect((await state(page)).guestProbes).toBe(1);
  expect((await state(page)).guestTrees).toBe(3);
  expect((await state(page)).subscriberStarts).toBe(1);
});

test("missing guest apps stay disabled while available apps and windows remain usable", async ({ page, context }) => {
  await mockSDK(context, { nativeKms: true, missingApps: ["files", "lightweight-files", "launcher"] });
  await boot(page);
  await inspect(page);
  for (const app of ["files", "lightweight-files", "launcher"]) await expect(launch(page, app)).toBeDisabled();
  await expect(launch(page, "terminal")).toBeEnabled();
  await expect(floating(page)).toBeEnabled();
  expect(ipcCommands(await state(page))).toEqual([]);
});

test("a failed probe shows an error without inventing apps or resetting the disk", async ({ page, context }) => {
  await mockSDK(context, { nativeKms: true, probeFailure: true });
  await boot(page);
  await openApps(page);
  await expect(panel(page).getByRole("alert")).toBeVisible();
  await expect(refresh(page)).toBeEnabled();
  for (const app of ["launcher", "terminal", "files", "lightweight-files"]) await expect(launch(page, app)).toBeDisabled();
  await expect(floating(page)).toBeDisabled();
  await expect(panel(page).locator("[data-guest-window]")).toHaveCount(0);
  expect((await state(page)).guestTrees).toBe(0);
  expect((await state(page)).subscriberStarts).toBe(0);
});

test("launch remains busy after a successful ACK until a new matching window is observed", async ({ page, context }) => {
  await mockSDK(context, { nativeKms: true, delayedWindow: true });
  await boot(page);
  await inspect(page);
  await launch(page, "terminal").click();
  await expect(panel(page)).not.toBeVisible();
  await expect(page.locator(KMS_INPUT)).toBeFocused();
  await expect.poll(async () => (await state(page)).guestAcks).toBe(1);
  await expect.poll(async () => (await state(page)).guestTrees).toBeGreaterThanOrEqual(3);
  expect((await state(page)).pendingGuestWindows).toHaveLength(1);
  await openApps(page);
  await expect(panel(page).locator("[data-guest-status]")).toContainText("Waiting for Linux…");
  await expect(refresh(page)).toBeDisabled();
  await expect(floating(page)).toBeDisabled();
  for (const app of ["launcher", "terminal", "files", "lightweight-files"]) await expect(launch(page, app)).toBeDisabled();
  await launch(page, "terminal").evaluate((button: HTMLButtonElement) => button.click());
  await refresh(page).evaluate((button: HTMLButtonElement) => button.click());
  expect(ipcCommands(await state(page))).toEqual(["exec --no-startup-id /usr/bin/xterm"]);
  await expect(panel(page).locator("[data-guest-window]")).toHaveCount(3);
  await page.evaluate(() => (window as unknown as FixtureWindow).__pocketGuestControl.revealWindows());
  await expect(row(page, 504)).toContainText("Launched XTerm");
  await expect(launch(page, "terminal")).toBeEnabled();
  await expect(refresh(page)).toBeEnabled();
  expect(ipcCommands(await state(page))).toHaveLength(1);
  await expect(page.locator(KMS_INPUT)).not.toBeFocused();
});

test("all app controls use finite guest commands and keep native KMS input ownership", async ({ page }) => {
  await boot(page);
  await inspect(page);
  const cases = [
    { app: "launcher", executable: "/usr/bin/rofi -normal-window -show drun", className: "Rofi" },
    { app: "terminal", executable: "/usr/bin/xterm", className: "XTerm" },
    { app: "files", executable: "/usr/bin/thunar", className: "Thunar" },
    { app: "lightweight-files", executable: "/usr/bin/pcmanfm", className: "Pcmanfm" },
  ];
  for (const [index, entry] of cases.entries()) {
    await launch(page, entry.app).click();
    await expect(panel(page)).not.toBeVisible();
    await expect(page.locator(KMS_INPUT)).toBeFocused();
    await openApps(page);
    await expect(launch(page, entry.app)).toBeEnabled();
    await expect(row(page, 504 + index)).toContainText(`Launched ${entry.className}`);
    expect(ipcCommands(await state(page))).toHaveLength(index + 1);
    expect(ipcCommands(await state(page)).at(-1)).toBe(`exec --no-startup-id ${entry.executable}`);
  }
  const snapshot = await state(page);
  for (const run of snapshot.guestRuns.filter(run => run.filename === "/usr/bin/i3-msg")) {
    expect(run.options).toEqual({ uid: 1000, gid: 1000, cwd: "/" });
    expect(run.args.slice(0, 2)).toEqual(["-s", "/tmp/i3-test/ipc-socket.7"]);
  }
  expect(snapshot.consoleInput).toEqual([]);
  expect(snapshot.kmsKeys).toEqual([]);
});

test("hide, restore and close target both exact IDs even when window titles match", async ({ page }) => {
  await boot(page);
  await inspect(page);
  const target = row(page, 501);
  const other = row(page, 502);
  await target.getByRole("button", { name: "Hide window Test terminal", exact: true }).click();
  await expect(target).toHaveAttribute("data-guest-hidden", "true");
  await expect(other).toHaveAttribute("data-guest-hidden", "false");
  await expect(target.getByRole("button", { name: "Show window Test terminal", exact: true })).toBeEnabled();
  await target.getByRole("button", { name: "Show window Test terminal", exact: true }).click();
  await expect(target).toHaveAttribute("data-guest-hidden", "false");
  await expect(target.getByRole("button", { name: "Hide window Test terminal", exact: true })).toBeEnabled();
  await target.getByRole("button", { name: "Close Linux window Test terminal", exact: true }).click();
  await expect(target).toHaveCount(0);
  await expect(other).toBeVisible();
  await expect(other).toHaveAttribute("data-guest-hidden", "false");
  expect(ipcCommands(await state(page))).toEqual([
    "[con_id=101 id=501] move scratchpad", "[con_id=101 id=501] scratchpad show", "[con_id=101 id=501] kill",
  ]);
});

test("a rejected i3 COMMAND ACK exits 2 and leaves the window intact", async ({ page, context }) => {
  await mockSDK(context, { nativeKms: true, ackFailure: "window" });
  await boot(page);
  await inspect(page);
  await row(page, 501).getByRole("button", { name: "Close Linux window Test terminal", exact: true }).click();
  await expect(panel(page).getByRole("alert")).toContainText(/i3|IPC|команд/i);
  await expect(row(page, 501)).toBeVisible();
  await expect(refresh(page)).toBeEnabled();
  expect((await state(page)).guestAcks).toBe(1);
  expect((await state(page)).guestAckStatuses).toEqual([2]);
});

test("floating owns one long-lived subscriber and stops only through its exact send_tick token", async ({ page, context }) => {
  await mockSDK(context, { nativeKms: true, delayedFloating: true });
  await boot(page);
  await openApps(page);
  await expect.poll(async () => (await state(page)).activeSubscribers).toBe(1);
  await expect(floating(page)).toBeDisabled();
  await floating(page).evaluate((button: HTMLButtonElement) => button.click());
  await panel(page).getByRole("button", { name: "Close panel", exact: true }).click();
  await openApps(page);
  await expect(floating(page)).toBeDisabled();
  expect((await state(page)).subscriberStarts).toBe(1);
  await page.evaluate(() => (window as unknown as FixtureWindow).__pocketGuestControl.confirmFloating());
  await expect(floating(page)).toHaveAttribute("aria-pressed", "true");
  await expect(floating(page)).toBeEnabled();
  await expect(row(page, 501)).toContainText("XTerm · Floating");
  await row(page, 502).getByRole("button", { name: "Hide window Test terminal", exact: true }).click();
  await expect(row(page, 502)).toHaveAttribute("data-guest-hidden", "true");
  await expect(floating(page)).toBeEnabled();
  await launch(page, "terminal").click();
  await openApps(page);
  await expect(launch(page, "terminal")).toBeEnabled();
  await expect(row(page, 504)).toContainText("XTerm · Floating");
  await floating(page).click();
  await expect(floating(page)).toHaveAttribute("aria-pressed", "false");
  await expect(floating(page)).toBeEnabled();
  await expect(row(page, 501)).toContainText("XTerm · Tiling");
  await expect(row(page, 504)).toContainText("XTerm · Tiling");
  await expect(row(page, 503)).toContainText("FixtureApp · Floating");
  await expect(row(page, 502)).toHaveAttribute("data-guest-hidden", "true");
  const stopped = await state(page);
  expect(stopped.activeSubscribers).toBe(0);
  const subscriber = stopped.guestRuns.find(run => run.filename === "/usr/bin/python3" && run.args.at(-1)?.startsWith("pocketosix-floating-stop:"))!;
  expect(subscriber.options).toEqual({ uid: 1000, gid: 1000, cwd: "/" });
  expect(stopped.stopTokens).toEqual([subscriber.args.at(-1)]);
  const tick = stopped.guestRuns.find(run => run.args.includes("send_tick"))!;
  expect(tick.args).toEqual(["-s", "/tmp/i3-test/ipc-socket.7", "-t", "send_tick", subscriber.args.at(-1)]);
  await floating(page).click();
  await expect.poll(async () => (await state(page)).subscriberStarts).toBe(2);
  await page.evaluate(() => (window as unknown as FixtureWindow).__pocketGuestControl.confirmFloating());
  await expect(floating(page)).toHaveAttribute("aria-pressed", "true");
  await expect(floating(page)).toBeEnabled();
  await floating(page).click();
  await expect(floating(page)).toHaveAttribute("aria-pressed", "false");
  await expect(floating(page)).toBeEnabled();
  expect((await state(page)).activeSubscribers).toBe(0);
  expect((await state(page)).maxSubscribers).toBe(1);
});

for (const width of [1440, 390]) {
  test(`${width}px all seven overlays preserve stage/canvas/KMS geometry and block native textarea input`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    await boot(page);
    const canvas = page.locator(".linux-canvas");
    const stage = page.locator(".desktop-stage");
    const input = page.locator(KMS_INPUT);
    const stageBox = await stage.boundingBox();
    const canvasBox = await canvas.boundingBox();
    const dimensions = await canvas.evaluate((node: HTMLCanvasElement) => ({ width: node.width, height: node.height }));
    const bindings = (await state(page)).kmsBindings;
    await page.evaluate(() => {
      (window as unknown as FixtureWindow).__guestNodes = [".desktop-stage", ".linux-canvas", "body > textarea[data-pocketosix-kms-input]", ".system-console", "#desktop-panel"].map(selector => document.querySelector(selector));
    });
    for (const name of panels) {
      await canvas.focus();
      await expect(input).toBeFocused();
      await page.locator(`[data-panel-trigger="${name}"]`).click();
      await expect(panel(page)).toBeVisible();
      const close = panel(page).getByRole("button", { name: "Close panel", exact: true });
      await expect(close).toBeFocused();
      await expect(page.locator("#main-content")).toHaveAttribute("inert", "");
      await input.focus();
      await canvas.focus();
      await expect(close).toBeFocused();
      await page.keyboard.press("a");
      expect((await state(page)).kmsKeys).toEqual([]);
      expect(await stage.boundingBox()).toEqual(stageBox);
      expect(await canvas.boundingBox()).toEqual(canvasBox);
      expect(await canvas.evaluate((node: HTMLCanvasElement) => ({ width: node.width, height: node.height }))).toEqual(dimensions);
      expect((await state(page)).kmsBindings).toBe(bindings);
      expect(await page.evaluate(() => {
        const selectors = [".desktop-stage", ".linux-canvas", "body > textarea[data-pocketosix-kms-input]", ".system-console", "#desktop-panel"];
        return (window as unknown as FixtureWindow).__guestNodes.every((node, index) => node?.isConnected && node === document.querySelector(selectors[index]));
      })).toBe(true);
      await close.click();
      await expect(panel(page)).not.toBeVisible();
      await expect(page.locator(`[data-panel-trigger="${name}"]`)).toBeFocused();
    }
    await canvas.focus();
    await expect(input).toBeFocused();
    await page.keyboard.press("b");
    expect((await state(page)).kmsKeys).toEqual(["b"]);
    expect((await state(page)).kmsBindings).toBe(bindings);
    expect((await state(page)).subscriberStarts).toBe(1);
  });
}

test("pending notice can be dismissed without releasing the guest action gate", async ({ page, context }) => {
  await mockSDK(context, { nativeKms: true, delayedWindow: true });
  await boot(page);
  await inspect(page);
  await launch(page, "terminal").click();
  const notice = page.locator("[data-guest-notice]");
  await expect(notice).toBeVisible();
  await notice.getByRole("button", { name: "Dismiss message", exact: true }).click();
  await expect(notice).toHaveCount(0);
  await openApps(page);
  await expect(refresh(page)).toBeDisabled();
  await launch(page, "terminal").evaluate((button: HTMLButtonElement) => button.click());
  expect((await state(page)).guestAcks).toBe(1);
  await panel(page).getByRole("button", { name: "Close panel", exact: true }).click();
  await expect(notice).toHaveCount(0);
  await page.evaluate(() => (window as unknown as FixtureWindow).__pocketGuestControl.revealWindows());
  await inspect(page);
  await launch(page, "terminal").click();
  await expect(notice).toBeVisible();
  expect((await state(page)).guestAcks).toBe(2);
  await page.evaluate(() => (window as unknown as FixtureWindow).__pocketGuestControl.revealWindows());
});

test("asynchronous close keeps controls busy until the same window really disappears", async ({ page, context }) => {
  await mockSDK(context, { nativeKms: true, delayedClose: true });
  await boot(page);
  await inspect(page);
  await row(page, 501).getByRole("button", { name: "Close Linux window Test terminal", exact: true }).click();
  await expect(refresh(page)).toBeDisabled();
  await expect(row(page, 501)).toBeVisible();
  await row(page, 501).getByRole("button", { name: "Close Linux window Test terminal", exact: true }).evaluate((button: HTMLButtonElement) => button.click());
  expect(ipcCommands(await state(page))).toEqual(["[con_id=101 id=501] kill"]);
  await page.evaluate(() => (window as unknown as FixtureWindow).__pocketGuestControl.finishCloses());
  await expect(row(page, 501)).toHaveCount(0);
  await expect(row(page, 502)).toBeVisible();
  await expect(refresh(page)).toBeEnabled();
  expect(ipcCommands(await state(page))).toHaveLength(1);
});

test("high-bit container IDs retain both canonical IDs in guarded mark commands", async ({ page, context }) => {
  await mockSDK(context, { nativeKms: true, highBitIds: true });
  await boot(page);
  await inspect(page);
  await row(page, 501).getByRole("button", { name: "Hide window Test terminal", exact: true }).click();
  await expect(row(page, 501)).toHaveAttribute("data-guest-hidden", "true");
  await expect(row(page, 502)).toHaveAttribute("data-guest-hidden", "false");
  const guarded = (await state(page)).guestRuns.find(run => run.args[2]?.includes('pocketosix-window-control:'))!;
  expect(guarded.args.slice(3)).toEqual(["/tmp/i3-test/ipc-socket.7", "[[2937926608,501]]", "move scratchpad"]);
  expect(ipcCommands(await state(page))).toEqual([]);
  await row(page, 501).getByRole("button", { name: "Show window Test terminal", exact: true }).click();
  await expect(row(page, 501)).toHaveAttribute("data-guest-hidden", "false");
  await row(page, 501).getByRole("button", { name: "Close Linux window Test terminal", exact: true }).click();
  await expect(row(page, 501)).toHaveCount(0);
  await expect(row(page, 502)).toBeVisible();
});

test("error notice can be dismissed but stays available in Apps and reappears for a new failure", async ({ page, context }) => {
  await mockSDK(context, { nativeKms: true, probeFailure: true });
  await boot(page);
  const notice = page.locator("[data-guest-notice]");
  await expect(notice).toHaveAttribute("role", "alert");
  await notice.getByRole("button", { name: "Dismiss message", exact: true }).click();
  await expect(notice).toHaveCount(0);
  await openApps(page);
  await expect(panel(page).getByRole("alert")).toBeVisible();
  await panel(page).getByRole("button", { name: "Close panel", exact: true }).click();
  await expect(notice).toBeVisible();
});
