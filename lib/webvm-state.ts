export type BootPhase = "idle" | "checking" | "engine" | "disk" | "starting" | "ready" | "error" | "stopped";
export type NetworkPhase = "disconnected" | "connecting" | "login" | "connected" | "error";

export type VMError = { code: string; title: string; message: string; detail: string };

export type WebVMSnapshot = {
  phase: BootPhase;
  error: VMError | null;
  bootSlow: boolean;
  bootMilliseconds: number | null;
  consoleReady: boolean;
  cpuBusy: boolean;
  diskBusy: boolean;
  storage: { usage: number | null; quota: number | null; persistent: boolean; checked: boolean };
  network: { phase: NetworkPhase; ip: string | null; exitNode: boolean; loginUrl: string | null; error: string | null };
  operationError: string | null;
  guestDesktop: GuestDesktopState;
};

export const INITIAL_SNAPSHOT: WebVMSnapshot = {
  phase: "idle", error: null, bootSlow: false, cpuBusy: false, diskBusy: false,
  bootMilliseconds: null, consoleReady: false,
  storage: { usage: null, quota: null, persistent: false, checked: false },
  network: { phase: "disconnected", ip: null, exitNode: false, loginUrl: null, error: null },
  operationError: null,
  guestDesktop: INITIAL_GUEST_DESKTOP,
};

export const BOOT_STEPS: { phase: BootPhase; label: string; detail: string }[] = [
  { phase: "checking", label: "Проверяем браузер", detail: "SharedArrayBuffer · WebAssembly · IndexedDB" },
  { phase: "engine", label: "Загружаем CheerpX", detail: "Вычисления останутся на вашем устройстве" },
  { phase: "disk", label: "Подключаем постоянный диск", detail: "Alpine Linux · сохранения в этом браузере" },
  { phase: "starting", label: "Запускаем рабочий стол", detail: "Xorg · i3 window manager" },
];
import { INITIAL_GUEST_DESKTOP, type GuestDesktopState } from "./guest-desktop-state";
