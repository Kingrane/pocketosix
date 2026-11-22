import { test } from "node:test";
import assert from "node:assert/strict";

// The launcher stays plain Node; importing helpers must have no side effects.
const launcherPath = "../../scripts/open-desktop.mjs";
const launcherModule = import(launcherPath);

test("desktop uses the installed CLI, webpack and a fixed explicit port", async () => {
  const launcher = await launcherModule;
  assert.deepEqual(launcher.nextArguments("C:\\project\\next-cli"), ["C:\\project\\next-cli", "dev", "--webpack", "--port", "3000"]);
  assert.equal(launcher.DESKTOP_URL, "http://localhost:3000/run");
});

test("browser openers always receive the fixed /run URL without a shell option", async () => {
  const launcher = await launcherModule;
  assert.deepEqual(launcher.browserCommand("win32"), ["cmd.exe", ["/c", "start", "", "http://localhost:3000/run"]]);
  assert.deepEqual(launcher.browserCommand("darwin"), ["open", ["http://localhost:3000/run"]]);
  assert.deepEqual(launcher.browserCommand("linux"), ["xdg-open", ["http://localhost:3000/run"]]);
  assert.throws(() => launcher.browserCommand("unknown"), /unsupported/);
});

test("startup output is not readiness and split Ready output is detected", async () => {
  const launcher = await launcherModule;
  const ready = launcher.createReadyDetector();
  assert.equal(ready("Local: http://localhost:3000\nStarting...\n"), false);
  assert.equal(ready("✓ Rea"), false);
  assert.equal(ready("dy in 2.1s\n"), true);
});

test("Next startup failure cannot trigger a browser-ready result", async () => {
  const launcher = await launcherModule;
  const ready = launcher.createReadyDetector();
  assert.equal(ready("Failed to start server\nError: listen EADDRINUSE: address already in use :::3000\n"), false);
});
