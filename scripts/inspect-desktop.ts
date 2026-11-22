import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import type { Linux } from "@leaningtech/cheerpx";
import { observeSDK } from "../tests/browser/observe-sdk";

// Opt-in, fresh browser profile. Never opens the user's browser storage.
async function main() {
  const sessionOnly = process.argv.includes("--session");
  const protocolOnly = process.argv.includes("--protocol");
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    await context.addCookies([{ name: "pocketosix-locale", value: "en", url: "http://localhost:3000" }]);
    await observeSDK(context);
    const page = await context.newPage();
    const start = Date.now();
    await page.goto("http://localhost:3000/run");
    await page.getByRole("button", { name: "> boot", exact: true }).click();
    await expect(page.locator(".app-shell")).toHaveAttribute("data-vm-phase", "ready", { timeout: 300000 });
    const command = (protocolOnly ? [
      "printf '\\n[desktop-inspection:start]\\n'",
      "test -x /usr/bin/python3 && /usr/bin/python3 -B --version",
      "printf '[desktop-inspection:end]\\n'",
    ] : sessionOnly ? [
      "printf '\\n[desktop-inspection:start]\\n'",
      "ls -ld /home/user/.Xauthority /tmp/i3-* /run/user/1000 /tmp/.X11-unix 2>/dev/null || true",
      "for tool in su pkill awk jq timeout; do command -v \"$tool\" || true; done",
      "for file in /home/user/.xinitrc /etc/lightdm/lightdm.conf; do if test -f \"$file\"; then echo \"[file:$file]\"; sed -n '1,220p' \"$file\"; fi; done",
      "echo '[i3:root-discovery]'; DISPLAY=:0 HOME=/home/user XAUTHORITY=/home/user/.Xauthority /usr/bin/i3 --get-socketpath",
      "echo '[i3:user-version]'; su user -c 'DISPLAY=:0 HOME=/home/user XAUTHORITY=/home/user/.Xauthority /usr/bin/i3-msg -t get_version'",
      "echo '[i3:user-tree]'; su user -c 'DISPLAY=:0 HOME=/home/user XAUTHORITY=/home/user/.Xauthority /usr/bin/i3-msg -t get_tree'",
      "echo '[i3:user-outputs]'; su user -c 'DISPLAY=:0 HOME=/home/user XAUTHORITY=/home/user/.Xauthority /usr/bin/i3-msg -t get_outputs'",
      "printf '[desktop-inspection:end]\\n'",
    ] : [
      "printf '\\n[desktop-inspection:start]\\n'",
      "id user; ps",
      "for tool in i3-msg i3 xterm rofi pcmanfm thunar openbox xfwm4 xfce4-session xdotool wmctrl xprop xrdb xset xwininfo; do command -v \"$tool\" || true; done",
      "for pid in $(pidof i3); do echo \"[i3-env:$pid]\"; tr '\\000' '\\n' < /proc/$pid/environ | grep -E '^(DISPLAY|XAUTHORITY|HOME|USER|I3SOCK|PATH)='; done",
      "for file in /home/user/.config/i3/config /home/user/.Xresources /home/user/.xsession /home/user/.config/polybar/config /home/user/.config/polybar/config.ini; do if test -f \"$file\"; then echo \"[file:$file]\"; sed -n '1,220p' \"$file\"; fi; done",
      "for file in /usr/share/applications/*pcman*.desktop /usr/share/applications/*rofi*.desktop /usr/share/applications/*terminal*.desktop; do if test -f \"$file\"; then echo \"[desktop:$file]\"; grep -E '^(Name|Exec|TryExec)=' \"$file\"; fi; done",
      "printf '[desktop-inspection:end]\\n'",
    ]).join("; ");
    const result = await page.evaluate(async ({ command, protocolOnly }) => {
      const vm = (window as unknown as { __pocketDiagnosticsVM: Linux }).__pocketDiagnosticsVM;
      return vm.run("/bin/sh", ["-c", protocolOnly ? command : `{ ${command}; } > /dev/tty1 2>&1`], { uid: 0, gid: 0, cwd: "/" });
    }, { command, protocolOnly });
    await expect(page.locator(".system-console")).toContainText("[desktop-inspection:end]");
    const log = await page.locator(".system-console").textContent() ?? "";
    const output = { date: new Date().toISOString(), profile: "Fresh isolated Playwright context", source: "Unmodified real SDK and pinned disk; read-only guest discovery", elapsedMilliseconds: Date.now() - start, status: result.status, inspection: log.slice(log.indexOf("[desktop-inspection:start]")) };
    await mkdir("artifacts/desktop-optimization", { recursive: true });
    await writeFile(`artifacts/desktop-optimization/${protocolOnly ? "guest-protocol-inspection" : sessionOnly ? "guest-session-inspection" : "guest-inspection"}.json`, JSON.stringify(output, null, 2) + "\n");
    console.log(JSON.stringify(output, null, 2));
    await page.screenshot({ path: `artifacts/desktop-optimization/${protocolOnly ? "protocol-inspection" : sessionOnly ? "session-inspection" : "baseline-desktop"}.png` });
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
