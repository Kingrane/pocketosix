import type { GuestApp } from "./guest-desktop";

export type GuestWindow = {
  containerId: number; windowId: number; title: string; className: string;
  focused: boolean; floating: boolean; hidden: boolean;
  rect: { x: number; y: number; width: number; height: number };
};
export type GuestDesktopState = {
  phase: "idle" | "checking" | "ready" | "error";
  apps: GuestApp[]; windows: GuestWindow[];
  floating: "off" | "starting" | "on" | "stopping";
  pending: string | null; error: string | null;
};
export const INITIAL_GUEST_DESKTOP: GuestDesktopState = {
  phase: "idle", apps: [], windows: [], floating: "off", pending: null, error: null,
};

// Metadata from the real i3 IPC tree, never a fabricated browser desktop.
export function guestWindows(tree: unknown): GuestWindow[] {
  const result: GuestWindow[] = [];
  function walk(value: unknown, hidden = false) {
    if (!value || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    if (node.type === "dockarea") return;
    const scratchpad = hidden || (node.type === "workspace" && node.name === "__i3_scratch");
    if (node.type === "con" && Number.isSafeInteger(node.id) && Number.isSafeInteger(node.window) && Number(node.window) > 0) {
      const properties = node.window_properties as Record<string, unknown> | undefined;
      const rect = node.rect as GuestWindow["rect"];
      if (rect && [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) {
        result.push({
          containerId: Number(node.id), windowId: Number(node.window),
          title: typeof node.name === "string" ? node.name.slice(0, 160) : "",
          className: typeof properties?.class === "string" ? properties.class : "",
          focused: node.focused === true, hidden: scratchpad,
          floating: node.floating === "auto_on" || node.floating === "user_on",
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        });
      }
    }
    for (const children of [node.nodes, node.floating_nodes]) if (Array.isArray(children)) children.forEach(child => walk(child, scratchpad));
  }
  walk(tree);
  return result;
}
