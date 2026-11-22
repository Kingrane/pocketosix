"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { webvm } from "@/lib/webvm";

export function useLinuxDesktop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const consoleRef = useRef<HTMLPreElement>(null);
  const snapshot = useSyncExternalStore(webvm.subscribe, webvm.getSnapshot, webvm.getServerSnapshot);

  useEffect(() => {
    if (!canvasRef.current || !consoleRef.current) return;
    return webvm.attach(canvasRef.current, consoleRef.current);
  }, []);

  return { snapshot, canvasRef, consoleRef, actions: webvm };
}
