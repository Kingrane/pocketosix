export type DesktopMode = "docked" | "immersive";
export type PanelName = "display" | "terminal" | "disk" | "network" | "shortcuts" | "logs";
export type DialogName = "menu" | "reset" | "reboot" | "leave" | "palette" | null;

export const DESKTOP_PANELS: PanelName[] = ["display", "terminal", "disk", "network", "shortcuts", "logs"];
export const MENU_CHORD = "Ctrl + Alt + Shift + M";
