import { chromium, expect, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import type { Linux } from "@leaningtech/cheerpx";
import type { WebVMSnapshot } from "../lib/webvm-state";
import type { GuestDesktopSession, GuestWindowTarget } from "../lib/guest-desktop";

type Owner = {
  vm: Linux; log: string; guestRun: Promise<unknown> | null; guestTask: Promise<boolean> | null;
  guestSession: GuestDesktopSession; getSnapshot(): WebVMSnapshot;
  launchGuestApp(app: "terminal"): Promise<boolean>;
  inspectGuestDesktop(): Promise<boolean>;
  controlGuestWindow(target: GuestWindowTarget, action: "close" | "hide" | "restore" | "floating"): Promise<boolean>;
  toggleGuestFloating(): Promise<boolean>;
};
type RecoveryWindow = Window & typeof globalThis & { __pocketRecoveryOwner: Owner };

async function bounded<T>(task: Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([task, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Diagnostic exceeded 90 seconds; no follow-up guest commands issued")), 90000);
    })]);
  } finally { clearTimeout(timer); }
}

async function captureOwner(page: Page) {
  await page.waitForFunction(() => Object.keys(document.querySelector(".linux-canvas") ?? {}).some(key => key.startsWith("__reactFiber$")));
  await page.evaluate(() => {
    type Hook = { next: Hook | null; memoizedState: unknown };
    type Fiber = { return: Fiber | null; memoizedState: Hook | null };
    const canvas = document.querySelector(".linux-canvas")!;
    const key = Object.keys(canvas).find(key => key.startsWith("__reactFiber$"))!;
    for (let fiber = (canvas as unknown as Record<string, Fiber>)[key]; fiber; fiber = fiber.return!) {
      for (let hook = fiber.memoizedState; hook && typeof hook === "object"; hook = hook.next) {
        const state = hook.memoizedState;
        if (!Array.isArray(state) || !Array.isArray(state[1])) continue;
        const owner = state[1].find((value: Owner | null) => value && typeof value.getSnapshot === "function");
        if (owner) { Object.assign(window, { __pocketRecoveryOwner: owner }); return; }
      }
    }
    throw new Error("Cannot inspect the actual controller");
  });
}

// Real SDK on the served /run, no interception and no personal profile.
// Reset is opt-in and confined to the fresh browser context below.
// Timings include cold guest code paging; they are observations, not a speedup.
async function main() {
  const url = process.env.POCKETOSIX_CHECK_URL ?? "http://localhost:3000/run";
  const controls = process.argv.includes("--controls");
  const storage = process.argv.includes("--storage"); // Destructive only in this new, isolated context.
  const diagnoseClose = process.argv.includes("--diagnose-close");
  const directory = `artifacts/desktop-recovery/${new Date().toISOString().replace(/[:.]/g, "-")}`;
  await mkdir(directory, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: false });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies([{ name: "pocketosix-locale", value: "en", url: new URL(url).origin }]);
  await context.addInitScript("globalThis.__name = value => value;");
  const page = await context.newPage();
  const messages: string[] = [];
  page.on("console", message => messages.push(`[${message.type()}] ${message.text()}`));
  const measurements: Record<string, unknown>[] = [];
  try {
    await page.goto(url);
    await page.bringToFront();
    await captureOwner(page);
    const started = Date.now();
    await page.getByRole("button", { name: "> boot", exact: true }).click();
    await page.waitForFunction(() => document.querySelector(".app-shell")?.getAttribute("data-vm-phase") === "ready", {}, { timeout: 240000 });
    measurements.push({ operation: "boot-frame", milliseconds: Date.now() - started });
    await page.screenshot({ path: `${directory}/boot.png` });
    if (controls) {
      await page.waitForFunction(() => {
        const owner = (window as RecoveryWindow).__pocketRecoveryOwner;
        return !owner.guestTask && !owner.guestRun;
      }, {}, { timeout: 150000 });
      const guest = await page.evaluate(() => (window as RecoveryWindow).__pocketRecoveryOwner.getSnapshot().guestDesktop);
      measurements.push({ operation: "default-floating", guest });
      if (guest.floating !== "on" || guest.phase !== "ready") throw new Error("Default floating not confirmed by actual i3");
    }
    for (const command of [
      { name: "shell", file: "/bin/sh", args: ["-c", "printf '[recovery:shell]\\n'; cat /etc/alpine-release"] },
      { name: "python-import", file: "/usr/bin/python3", args: ["-B", "-c", "import json, glob, os, pwd, stat, subprocess, socket; print('[recovery:python-ready]', flush=True)"] },
      { name: "i3-config", file: "/bin/sh", args: ["-c", "printf '[recovery:i3-config]\\n'; grep -E 'set \\$mod|floating|bindsym.*space' /home/user/.config/i3/config; printf '[recovery:processes]\\n'; pidof i3 Xorg feh polybar"] },
    ]) {
      const started = Date.now();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const task = page.evaluate(command => (window as unknown as { __pocketRecoveryOwner: { vm: Linux } }).__pocketRecoveryOwner.vm.run(command.file, command.args, { uid: 0, gid: 0, cwd: "/" }), command);
      const result = await Promise.race([task, new Promise(resolve => { timer = setTimeout(() => resolve({ timeout: true }), 90000); })]).finally(() => clearTimeout(timer));
      measurements.push({ operation: command.name, milliseconds: Date.now() - started, result });
      if ((result as { timeout?: boolean }).timeout || (result as { status?: number }).status !== 0) throw new Error(`Diagnostic failed: ${command.name}`);
    }
    if (controls) {
      let started = Date.now();
      const launched = await bounded(page.evaluate(() => (window as RecoveryWindow).__pocketRecoveryOwner.launchGuestApp("terminal")));
      let guest = await page.evaluate(() => (window as RecoveryWindow).__pocketRecoveryOwner.getSnapshot().guestDesktop);
      measurements.push({ operation: "terminal-launch", milliseconds: Date.now() - started, launched, guest });
      if (guest.floating === "on" && guest.windows.some(window => window.className === "XTerm" && !window.floating)) {
        guest = await bounded(page.evaluate(async () => {
          const owner = (window as RecoveryWindow).__pocketRecoveryOwner;
          for (let attempt = 0; attempt < 5; attempt++) {
            await owner.inspectGuestDesktop();
            const guest = owner.getSnapshot().guestDesktop;
            if (guest.floating !== "on" || guest.windows.some(window => window.className === "XTerm" && window.floating)) return guest;
            await new Promise(resolve => setTimeout(resolve, 500));
          }
          return owner.getSnapshot().guestDesktop;
        }));
        measurements.push({ operation: "floating-new-window", guest });
      }
      const terminal = guest.windows.find(window => window.className === "XTerm" && !window.hidden);
      if (!launched || !terminal) throw new Error("No actual XTerm");
      if (!terminal.floating || guest.floating !== "on") {
        process.exitCode = 1;
        measurements.push({ error: "Default floating failed on a new window; continuing isolated input/wallpaper diagnostics" });
      }
      const canvas = page.locator(".linux-canvas");
      const rect = terminal.rect;
      const box = (await canvas.boundingBox())!;
      const size = await canvas.evaluate((canvas: HTMLCanvasElement) => ({ width: canvas.width, height: canvas.height }));
      await canvas.click({ position: { x: (rect.x + rect.width / 2) * box.width / size.width, y: (rect.y + rect.height / 2) * box.height / size.height } });
      await page.keyboard.press("Alt+Shift+Space", { delay: 100 });
      await bounded(page.evaluate(() => (window as RecoveryWindow).__pocketRecoveryOwner.inspectGuestDesktop()));
      const toggled = await page.evaluate(() => (window as RecoveryWindow).__pocketRecoveryOwner.getSnapshot().guestDesktop.windows);
      measurements.push({ operation: "native-alt-shift-space", windows: toggled });
      if (toggled.find(window => window.windowId === terminal.windowId)?.floating === terminal.floating) throw new Error("Native floating shortcut not confirmed");
      if (!toggled.find(window => window.windowId === terminal.windowId)?.floating) {
        const floated = await bounded(page.evaluate(target => (window as RecoveryWindow).__pocketRecoveryOwner.controlGuestWindow(target, "floating"), terminal));
        measurements.push({ operation: "targeted-floating", result: floated });
        if (!floated) throw new Error("Targeted floating failed");
      }
      started = Date.now();
      const result = await bounded(page.evaluate(async () => {
        const owner = (window as RecoveryWindow).__pocketRecoveryOwner;
        // Isolated guest only. Inspect socket and home, never read X11 cookies.
        return owner.vm.run("/usr/bin/python3", ["-B", "-c", [
          "import glob, os, pwd, subprocess",
          "sockets = glob.glob('/tmp/.X11-unix/X[0-9]*')",
          "assert len(sockets) == 1, 'Ambiguous X display'",
          "home = pwd.getpwuid(os.getuid()).pw_dir",
          "auth = home + '/.Xauthority'",
          "assert os.path.isfile(auth), 'No user X authority file'",
          "env = dict(os.environ, DISPLAY=':' + os.path.basename(sockets[0])[1:], XAUTHORITY=auth, HOME=home)",
          "result = subprocess.run(['/usr/bin/feh', '--no-fehbg', '--bg-fill', '--geometry', '-0-0', '/web/assets/alpine_bg.png'], env=env, timeout=60)",
          "print('[recovery:rgb-wallpaper-exit]', result.returncode, flush=True)",
          "raise SystemExit(result.returncode)",
        ].join("\n")], { uid: owner.guestSession.uid, gid: owner.guestSession.gid, cwd: "/" });
      }));
      measurements.push({ operation: "rgb-wallpaper", milliseconds: Date.now() - started, result });
      if (result.status !== 0) throw new Error("RGB wallpaper failed");
      await page.screenshot({ path: `${directory}/rgb-wallpaper.png` });
      // Isolated test file: prove command execution, not only tty echo or a key event.
      await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
      await expect(page.locator("body > textarea[data-pocketosix-kms-input]")).toBeFocused();
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await page.keyboard.type("printf 'recovery-%s\\n' rgb-ok > /tmp/pocketosix-rgb-input", { delay: 100 });
      await page.keyboard.press("Enter", { delay: 100 });
      const inputResult = await bounded(page.evaluate(async () => {
        const owner = (window as RecoveryWindow).__pocketRecoveryOwner;
        for (let attempt = 0; attempt < 10; attempt++) {
          const result = await owner.vm.run("/bin/sh", ["-c", "grep -qx 'recovery-rgb-ok' /tmp/pocketosix-rgb-input"], { uid: 0, gid: 0, cwd: "/" });
          if (result.status === 0) return result;
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        return { status: 1 };
      }));
      measurements.push({ operation: "native-input-after-wallpaper", result: inputResult });
      if (inputResult.status !== 0) throw new Error("Native input after wallpaper not confirmed");
      for (const action of ["hide", "restore", "close"] as const) {
        const result = await bounded(page.evaluate(({ target, action }) => (window as RecoveryWindow).__pocketRecoveryOwner.controlGuestWindow(target, action), { target: terminal, action }));
        const windows = await page.evaluate(() => (window as RecoveryWindow).__pocketRecoveryOwner.getSnapshot().guestDesktop.windows);
        measurements.push({ operation: `targeted-${action}`, result, windows });
        const targetWindow = windows.find(window => window.windowId === terminal.windowId);
        if (!result || (action === "close" ? Boolean(targetWindow) : targetWindow?.hidden !== (action === "hide"))) {
          if (action !== "close" || !diagnoseClose) throw new Error(`Targeted ${action} not confirmed`);
          process.exitCode = 1; // Later successful checks must not hide this failure.
          const config = await bounded(page.evaluate(async () => {
            const owner = (window as RecoveryWindow).__pocketRecoveryOwner;
            return owner.vm.run("/usr/bin/python3", ["-B", "-c", [
              "import subprocess, sys",
              "result = subprocess.run(['/usr/bin/i3-msg', '-s', sys.argv[1], '-t', 'get_config'], capture_output=True, text=True, check=True, timeout=10)",
              "config = result.stdout", // i3-msg prints config text unless --raw is requested.
              "assert 'set $mod Mod1' in config and 'bindsym $mod+Shift+q kill' in config, 'Native close binding not confirmed'",
              "print('[recovery:native-close-binding-confirmed]', flush=True)",
            ].join("\n"), owner.guestSession.socketPath], { uid: owner.guestSession.uid, gid: owner.guestSession.gid, cwd: "/" });
          }));
          measurements.push({ operation: "native-close-binding", result: config });
          if (config.status !== 0) throw new Error("Native close binding unavailable");
          // Separate diagnostic action in this disposable guest, never an automatic
          // production retry or forced kill. Only the one test XTerm is present.
          if (windows.length !== 1 || targetWindow?.className !== "XTerm") throw new Error("Ambiguous native close diagnostic target");
          await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
          await page.keyboard.press("Alt+Shift+q", { delay: 100 });
          await bounded(page.evaluate(async target => {
            const owner = (window as RecoveryWindow).__pocketRecoveryOwner;
            for (let attempt = 0; attempt < 10; attempt++) {
              await owner.inspectGuestDesktop();
              if (!owner.getSnapshot().guestDesktop.windows.some(window => window.windowId === target.windowId && window.containerId === target.containerId)) return;
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          }, terminal));
          const nativeWindows = await page.evaluate(() => (window as RecoveryWindow).__pocketRecoveryOwner.getSnapshot().guestDesktop.windows);
          measurements.push({ operation: "native-close-diagnostic", windows: nativeWindows, closed: !nativeWindows.some(window => window.windowId === terminal.windowId && window.containerId === terminal.containerId) });
        }
      }
      const stopped = await bounded(page.evaluate(() => (window as RecoveryWindow).__pocketRecoveryOwner.toggleGuestFloating()));
      const final = await page.evaluate(() => (window as RecoveryWindow).__pocketRecoveryOwner.getSnapshot().guestDesktop);
      measurements.push({ operation: "floating-stop", stopped, guest: final });
      if (!stopped || final.floating !== "off") throw new Error("Floating stop not confirmed");
    }
    if (storage) {
      const second = await context.newPage();
      await second.goto(url);
      await second.getByRole("button", { name: "> boot", exact: true }).click();
      await expect(second.getByRole("heading", { name: "Your disk is open in another tab.", exact: true })).toBeVisible();
      measurements.push({ operation: "second-writer-lock", rejected: true });
      await second.close();
      await page.bringToFront();
      const marker = `recovery-persist-${Date.now()}`;
      const written = await bounded(page.evaluate(marker => (window as RecoveryWindow).__pocketRecoveryOwner.vm.run("/bin/sh", ["-c", 'printf "%s\\n" "$1" > /home/user/pocketosix-recovery-persist; sync', "recovery-write", marker], { uid: 0, gid: 0, cwd: "/" }), marker));
      if (written.status !== 0) throw new Error("Persistence write failed");
      // Read-only check of the real SDK block store, not an invented flush API.
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
      measurements.push({ operation: "committed-test-marker", result: written });
      await page.reload();
      await expect(page.locator(".app-shell")).toHaveAttribute("data-vm-phase", "idle");
      await captureOwner(page);
      await page.getByRole("button", { name: "> boot", exact: true }).click();
      await expect(page.locator(".app-shell")).toHaveAttribute("data-vm-phase", "ready", { timeout: 240000 });
      await page.waitForFunction(() => !(window as RecoveryWindow).__pocketRecoveryOwner.guestTask && !(window as RecoveryWindow).__pocketRecoveryOwner.guestRun, {}, { timeout: 150000 });
      const reopened = await bounded(page.evaluate(marker => (window as RecoveryWindow).__pocketRecoveryOwner.vm.run("/bin/sh", ["-c", 'grep -qx "$1" /home/user/pocketosix-recovery-persist', "recovery-read", marker], { uid: 0, gid: 0, cwd: "/" }), marker));
      measurements.push({ operation: "reload-reopens-test-disk", result: reopened });
      if (reopened.status !== 0) throw new Error("Committed file did not survive reload");
      await page.locator('[data-panel-trigger="disk"]').click();
      await page.getByRole("button", { name: "Reset disk", exact: true }).click();
      await page.getByLabel("Type pocketosix to confirm").fill("pocketosix");
      await Promise.all([page.waitForEvent("load"), page.getByRole("button", { name: "Delete disk data" }).click()]);
      await captureOwner(page);
      await page.getByRole("button", { name: "> boot", exact: true }).click();
      await expect(page.locator(".app-shell")).toHaveAttribute("data-vm-phase", "ready", { timeout: 240000 });
      await page.waitForFunction(() => !(window as RecoveryWindow).__pocketRecoveryOwner.guestTask && !(window as RecoveryWindow).__pocketRecoveryOwner.guestRun, {}, { timeout: 150000 });
      const cleared = await bounded(page.evaluate(() => (window as RecoveryWindow).__pocketRecoveryOwner.vm.run("/bin/sh", ["-c", "test ! -e /home/user/pocketosix-recovery-persist"], { uid: 0, gid: 0, cwd: "/" })));
      measurements.push({ operation: "confirmed-reset-clears-test-disk", result: cleared });
      if (cleared.status !== 0) throw new Error("Confirmed reset did not clear test marker");
    }
  } catch (error) { process.exitCode = 1; measurements.push({ error: String(error) }); }
  finally {
    const state = await page.evaluate(() => {
      const owner = (window as unknown as { __pocketRecoveryOwner?: { log: string; getSnapshot(): WebVMSnapshot } }).__pocketRecoveryOwner;
      return owner ? { snapshot: owner.getSnapshot(), log: owner.log } : null;
    }).catch(() => null);
    await writeFile(`${directory}/observation.json`, JSON.stringify({ url, browser: browser.version(), measurements, state }, null, 2));
    await writeFile(`${directory}/browser-console.txt`, messages.join("\n"));
    await page.screenshot({ path: `${directory}/final.png` }).catch(() => {});
    console.log(JSON.stringify({ directory, measurements }));
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
