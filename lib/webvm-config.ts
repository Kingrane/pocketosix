export const DEFAULT_DISK_URL = "wss://disks.webvm.io/alpine_20251007.ext2";
export const DEFAULT_DISK_ID = "pocketosix-alpine-20251007-v1";
export const ENGINE_VERSION = "1.4.0";

export type DiskConfig = { url: string; backend: "cloud" | "bytes"; id: string };

type DiskEnvironment = { url?: string; backend?: string; id?: string };

export function getDiskConfig(env: DiskEnvironment = {
  url: process.env.NEXT_PUBLIC_DISK_URL,
  backend: process.env.NEXT_PUBLIC_DISK_BACKEND,
  id: process.env.NEXT_PUBLIC_DISK_ID,
}): DiskConfig {
  const url = env.url || DEFAULT_DISK_URL;
  const backend = env.backend || "cloud";
  const id = env.id || DEFAULT_DISK_ID;
  if (backend !== "cloud" && backend !== "bytes") {
    throw new Error("NEXT_PUBLIC_DISK_BACKEND должен быть cloud или bytes.");
  }
  if (url !== DEFAULT_DISK_URL && (!env.id || id === DEFAULT_DISK_ID)) {
    throw new Error("Для нового образа нужен новый NEXT_PUBLIC_DISK_ID. Иначе можно повредить сохранённый диск.");
  }
  if (!/^pocketosix-[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error("NEXT_PUBLIC_DISK_ID должен начинаться с pocketosix- и содержать только буквы, цифры, - и _.");
  }
  if (!/^(https?:\/\/|wss:\/\/|\/)/.test(url) || url.startsWith("//")) {
    throw new Error("Образ должен использовать HTTPS, WSS или путь на этом сайте.");
  }
  if (backend === "bytes" && url.startsWith("wss:")) {
    throw new Error("Для HttpBytesDevice нужен HTTP(S)-адрес, не WSS.");
  }
  return { url, backend, id };
}

export function getDisplaySize(width: number, height: number) {
  const scale = Math.max(1, 1024 / Math.max(width, 1), 768 / Math.max(height, 1));
  return { width: Math.floor(Math.max(width, 1) * scale), height: Math.floor(Math.max(height, 1) * scale) };
}

export function validateLoginUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || !(url.hostname === "tailscale.com" || url.hostname.endsWith(".tailscale.com"))) {
    throw new Error("Получен неожиданный адрес авторизации Tailscale. Переход отменён.");
  }
  return url.href;
}

export function formatBytes(bytes: number | null) {
  if (bytes === null) return "—";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
