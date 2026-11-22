import type { Device, IDBDevice, Linux } from "@leaningtech/cheerpx";
import { getDiskConfig, getDisplaySize, validateLoginUrl } from "./webvm-config";
import { INITIAL_SNAPSHOT, type VMError, type WebVMSnapshot } from "./webvm-state";

type Mount = { type: "ext2" | "dir" | "devs" | "devpts" | "proc" | "sys"; path: string; dev?: Device };
type NetworkMap = { self?: { addresses?: string[] }; peers?: { exitNode?: boolean }[] };
type CreateOptions = {
  mounts: Mount[];
  networkInterface: {
    loginUrlCb: (url: string) => void;
    stateUpdateCb: (state: number) => void;
    netmapUpdateCb: (map: NetworkMap) => void;
  };
};

class BootFailure extends Error {
  constructor(public info: VMError) { super(info.message); }
}
class BootCancelled extends Error {}

// One owner for the VM, DOM binding, callbacks, disk lock and resources.
// React StrictMode's setup → cleanup → setup cancels the deferred teardown;
// it does not import the SDK or create a second writable VM.
class WebVMController {
  private snapshot = INITIAL_SNAPSHOT;
  private listeners = new Set<() => void>();
  private canvas: HTMLCanvasElement | null = null;
  private consoleElement: HTMLPreElement | null = null;
  private vm: Linux | null = null;
  private idb: IDBDevice | null = null;
  private devices: Device[] = [];
  private callbacks: { name: string; callback: (state: string | number) => void }[] = [];
  private lifetime = 0;
  private bootTask: Promise<void> | null = null;
  private cleanupTask: Promise<void> | null = null;
  private owners = 0;
  private teardown: ReturnType<typeof setTimeout> | null = null;
  private slowTimer: ReturnType<typeof setTimeout> | null = null;
  private storageTimer: ReturnType<typeof setInterval> | null = null;
  private frameTimer: ReturnType<typeof setInterval> | null = null;
  private activityTimer: ReturnType<typeof setInterval> | null = null;
  private activity = { cpu: false, disk: false };
  private displaySize: { width: number; height: number } | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private releaseLock: (() => void) | null = null;
  private loginWindow: Window | null = null;
  private decoder = new TextDecoder();
  private log = "";
  private terminalLog = "";
  private terminalDecoder = new TextDecoder();
  private terminalListeners = new Set<(text: string) => void>();
  private consoleInput: ((keyCode: number) => void) | null = null;
  private bootStarted = 0;
  private resetting = false;

  getSnapshot = () => this.snapshot;
  getServerSnapshot = () => INITIAL_SNAPSHOT;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private update(next: Partial<WebVMSnapshot>) {
    this.snapshot = { ...this.snapshot, ...next };
    this.listeners.forEach((listener) => listener());
  }

  attach(canvas: HTMLCanvasElement, consoleElement: HTMLPreElement) {
    if (this.teardown) clearTimeout(this.teardown);
    this.teardown = null;
    this.owners++;
    if (this.canvas !== canvas) this.displaySize = null;
    this.canvas = canvas;
    this.consoleElement = consoleElement;
    consoleElement.textContent = this.log;
    if (this.vm) {
      this.resize();
    }
    return () => {
      this.owners--;
      if (!this.owners) {
        this.canvas = null;
        this.consoleElement = null;
        this.teardown = setTimeout(() => { void this.dispose(); }, 250);
      }
    };
  }

  start = () => {
    if (this.resetting || this.bootTask || !["idle", "stopped"].includes(this.snapshot.phase)) return;
    void (this.cleanupTask ?? Promise.resolve()).then(() => {
      if (!this.owners || this.resetting || this.bootTask || !this.canvas) return;
      const task = this.boot(++this.lifetime);
      this.bootTask = task;
      void task.then(() => { if (this.bootTask === task) this.bootTask = null; });
    });
  };

  attachTerminal = (write: (text: string) => void) => {
    write(this.terminalLog);
    this.terminalListeners.add(write);
    return () => { this.terminalListeners.delete(write); };
  };

  sendTerminal = (text: string) => {
    if (!this.snapshot.consoleReady || document.querySelector("dialog:modal")) return;
    // Official WebVM custom-console contract. KMS keyboard/mouse input remains
    // entirely owned by the SDK; this function feeds only the tty1 console.
    for (let i = 0; i < text.length; i++) this.consoleInput?.(text.charCodeAt(i));
  };

  private active(token: number) { return token === this.lifetime; }
  private check(token: number) { if (!this.active(token)) throw new BootCancelled(); }
  private own<T extends Device>(device: T, token: number): T {
    if (!this.active(token)) { device.delete(); throw new BootCancelled(); }
    this.devices.push(device);
    return device;
  }

  private async lockDisk(name: string, token: number) {
    await new Promise<void>((resolve, reject) => {
      void navigator.locks.request(name, { ifAvailable: true }, async (lock) => {
        if (!lock) {
          reject(new BootFailure({ code: "disk-locked", title: "Linux уже открыт в другой вкладке",
            message: "Закройте другую вкладку PocketOSix и обновите эту страницу. Два процесса не должны одновременно записывать один диск.", detail: name }));
          return;
        }
        if (!this.active(token)) { resolve(); return; }
        await new Promise<void>((release) => { this.releaseLock = release; resolve(); });
      }).catch(reject);
    });
    this.check(token);
  }

  private async boot(token: number) {
    this.bootStarted = performance.now();
    this.update({ ...INITIAL_SNAPSHOT, phase: "checking" });
    try {
      if (!window.crossOriginIsolated) throw new BootFailure({ code: "isolation", title: "Браузеру нужна изоляция",
        message: "SharedArrayBuffer недоступен. Откройте сайт по HTTPS или localhost с заголовками COOP: same-origin и COEP: require-corp.", detail: "window.crossOriginIsolated = false" });
      if (!window.isSecureContext || typeof SharedArrayBuffer === "undefined" || typeof WebAssembly === "undefined" || !navigator.locks || !window.indexedDB) {
        throw new BootFailure({ code: "unsupported", title: "Этот браузер пока не подходит",
          message: "Используйте актуальный Chrome или Edge на компьютере. Нужны WebAssembly, SharedArrayBuffer, IndexedDB и Web Locks.", detail: navigator.userAgent });
      }
      const config = getDiskConfig();
      await this.lockDisk(config.id, token);
      this.update({ phase: "engine" });
      this.appendLog("[pocketosix] Loading CheerpX 1.4.0 from the official CDN…\n");
      const sdk = await import("@leaningtech/cheerpx");
      this.check(token);
      this.update({ phase: "disk" });
      // A confirmed reset crosses a full document reload first. That reliably
      // ends the old guest's workers before any persisted blocks are erased.
      if (sessionStorage.getItem("pocketosix:reset-disk") === config.id) {
        this.appendLog("[pocketosix] Clearing the explicitly confirmed disk before starting any guest processes…\n");
        const resetDevice = this.own(await sdk.IDBDevice.create(config.id), token);
        await resetDevice.reset();
        this.check(token);
        resetDevice.delete();
        this.devices.pop();
        sessionStorage.removeItem("pocketosix:reset-disk");
      }
      this.appendLog(`[pocketosix] Mounting ${config.id}\n`);
      let base: Device;
      if (config.backend === "bytes") {
        base = this.own(await sdk.HttpBytesDevice.create(config.url), token);
      } else {
        try { base = this.own(await sdk.CloudDevice.create(config.url), token); }
        catch (error) {
          this.check(token);
          if (!config.url.startsWith("wss:")) throw error;
          this.appendLog("[pocketosix] WebSocket disk unavailable; trying HTTPS transport…\n");
          base = this.own(await sdk.CloudDevice.create(config.url.replace(/^wss:/, "https:")), token);
        }
      }
      this.idb = this.own(await sdk.IDBDevice.create(config.id), token);
      const root = this.own(await sdk.OverlayDevice.create(base, this.idb), token);
      // Match upstream WebVM: the SDK appends "/" before guest paths. Passing
      // "/" would produce "//assets/" (a different host), not the origin root.
      const web = this.own(await sdk.WebDevice.create(""), token);
      // The upstream npm mount union omits devpts/sys and requires dev on
      // pseudo-filesystems. These mounts match the official Alpine WebVM.
      const createLinux = sdk.Linux.create as unknown as (options: CreateOptions) => Promise<Linux>;
      const vm = await createLinux({
        mounts: [
          { type: "ext2", path: "/", dev: root },
          { type: "dir", path: "/web", dev: web },
          { type: "devs", path: "/dev" },
          { type: "devpts", path: "/dev/pts" },
          { type: "proc", path: "/proc" },
          { type: "sys", path: "/sys" },
        ],
        networkInterface: {
          loginUrlCb: (url) => { if (this.active(token)) this.onLoginUrl(url); },
          stateUpdateCb: (state) => {
            if (!this.active(token)) return;
            if (state === 6) this.update({ network: { ...this.snapshot.network, phase: "connected", error: null, loginUrl: null } });
            else if (this.snapshot.network.phase === "connected") {
              this.update({ network: { ...INITIAL_SNAPSHOT.network } });
            }
          },
          netmapUpdateCb: (map) => {
            if (!this.active(token)) return;
            this.update({ network: { ...this.snapshot.network,
              ip: map.self?.addresses?.[0]?.split("/")[0] ?? null,
              exitNode: map.peers?.some((peer) => peer.exitNode === true) ?? false } });
          },
        },
      });
      if (!this.active(token)) { vm.delete(); throw new BootCancelled(); }
      this.vm = vm;
      if (typeof vm.setKmsCanvas !== "function" || typeof vm.networkLogin !== "function") {
        throw new Error("CheerpX runtime does not expose the official WebVM graphics/network API.");
      }
      this.addCallback("cpuActivity", (state) => { this.activity.cpu = state !== "ready"; }, token);
      this.addCallback("diskActivity", (state) => { this.activity.disk = state !== "ready"; }, token);
      this.activityTimer = setInterval(() => {
        if (this.active(token) && (this.snapshot.cpuBusy !== this.activity.cpu || this.snapshot.diskBusy !== this.activity.disk)) {
          this.update({ cpuBusy: this.activity.cpu, diskBusy: this.activity.disk });
        }
      }, 500);
      this.consoleInput = vm.setCustomConsole((buffer, vt) => {
        if (!this.active(token)) return;
        this.appendLog(this.decoder.decode(buffer, { stream: true }));
        if (vt === 1) {
          const text = this.terminalDecoder.decode(buffer, { stream: true });
          this.terminalLog = (this.terminalLog + text).slice(-60000);
          this.terminalListeners.forEach((write) => write(text));
        }
      }, 100, 30);
      this.update({ consoleReady: true });
      vm.setActivateConsole((vt) => {
        if (!this.active(token)) return;
        if (vt === 7) {
          this.waitForFrame(token);
        }
      });
      this.resize();
      this.resizeObserver = new ResizeObserver(() => this.resize());
      if (this.canvas) this.resizeObserver.observe(this.canvas);
      this.update({ phase: "starting" });
      this.slowTimer = setTimeout(() => { if (this.active(token) && this.snapshot.phase === "starting") this.update({ bootSlow: true }); }, 90000);
      void this.refreshStorage();
      this.storageTimer = setInterval(() => { void this.refreshStorage(); }, 15000);
      // run() lasts for the lifetime of init. Readiness comes from Xorg's VT7,
      // not from resolving this promise or a made-up loading percentage.
      void vm.run("/sbin/init", [], { uid: 0, gid: 0 }).then(({ status }) => {
        if (this.active(token)) this.fail(new Error(`Linux init exited with status ${status}.`));
      }).catch((error: unknown) => { if (this.active(token)) this.fail(error); });
    } catch (error) {
      if (!(error instanceof BootCancelled) && this.active(token)) this.fail(error);
    }
  }

  private addCallback(name: string, callback: (state: string | number) => void, token: number) {
    const guarded = (state: string | number) => { if (this.active(token)) callback(state); };
    this.vm?.registerCallback(name, guarded);
    this.callbacks.push({ name, callback: guarded });
  }

  private fail(error: unknown) {
    const phase = this.snapshot.phase;
    const detail = error instanceof Error ? error.message : String(error);
    const info = error instanceof BootFailure ? error.info : {
      code: phase === "disk" ? "disk" : "runtime",
      title: phase === "disk" ? "Не удалось подключить Linux-диск" : "Не удалось запустить Linux",
      message: "Проверьте доступ к CDN Leaning Technologies и дисковому сервису. Расширения, VPN или корпоративная сеть могут блокировать загрузку. Сохранения не сброшены.",
      detail,
    };
    this.appendLog(`[pocketosix] ${info.title}: ${info.detail}\n`);
    void this.dispose(false);
    this.update({ phase: "error", error: info, bootSlow: false });
  }

  private appendLog(text: string) {
    this.log = (this.log + text).slice(-40000);
    if (this.consoleElement) {
      this.consoleElement.textContent = this.log;
      this.consoleElement.scrollTop = this.consoleElement.scrollHeight;
    }
  }

  private resize() {
    if (!this.vm || !this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const size = getDisplaySize(rect.width, rect.height);
    if (this.displaySize?.width === size.width && this.displaySize.height === size.height) return;
    this.vm.setKmsCanvas(this.canvas, size.width, size.height);
    this.displaySize = size;
  }

  private waitForFrame(token: number) {
    if (this.frameTimer || this.snapshot.phase === "ready") return;
    const sampler = document.createElement("canvas");
    sampler.width = sampler.height = 32;
    const context = sampler.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    this.frameTimer = setInterval(() => {
      if (!this.active(token) || !this.canvas) return;
      context.drawImage(this.canvas, 0, 0, 32, 32);
      const pixels = context.getImageData(0, 0, 32, 32).data;
      for (let i = 4; i < pixels.length; i += 4) {
        if (pixels[i + 3] && (pixels[i] !== pixels[0] || pixels[i + 1] !== pixels[1] || pixels[i + 2] !== pixels[2])) {
          if (this.frameTimer) clearInterval(this.frameTimer);
          this.frameTimer = null;
          if (this.slowTimer) clearTimeout(this.slowTimer);
          this.update({ phase: "ready", bootSlow: false, bootMilliseconds: performance.now() - this.bootStarted });
          // Readiness must not steal focus from tty1 or browser controls.
          // KMS focus and input remain owned by the SDK and the user's click.
          return;
        }
      }
    }, 500);
  }

  connectNetwork = () => {
    if (!this.vm || this.snapshot.phase !== "ready") return;
    if (this.snapshot.network.phase === "connecting" || this.snapshot.network.phase === "login") return;
    this.loginWindow = window.open("/tailscale-login", "_blank", "popup,width=640,height=760");
    const token = this.lifetime;
    this.update({ network: { ...this.snapshot.network, phase: "connecting", error: null, loginUrl: null } });
    try {
      void Promise.resolve(this.vm.networkLogin()).catch((error: unknown) => {
        if (!this.active(token)) return;
        this.loginWindow?.close();
        this.update({ network: { ...this.snapshot.network, phase: "error", error: String(error) } });
      });
    }
    catch (error) {
      this.loginWindow?.close();
      this.update({ network: { ...this.snapshot.network, phase: "error", error: String(error) } });
    }
  };

  private onLoginUrl(value: string) {
    try {
      const url = validateLoginUrl(value);
      this.update({ network: { ...this.snapshot.network, phase: "login", loginUrl: url, error: null } });
      if (this.loginWindow && !this.loginWindow.closed) this.loginWindow.location.replace(url);
    } catch (error) {
      this.loginWindow?.close();
      this.update({ network: { ...this.snapshot.network, phase: "error", error: String(error) } });
    }
  }

  private async refreshStorage() {
    const token = this.lifetime;
    try {
      const [estimate, persistent] = await Promise.all([navigator.storage.estimate(), navigator.storage.persisted()]);
      if (this.active(token)) this.update({ storage: { usage: estimate.usage ?? null, quota: estimate.quota ?? null, persistent, checked: true } });
    } catch { /* Storage estimates are optional; they must not stop Linux. */ }
  }

  protectStorage = async () => {
    try {
      const granted = await navigator.storage.persist();
      await this.refreshStorage();
      if (!granted) this.update({ operationError: "Браузер не разрешил защиту от автоматической очистки. Диск остаётся сохранённым, но может быть удалён при нехватке места." });
    } catch (error) { this.update({ operationError: String(error) }); }
  };

  clearOperationError = () => this.update({ operationError: null });

  resetDisk = async () => {
    if (!this.idb || this.resetting) return;
    this.resetting = true;
    // Keep the lock until document unload. The next document acquires its own
    // lock and clears this specific overlay BEFORE creating a Linux instance.
    try {
      sessionStorage.setItem("pocketosix:reset-disk", getDiskConfig().id);
      window.location.reload();
    }
    catch (error) {
      this.resetting = false;
      this.update({ operationError: `Не удалось начать сброс диска: ${String(error)}. Сохранения не удалены.` });
    }
  };

  private stopRuntime() {
    this.lifetime++;
    this.consoleInput = null;
    this.update({ consoleReady: false });
    if (this.slowTimer) clearTimeout(this.slowTimer);
    if (this.storageTimer) clearInterval(this.storageTimer);
    if (this.frameTimer) clearInterval(this.frameTimer);
    if (this.activityTimer) clearInterval(this.activityTimer);
    this.slowTimer = null;
    this.storageTimer = null;
    this.frameTimer = null;
    this.activityTimer = null;
    this.displaySize = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    for (const { name, callback } of this.callbacks) this.vm?.unregisterCallback(name, callback);
    this.callbacks = [];
    this.vm?.delete();
    this.vm = null;
  }

  private dispose(markStopped = true): Promise<void> {
    if (this.resetting) return Promise.resolve();
    if (this.cleanupTask) return this.cleanupTask;
    this.lifetime++;
    const pendingFactory = this.bootTask;
    if (markStopped) this.update({ phase: "stopped", cpuBusy: false, diskBusy: false });
    // Factories cannot be aborted. Keep their dependencies and disk lock alive
    // until their late result has been deleted by the generation guard.
    const task = (async () => {
      await pendingFactory;
      this.stopRuntime();
      for (const device of this.devices.reverse()) {
        try { device.delete(); } catch { /* Continue releasing remaining handles. */ }
      }
      this.devices = [];
      this.idb = null;
      this.releaseLock?.();
      this.releaseLock = null;
    })();
    this.cleanupTask = task;
    void task.then(() => { if (this.cleanupTask === task) this.cleanupTask = null; });
    return task;
  }
}

export const webvm = new WebVMController();

// A running WASM guest must not be hot-swapped for a new JS controller while
// its workers still own the disk. Runtime/config edits get a real reload;
// ordinary UI/CSS edits can continue using React Fast Refresh.
if (import.meta.webpackHot) {
  import.meta.webpackHot.dispose(() => {
    if (typeof window !== "undefined") window.location.reload();
  });
}
