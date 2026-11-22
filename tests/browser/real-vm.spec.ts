import { test, expect, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import type { Linux } from "@leaningtech/cheerpx";
import { observeSDK } from "./observe-sdk";

const browserMessages: string[] = [];

test.beforeEach(async ({ page, context }) => {
  await context.addCookies([{ name: "pocketosix-locale", value: "en", url: "http://localhost:3000" }]);
  browserMessages.length = 0;
  page.on("console", (message) => {
    browserMessages.push(`[${message.type()}] ${message.text()}`);
  });
  page.on("response", (response) => { if (response.status() >= 400) browserMessages.push(`[http ${response.status()}] ${response.url()}`); });
  if (process.env.POCKETOSIX_VM_DIAGNOSTICS === "1") await observeSDK(context);
});

async function boot(page: Page) {
  await page.goto("/run");
  await page.getByRole("button", { name: "> boot", exact: true }).click();
  await page.screenshot({ path: test.info().outputPath("boot-1440.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: test.info().outputPath("boot-390.png") });
  await page.setViewportSize({ width: 1440, height: 960 });
  await expect(page.locator(".app-shell")).toHaveAttribute("data-vm-phase", "ready", { timeout: 300000 });
  // VT7 alone is not enough: wait for actual non-uniform Xorg framebuffer.
  await expect.poll(() => page.locator("canvas").evaluate((canvas: HTMLCanvasElement) => {
    const sampler = document.createElement("canvas");
    sampler.width = sampler.height = 64;
    const context = sampler.getContext("2d");
    if (!context) return false;
    context.drawImage(canvas, 0, 0, 64, 64);
    const pixels = context.getImageData(0, 0, 64, 64).data;
    const first = `${pixels[0]},${pixels[1]},${pixels[2]}`;
    for (let i = 4; i < pixels.length; i += 4) {
      if (`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}` !== first) return true;
    }
    return false;
  }), { timeout: 60000 }).toBe(true);
  // The first Xorg frame may contain only feh wallpaper. Polybar is a real
  // guest process that paints later; do not click controls before they exist.
  await expect.poll(() => guestTextPixels(page, { x: 50, y: 6, width: 60, height: 28 }), { timeout: 90000 }).toBeGreaterThan(30);
}

async function guestTextPixels(page: Page, region: { x: number; y: number; width: number; height: number }) {
  return page.locator(".linux-canvas").evaluate((canvas: HTMLCanvasElement, region) => {
    const sample = document.createElement("canvas");
    sample.width = region.width; sample.height = region.height;
    const context = sample.getContext("2d")!;
    context.drawImage(canvas, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height);
    const pixels = context.getImageData(0, 0, region.width, region.height).data;
    let text = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 160 && pixels[i + 1] > 160 && pixels[i + 2] > 160) text++;
    return text;
  }, region);
}

async function terminalCommand(page: Page, command: string, open = true) {
  await page.locator(".linux-canvas").click({ position: { x: 200, y: 200 } });
  await expect(page.locator("body > textarea[data-pocketosix-kms-input]")).toBeFocused();
  if (open) {
    // Genuine Polybar controls in the pinned base image: Apps expands the
    // submenu first; its Terminal button starts xterm. No host vm.run launch.
    await expect.poll(() => guestTextPixels(page, { x: 50, y: 6, width: 60, height: 28 }), { timeout: 90000 }).toBeGreaterThan(30);
    await page.locator(".linux-canvas").click({ position: { x: 82, y: 21 }, delay: 100 });
    await expect.poll(() => guestTextPixels(page, { x: 210, y: 6, width: 100, height: 28 }), { timeout: 30000 }).toBeGreaterThan(30);
    await page.locator(".linux-canvas").click({ position: { x: 260, y: 21 }, delay: 100 });
    await expect.poll(() => guestStatus(page, "pidof xterm >/dev/null"), { timeout: 30000 }).toBe(0);
    await expect.poll(() => page.locator(".linux-canvas").evaluate((canvas: HTMLCanvasElement) => {
      const sample = document.createElement("canvas");
      sample.width = sample.height = 1;
      const context = sample.getContext("2d")!;
      context.drawImage(canvas, canvas.width / 2, canvas.height / 2, 1, 1, 0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3).every(value => value < 10);
    }), { timeout: 30000 }).toBe(true);
    // xterm may exist before Bash has painted its first prompt. Wait for real
    // text in the first content row, excluding the blank terminal's cursor.
    await expect.poll(() => guestTextPixels(page, { x: 18, y: 82, width: 200, height: 36 }), { timeout: 30000 }).toBeGreaterThan(10);
  }
  await page.keyboard.type(command, { delay: 35 });
  // SDK keydown batching requires a real-duration hold in browser automation.
  await page.keyboard.press("Enter", { delay: 100 });
}

async function guestStatus(page: Page, command: string) {
  return page.evaluate(async command => {
    const vm = (window as unknown as { __pocketDiagnosticsVM: Linux }).__pocketDiagnosticsVM;
    return (await vm.run("/bin/sh", ["-c", command], { uid: 0, gid: 0 })).status;
  }, command);
}

async function expectGuestMarker(page: Page, file: string, marker: string) {
  // Read-only exit status: tty1 output is not a reliable oracle while VT7 is
  // active. The contiguous marker is never present in the typed printf input.
  await expect.poll(() => guestStatus(page, `grep -qx '${marker}' '${file}'`), { timeout: 60000 }).toBe(0);
}

async function expectCommittedMarker(page: Page, marker: string) {
  // Test-only, read-only inspection of the pinned disk's real SDK block store.
  // Guest sync / cat can precede host IDB commit. Never invent a flush API or
  // treat this marker as proof that every queued filesystem block was saved.
  const started = Date.now();
  await expect.poll(() => page.evaluate(async marker => {
    const name = "cjFS_/pocketosix-alpine-20251007-v1/";
    if (!(await indexedDB.databases()).some(database => database.name === name)) return false;
    return new Promise<boolean>((resolve, reject) => {
      const open = indexedDB.open(name);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const database = open.result;
        const transaction = database.transaction("files", "readonly");
        const cursor = transaction.objectStore("files").openCursor();
        const needle = new TextEncoder().encode(marker);
        let found = false;
        cursor.onsuccess = () => {
          const record = cursor.result;
          if (!record) return;
          const contents = record.value.contents;
          if (record.value.type === "file" && contents instanceof Uint8Array) {
            for (let i = contents.indexOf(needle[0]); i >= 0; i = contents.indexOf(needle[0], i + 1)) {
              if (needle.every((value, offset) => contents[i + offset] === value)) { found = true; break; }
            }
          }
          if (!found) record.continue();
        };
        transaction.oncomplete = () => { database.close(); resolve(found); };
        transaction.onabort = () => { database.close(); reject(transaction.error); };
      };
    });
  }, marker), { timeout: 90000 }).toBe(true);
  await test.info().attach("committed-marker", { body: JSON.stringify({ marker, waitMilliseconds: Date.now() - started }), contentType: "application/json" });
}

async function openMenu(page: Page) {
  if (await page.locator("[data-mode=immersive]").count()) {
    await page.getByRole("button", { name: "Show desktop controls", exact: true }).hover();
    await page.getByRole("button", { name: "Open menu", exact: true }).click();
  } else {
    await page.locator("[data-panel-trigger=disk]").focus();
    await page.keyboard.press("Control+Alt+Shift+m");
  }
  return page.getByRole("dialog", { name: "Desktop menu", exact: true });
}

async function showToolbar(page: Page) {
  await expect(page.getByRole("navigation", { name: "Desktop rail", exact: true })).toBeVisible();
}

async function openReset(page: Page) {
  const menu = await openMenu(page);
  await menu.getByRole("button", { name: "Disk", exact: true }).click();
  await page.getByRole("dialog", { name: "Disk", exact: true }).getByRole("button", { name: "Reset disk", exact: true }).click();
}

async function captureShell(page: Page, width: number) {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
  await page.screenshot({ path: test.info().outputPath(`docked-${width}.png`) });
  await page.locator("[data-panel-trigger=disk]").click();
  const disk = page.getByRole("dialog", { name: "Disk", exact: true });
  await expect(disk).toBeVisible();
  await page.screenshot({ path: test.info().outputPath(`disk-${width}.png`) });
  await disk.getByRole("button", { name: "Close panel", exact: true }).click();
  await page.getByRole("button", { name: "Immersive", exact: true }).click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-mode", "immersive");
  await page.getByRole("button", { name: "Show desktop controls", exact: true }).hover();
  await expect(page.locator("[data-desktop-toolbar]")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: test.info().outputPath(`immersive-${width}.png`) });
  await page.getByRole("button", { name: "Exit immersive", exact: true }).click();
  await page.getByRole("button", { name: "Exit to home", exact: true }).click();
  const leave = page.getByRole("dialog", { name: "Leave desktop?", exact: true });
  await expect(leave).toBeVisible();
  await page.screenshot({ path: test.info().outputPath(`leave-${width}.png`) });
  await leave.getByRole("button", { name: "Stay", exact: true }).click();
}

async function loginTty1(page: Page) {
  // tty1 is independent of Xorg: never gate this smoke test on GUI readiness.
  await page.goto("/run");
  await page.getByRole("button", { name: "> boot", exact: true }).click();
  await page.locator("[data-panel-trigger=terminal]").click();
  const opener = page.getByRole("dialog", { name: "Terminal", exact: true }).getByRole("button", { name: "Open terminal", exact: true });
  await expect(opener).toBeEnabled({ timeout: 180000 });
  await opener.click();
  const terminal = page.getByRole("region", { name: "Guest terminal tty1" });
  const output = terminal.locator(".xterm-accessibility");
  // This rendered output contains only VT1, unlike the combined boot log.
  await expect(output).toContainText("/dev/tty1", { timeout: 180000 });
  await expect(output).toContainText("login:");
  const input = terminal.locator(".xterm-helper-textarea");
  await expect(input).toBeAttached();
  await input.focus();
  await page.keyboard.type("user", { delay: 60 });
  await page.keyboard.press("Enter");
  await expect(output).toContainText("Password:", { timeout: 60000 });
  // Public factory credentials of the upstream Alpine image, not user secrets.
  await page.keyboard.type("password", { delay: 60 });
  await page.keyboard.press("Enter");
  await expect(output).toContainText(/[$#]\s*$/, { timeout: 60000 });
  return { input, output };
}

test("real tty1 accepts login and executes a shell command through the docked xterm", async ({ page }) => {
  test.setTimeout(420000);
  page.setDefaultTimeout(15000);
  const { input, output } = await loginTty1(page);
  await input.focus();
  await page.keyboard.type("printf 'pocketosix-%s\\n' 'tty-shell-ok'", { delay: 35 });
  await page.keyboard.press("Enter");
  // The expected contiguous marker is absent from the typed command, so tty
  // echo alone cannot pass this assertion: the shell must actually execute it.
  await expect(output).toContainText("pocketosix-tty-shell-ok", { timeout: 60000 });
});

test("real tty1 committed disk write survives reload and a confirmed reset clears the test overlay", async ({ page }) => {
  test.setTimeout(720000);
  const stamp = String(Date.now());
  const marker = `pocketosix-disk-${stamp}`;
  let tty = await loginTty1(page);
  await tty.input.focus();
  await page.keyboard.type(`printf 'pocketosix-disk-%s\\n' '${stamp}' > /home/user/pocketosix-test.txt && sync && cat /home/user/pocketosix-test.txt`, { delay: 35 });
  await page.keyboard.press("Enter");
  await expect(tty.output).toContainText(marker, { timeout: 60000 });
  await expectCommittedMarker(page, marker);
  await page.reload();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-vm-phase", "idle");
  tty = await loginTty1(page);
  await tty.input.focus();
  await page.keyboard.type("cat /home/user/pocketosix-test.txt", { delay: 35 });
  await page.keyboard.press("Enter");
  await expect(tty.output).toContainText(marker, { timeout: 60000 });
  await expect(page.locator(".app-shell")).toHaveAttribute("data-vm-phase", "ready", { timeout: 300000 });
  await openReset(page);
  await page.getByLabel("Type pocketosix to confirm").fill("pocketosix");
  await Promise.all([page.waitForEvent("load"), page.getByRole("button", { name: "Delete disk data" }).click()]);
  await expect(page.locator(".app-shell")).toHaveAttribute("data-vm-phase", "idle");
  tty = await loginTty1(page);
  await tty.input.focus();
  await page.keyboard.type("test ! -e /home/user/pocketosix-test.txt && printf 'pocketosix-%s\\n' 'tty-reset-ok'", { delay: 35 });
  await page.keyboard.press("Enter");
  await expect(tty.output).toContainText("pocketosix-tty-reset-ok", { timeout: 60000 });
});

test("real WebDevice exposes its asset directory and reads the wallpaper through guest syscalls", async ({ page, context }) => {
  if (process.env.POCKETOSIX_VM_DIAGNOSTICS !== "1") await observeSDK(context);
  await boot(page);
  const result = await page.evaluate(async () => {
    const vm = (window as unknown as { __pocketDiagnosticsVM: Linux }).__pocketDiagnosticsVM;
    return vm.run("/bin/sh", ["-c", [
      "test -d /web", "test -d /web/assets",
      "ls /web | grep -qx assets", "ls /web/assets | grep -qx alpine_bg.png",
      "test -s /web/assets/alpine_bg.png", "cat /web/assets/alpine_bg.png > /dev/null",
    ].join(" && ")], { uid: 0, gid: 0 });
  });
  expect(result.status).toBe(0);
  expect(await guestStatus(page, "pidof i3 >/dev/null")).toBe(0);
  await expect(page.locator(".linux-canvas")).toHaveCSS("cursor", "none");
  const displayState = () => page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(".linux-canvas")!;
    return {
      stage: document.querySelector(".desktop-stage")!.getBoundingClientRect().toJSON(),
      canvas: canvas.getBoundingClientRect().toJSON(),
      width: canvas.width, height: canvas.height,
      bindings: (window as unknown as { __pocketKmsBindings: unknown[] }).__pocketKmsBindings.length,
    };
  });
  const baseline = await displayState();
  const panelMeasurements: { panel: string; openMilliseconds: number; bindings: number }[] = [];
  for (const name of ["display", "terminal", "disk", "network", "shortcuts", "logs"]) {
    const started = performance.now();
    const trigger = page.locator(`[data-panel-trigger=${name}]`);
    await expect(trigger).not.toHaveCSS("cursor", "none");
    await trigger.click();
    const panel = page.locator("#desktop-panel");
    await expect(panel).toBeVisible();
    panelMeasurements.push({ panel: name, openMilliseconds: performance.now() - started, bindings: (await displayState()).bindings });
    await expect(page.locator("body > textarea[data-pocketosix-kms-input]")).not.toBeFocused();
    // Include the runtime's resize-settling interval, not just the click frame.
    await page.waitForTimeout(500);
    expect(await displayState()).toEqual(baseline);
    await panel.getByRole("button", { name: "Close panel", exact: true }).click();
    await page.waitForTimeout(500);
    expect(await displayState()).toEqual(baseline);
  }
  await test.info().attach("real-panel-resize-measurements", { body: JSON.stringify({ source: "Real SDK; browser panels only, not guest application latency", baseline, panels: panelMeasurements }, null, 2), contentType: "application/json" });
  if (process.env.POCKETOSIX_VM_CAPTURE_UI === "1") {
    for (const width of [1440, 390]) await captureShell(page, width);
  }
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    await showToolbar(page);
    await page.screenshot({ path: test.info().outputPath(`running-${width}.png`) });
    await openMenu(page);
    await page.screenshot({ path: test.info().outputPath(`drawer-${width}.png`) });
    await page.keyboard.press("Escape");
  }
});

test("real Alpine/i3 accepts Polybar clicks and KMS keys and preserves a file across reload", async ({ page, context }) => {
  test.setTimeout(1080000);
  page.setDefaultTimeout(15000);
  if (process.env.POCKETOSIX_VM_DIAGNOSTICS !== "1") await observeSDK(context);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await boot(page);
  await page.screenshot({ path: "test-results/pocketosix-real-desktop.png" });
  const second = await page.context().newPage();
  await second.goto("/run");
  await second.getByRole("button", { name: "> boot", exact: true }).click();
  await expect(second.locator(".app-shell")).toHaveAttribute("data-vm-phase", "error");
  await expect(second.getByRole("heading", { name: "Your disk is open in another tab.", exact: true })).toBeVisible();
  await second.close();
  await page.bringToFront();
  const stamp = String(Date.now());
  const marker = `pocketosix-persistence-${stamp}`;
  // Contiguous expected markers are never present in keyboard input. A tty
  // echo cannot masquerade as successful guest command execution.
  await terminalCommand(page, "printf 'pocketosix-%s\\n' 'input-ready' > /tmp/pocketosix-input.txt");
  await expectGuestMarker(page, "/tmp/pocketosix-input.txt", "pocketosix-input-ready");
  await page.keyboard.press("Control+Alt+Shift+m", { delay: 100 });
  const guestMenu = page.getByRole("dialog", { name: "Desktop menu", exact: true });
  await expect(guestMenu).toBeVisible();
  await guestMenu.getByRole("button", { name: "Close", exact: true }).click();
  await terminalCommand(page, "printf 'pocketosix-%s\\n' 'menu-return-ready' > /tmp/pocketosix-menu-return.txt", false);
  await expectGuestMarker(page, "/tmp/pocketosix-menu-return.txt", "pocketosix-menu-return-ready");
  await page.locator("[data-panel-trigger=display]").click();
  await page.locator(".linux-canvas").focus();
  await page.setViewportSize({ width: 390, height: 844 });
  const mobilePanel = page.getByRole("dialog", { name: "Display", exact: true });
  await expect(mobilePanel.getByRole("button", { name: "Close panel", exact: true })).toBeFocused();
  await expect(page.locator("body > textarea[data-pocketosix-kms-input]")).not.toBeFocused();
  await mobilePanel.getByRole("button", { name: "Close panel", exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 880 });
  await terminalCommand(page, "printf 'pocketosix-%s\\n' 'resize-ready' > /tmp/pocketosix-resize.txt", false);
  await expectGuestMarker(page, "/tmp/pocketosix-resize.txt", "pocketosix-resize-ready");
  await page.mouse.move(600, 10);
  await page.getByRole("button", { name: "Immersive", exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
  await terminalCommand(page, "printf 'pocketosix-%s\\n' 'fullscreen-ready' > /tmp/pocketosix-fullscreen.txt", false);
  await expectGuestMarker(page, "/tmp/pocketosix-fullscreen.txt", "pocketosix-fullscreen-ready");
  await page.evaluate(() => document.exitFullscreen());
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    await showToolbar(page);
    await page.screenshot({ path: test.info().outputPath(`running-${width}.png`) });
    await openMenu(page);
    await page.screenshot({ path: test.info().outputPath(`drawer-${width}.png`) });
    await page.keyboard.press("Escape");
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  await openReset(page);
  await page.getByLabel("Type pocketosix to confirm").pressSequentially("DO_NOT_LEAK_TO_LINUX", { delay: 50 });
  await page.getByRole("button", { name: "Keep my disk" }).click();
  // Write only into this fresh Playwright browser profile, using real KMS keys.
  await terminalCommand(page, `printf 'pocketosix-persistence-%s\\n' '${stamp}' > /home/user/pocketosix-test.txt; sync`, false);
  await expectGuestMarker(page, "/home/user/pocketosix-test.txt", marker);
  await expectCommittedMarker(page, marker);
  await page.reload();
  await page.getByRole("button", { name: "> boot", exact: true }).click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-vm-phase", "ready", { timeout: 300000 });
  await terminalCommand(page, "cat /home/user/pocketosix-test.txt > /tmp/pocketosix-reloaded.txt");
  await expectGuestMarker(page, "/tmp/pocketosix-reloaded.txt", marker);
  await openReset(page);
  await page.getByLabel("Type pocketosix to confirm").fill("pocketosix");
  await Promise.all([page.waitForEvent("load"), page.getByRole("button", { name: "Delete disk data" }).click()]);
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "> boot", exact: true }).click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-vm-phase", "ready", { timeout: 300000 });
  await terminalCommand(page, "test ! -e /home/user/pocketosix-test.txt && printf 'pocketosix-%s\\n' 'reset-ok' > /tmp/pocketosix-reset.txt");
  await expectGuestMarker(page, "/tmp/pocketosix-reset.txt", "pocketosix-reset-ok");
  expect(errors).toEqual([]);
  if (process.env.POCKETOSIX_VM_CAPTURE === "1") {
    await page.setViewportSize({ width: 1920, height: 1200 });
    const neofetch = await guestStatus(page, "test -x /usr/bin/neofetch") === 0;
    // Launch a genuine second tile through the already verified guest shell,
    // not host vm.run() or a race-prone Polybar toggle during resize.
    await terminalCommand(page, `${neofetch ? "clear; neofetch" : "clear; uname -a; cat /etc/alpine-release"}; xterm &`, false);
    await expect.poll(() => guestStatus(page, "test $(pidof xterm | wc -w) -eq 2"), { timeout: 30000 }).toBe(0);
    await expect.poll(() => guestTextPixels(page, { x: 980, y: 82, width: 200, height: 36 }), { timeout: 30000 }).toBeGreaterThan(10);
    await page.locator(".linux-canvas").click({ position: { x: 1200, y: 200 } });
    await expect(page.locator("body > textarea[data-pocketosix-kms-input]")).toBeFocused();
    await page.keyboard.type("clear; cat /etc/os-release; printf 'pocketosix-%s\\n' 'second-tile-ready' >/tmp/pocketosix-second-tile", { delay: 35 });
    await page.keyboard.press("Enter", { delay: 100 });
    await expectGuestMarker(page, "/tmp/pocketosix-second-tile", "pocketosix-second-tile-ready");
    await expect.poll(() => guestTextPixels(page, { x: 980, y: 82, width: 300, height: 200 }), { timeout: 30000 }).toBeGreaterThan(30);
    const help = page.getByRole("button", { name: "Dismiss getting-started help", exact: true });
    if (await help.isVisible()) await help.click();
    const png = await page.locator(".linux-canvas").evaluate((canvas: HTMLCanvasElement) => {
      const copy = document.createElement("canvas");
      copy.width = canvas.width; copy.height = canvas.height;
      copy.getContext("2d")!.drawImage(canvas, 0, 0);
      return copy.toDataURL("image/png").split(",")[1];
    });
    await writeFile(test.info().outputPath("hero-desktop.png"), Buffer.from(png, "base64"));
    await test.info().attach("hero-capture-command", { body: neofetch ? "neofetch + second xterm with /etc/os-release" : "uname -a; cat /etc/alpine-release + second xterm with /etc/os-release", contentType: "text/plain" });
  }
});

test.afterEach(async ({ page }, info) => {
  if (process.env.POCKETOSIX_VM_INPUT_TRACE === "1") await info.attach("native-input-trace", { body: JSON.stringify(await page.evaluate(() => (window as unknown as { __pocketInputTrace?: unknown[] }).__pocketInputTrace)), contentType: "application/json" });
  if (process.env.POCKETOSIX_VM_DIAGNOSTICS === "1" && info.status !== info.expectedStatus) {
    const readLogs = page.evaluate(async () => {
      const vm = (window as unknown as { __pocketDiagnosticsVM?: Linux }).__pocketDiagnosticsVM;
      if (!vm) return;
      return vm.run("/bin/sh", ["-c", "{ " + [
        "printf '\\n[pocketosix] Guest diagnostics\\n'",
        "ps",
        "cat /var/log/lightdm/lightdm.log /var/log/lightdm/x-0.log /home/user/.xsession-errors",
        "ls -l /web/assets/alpine_bg.png",
      ].join("; ") + "; } > /dev/tty1 2>&1"], { uid: 0, gid: 0 });
    });
    // Reading logs is best-effort and must not extend a failed boot indefinitely.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const outcome = await Promise.race([
      readLogs.catch((error: unknown) => ({ error: String(error) })),
      new Promise((resolve) => { timer = setTimeout(() => resolve({ timeout: true }), 15000); }),
    ]);
    clearTimeout(timer);
    await info.attach("guest-diagnostics-status", { body: JSON.stringify(outcome ?? null), contentType: "application/json" });
  }
  await info.attach("guest-console", { body: await page.locator(".system-console").textContent() ?? "", contentType: "text/plain" });
  await info.attach("browser-console", { body: browserMessages.join("\n"), contentType: "text/plain" });
  await info.attach("guest-input-elements", { body: JSON.stringify(await page.locator(".desktop-stage").evaluate((stage) => ({
    active: document.activeElement?.outerHTML.slice(0, 1500),
    inputs: Array.from(stage.querySelectorAll("textarea, canvas")).map((element) => ({
      tag: element.tagName, html: element.outerHTML.slice(0, 2000),
      rect: element.getBoundingClientRect().toJSON(),
      style: { pointerEvents: getComputedStyle(element).pointerEvents, visibility: getComputedStyle(element).visibility },
    })),
    textareas: Array.from(document.querySelectorAll("textarea")).map((element) => ({ html: element.outerHTML.slice(0, 2000), rect: element.getBoundingClientRect().toJSON() })),
  }))), contentType: "application/json" });
  const frame = await page.locator(".linux-canvas").evaluate((canvas: HTMLCanvasElement) => {
      const rect = canvas.getBoundingClientRect();
      const sampler = document.createElement("canvas");
      sampler.width = canvas.width;
      sampler.height = canvas.height;
      const context = sampler.getContext("2d")!;
      context.drawImage(canvas, 0, 0);
      return {
        width: canvas.width, height: canvas.height,
        displayWidth: rect.width, displayHeight: rect.height,
        visibility: document.visibilityState,
        png: sampler.toDataURL("image/png").split(",")[1],
      };
  });
  await info.attach("guest-framebuffer", { body: Buffer.from(frame.png, "base64"), contentType: "image/png" });
  await info.attach("framebuffer-details", {
      body: JSON.stringify(frame, (key, value) => key === "png" ? undefined : value, 2),
      contentType: "application/json",
  });
});
