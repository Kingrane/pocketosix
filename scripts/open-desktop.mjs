import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DESKTOP_URL = "http://localhost:3000/run";
const STARTUP_TIMEOUT_MS = 120_000;

export function nextArguments(cliPath) {
  // An explicit port disables Next's automatic retry on another origin.
  return [cliPath, "dev", "--webpack", "--port", "3000"];
}

export function browserCommand(platform) {
  if (platform === "win32") return ["cmd.exe", ["/c", "start", "", DESKTOP_URL]];
  if (platform === "darwin") return ["open", [DESKTOP_URL]];
  if (platform === "linux") return ["xdg-open", [DESKTOP_URL]];
  throw new Error(`Automatic browser opening is unsupported on ${platform}.`);
}

export function createReadyDetector() {
  let output = "";
  return (chunk) => {
    output = (output + chunk).slice(-4096);
    return /\bReady in\s+\S+/.test(output);
  };
}

function openBrowser() {
  try {
    const [command, args] = browserCommand(process.platform);
    const browser = spawn(command, args, { stdio: "ignore", windowsHide: true });
    browser.once("error", (error) => {
      console.error(`Could not open a browser: ${error.message}. Open ${DESKTOP_URL} manually.`);
    });
    browser.once("exit", (code) => {
      if (code !== 0) console.error(`Browser opener exited with ${code}. Open ${DESKTOP_URL} manually.`);
    });
  } catch (error) {
    console.error(`${error.message} Open ${DESKTOP_URL} manually.`);
  }
}

function launchDesktop() {
  const require = createRequire(import.meta.url);
  const cliPath = require.resolve("next/dist/bin/next");
  const child = spawn(process.execPath, nextArguments(cliPath), {
    cwd: resolve(dirname(fileURLToPath(import.meta.url)), ".."),
    stdio: ["inherit", "pipe", "inherit"],
  });
  const startup = new AbortController();
  const isReady = createReadyDetector();
  let checking = false;
  let stopping = false;

  const stop = () => {
    if (stopping) return;
    stopping = true;
    clearTimeout(timeout);
    startup.abort();
    // Never find or terminate an existing server by its port or process name.
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGINT");
  };
  const fail = (message) => {
    console.error(message);
    process.exitCode = 1;
    stop();
  };
  const timeout = setTimeout(() => {
    fail(`No ready /run response within ${STARTUP_TIMEOUT_MS / 1000}s; browser not opened. This is a web-server timeout, not a Linux boot result.`);
  }, STARTUP_TIMEOUT_MS);

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  child.once("error", (error) => {
    clearTimeout(timeout);
    startup.abort();
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    console.error(`Could not start the installed Next.js CLI: ${error.message}`);
    process.exitCode = 1;
  });
  child.once("exit", (code, signal) => {
    clearTimeout(timeout);
    startup.abort();
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    if (code !== 0 && !stopping) {
      console.error(`Next.js exited (${code ?? signal}). Port 3000 must be free; no existing server is reused and no alternate port is selected.`);
    }
    process.exitCode = process.exitCode || code || (signal && !stopping ? 1 : 0);
  });

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", async (chunk) => {
    process.stdout.write(chunk);
    if (checking || stopping || !isReady(chunk)) return;
    checking = true;
    try {
      // Next 16 logs Ready before loading config; the route must respond too.
      const response = await fetch(DESKTOP_URL, { redirect: "manual", signal: startup.signal });
      await response.body?.cancel();
      if (response.status !== 200) throw new Error(`/run returned HTTP ${response.status}`);
      if (startup.signal.aborted || child.exitCode !== null || child.signalCode !== null) return;
      clearTimeout(timeout);
      console.log(`Opening ${DESKTOP_URL}. Click > boot to start the guest; Linux has not been started by this launcher.`);
      openBrowser();
    } catch (error) {
      if (!startup.signal.aborted) fail(`Desktop page unavailable: ${error.message}. Browser not opened.`);
    }
  });
}

// Importing helpers for unit tests must not start a server or open a browser.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    launchDesktop();
  } catch (error) {
    console.error(`Desktop launcher: ${error.message}. Install dependencies with npm install first.`);
    process.exitCode = 1;
  }
}
