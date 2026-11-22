"use client";

import { useEffect, type RefObject } from "react";

// CheerpX 1.4.0 binds KMS keys to a body-level textarea, not the canvas.
// This is a version-specific DOM binding, not an invented SDK input API.
export function useKmsInput(canvasRef: RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    let input: HTMLTextAreaElement | null = null;
    let pointerEvents = "";
    let tabIndex: string | null = null;
    let guestFocused = false;
    const blocked = () => Boolean(canvasRef.current?.closest("[inert]") || document.querySelector("dialog:modal, [data-panel-overlay=true]"));

    const restore = () => {
      if (!input?.isConnected) return;
      input.style.pointerEvents = pointerEvents;
      if (tabIndex === null) input.removeAttribute("tabindex");
      else input.setAttribute("tabindex", tabIndex);
      delete input.dataset.pocketosixKmsInput;
    };
    const find = () => {
      const candidates = Array.from(document.body.children).filter((element): element is HTMLTextAreaElement =>
        element instanceof HTMLTextAreaElement && element.style.position === "fixed" && element.style.opacity === "0" && element.getAttribute("autocapitalize") === "off"
      );
      return candidates.length === 1 ? candidates[0] : null;
    };
    const bind = () => {
      const next = find();
      if (next === input) return;
      const shouldRestore = !blocked() && (document.activeElement === canvasRef.current || (guestFocused && document.activeElement === document.body));
      restore();
      input = next;
      if (!input) return;
      pointerEvents = input.style.pointerEvents;
      tabIndex = input.getAttribute("tabindex");
      input.style.pointerEvents = "none";
      input.tabIndex = -1;
      input.dataset.pocketosixKmsInput = "true";
      if (shouldRestore) input.focus({ preventScroll: true });
    };
    const focus = (event: FocusEvent) => {
      if (event.target === canvasRef.current && !blocked()) {
        bind();
        input?.focus({ preventScroll: true });
        guestFocused = Boolean(input);
      } else {
        guestFocused = event.target === input;
      }
    };
    const blur = () => { guestFocused = false; };
    const keyboard = (event: KeyboardEvent) => {
      const space = event.code === "Space" || (!event.code && event.key === " ");
      if (event.target === input && !blocked() && space && event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey) {
        // 1.4.0 only prevents Tab's default. Cancel this browser shortcut, not
        // propagation: every real keydown / keyup still belongs to the SDK.
        event.preventDefault();
      }
    };
    const observer = new MutationObserver(bind);
    // setKmsCanvas replaces its textarea on resize. Never move that textarea:
    // the runtime removes it from document.body during its own cleanup.
    observer.observe(document.body, { childList: true });
    document.addEventListener("focusin", focus);
    document.addEventListener("keydown", keyboard, true);
    window.addEventListener("blur", blur);
    bind();
    return () => { observer.disconnect(); document.removeEventListener("focusin", focus); document.removeEventListener("keydown", keyboard, true); window.removeEventListener("blur", blur); restore(); };
  }, [canvasRef]);
}
