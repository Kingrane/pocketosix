Iteration 2 for PocketOSix. Do NOT touch CheerpX boot logic, COOP/COEP, disk 
persistence, networking or the guest image. Visual / UX / i18n only.

## A. Fix bugs first
- Nav "Launch" button touches the top viewport edge: nav is 56px, button vertically centered.
- Boot stepper: completed steps get a check icon (muted), current step pulses 
  (accent dot), pending steps are dim. Currently all dots look identical.
- Toolbar pill must never cover the guest's top bar (see section C).

## B. Landing: give it a signature, keep it minimal
Keep the tokens, copy and structure from iteration 1. Change these:

1. Add a Linear-style spotlight: a soft 
   radial gradient (white at ~6% opacity, slightly tinted with the accent) from 
   the top center, plus a very faint grid (1px lines, ~3% opacity) masked by a 
   radial fade. Nothing else decorative in the hero.
2. Hero media: support a looped muted video (/public/hero-desktop.webm + .mp4, 
   poster /public/hero-desktop.png, <3MB, lazy, paused when off-screen and under 
   prefers-reduced-motion). Keep the minimal browser frame. Add a soft glow behind 
   and a bottom fade. On Launch click, animate the frame expanding to full-viewport 
   (≈300ms, ease-out) while navigating to /run. If the transition is flaky, 
   fall back to a simple fade.
3. Stats strip directly under the hero, 4 items, Geist Mono numbers + muted labels, 
   hairline dividers, no boxes:
   "0" compute servers · "<boot time>" cold boot · "<disk size>" base image · "100%" local.
   Use constants in one config file with a TODO comment — I will fill in measured values.
4. Replace the 3 icon-only feature columns with a 3-card grid. Each card: 
   media area on top (image/video placeholder, 16:10), title, one sentence. 
   Card style: surface #0e0f11, hairline border, radius 12, hover lifts border opacity. 
   Media placeholders at /public/feature-{shell,disk,local}.png — tell me exactly 
   what to capture for each.
5. Keep "How it works" and "Good to know" as they are, but increase vertical 
   rhythm between sections (≈160px desktop) and add a fade-in on scroll (150–200ms).
Result must stay calm: ONE accent color, no gradients on text, no more than 
one animated element visible at once.

## C. /run: three modes
Layout state machine: `docked` (default) ↔ `immersive` (fullscreen).

1) Docked (default):
   - A slim 48px icon rail on the LEFT, always visible. Top: logo button 
     = "Exit to home". Then icons with tooltips: Display, Terminal, Disk, Network, 
     Shortcuts, Logs. Bottom: status dot (Running / Starting / Error), language 
     globe, and an "Immersive" (expand) button.
   - Clicking an icon expands a 320px panel next to the rail (pushes the canvas, 
     does not overlay it); clicking again or the active icon collapses it. 
     Only one panel open at a time.
   - The guest canvas fills the rest of the viewport, inset 8px from edges, 
     radius 10, hairline border. Canvas must be re-fit on panel open/close with 
     no flicker.
   - Status is shown ONCE (rail dot). Panel headers show details.

2) Immersive:
   - Rail and panel are hidden; canvas is 100vw × 100vh, no inset, no radius. 
     Also request browser Fullscreen API (user gesture) and handle fullscreenchange 
     both ways.
   - A permanent discoverable handle: a 40×4px rounded notch at top-center, 
     ~30% opacity, hover → 60%. On hover/near top edge (≤24px) or when pressing 
     the notch, a floating pill slides down (150ms), 40px high, positioned top-CENTER 
     with a 12px gap from the edge. Pill auto-hides after 2s of no hover.
   - Pill contents: logo button (Exit to home), status dot + label, 
     "Exit immersive", keyboard shortcuts, menu (⋯) which opens the SAME 
     panels as a 360px overlay drawer on the right with a scrim.
   - The pill must not steal keyboard focus from the guest canvas. Return focus 
     to the canvas after any pill/drawer interaction. First time entering immersive, 
     show a one-time toast: "Move the mouse to the top edge for controls."

3) Exit to home (both modes): 
   - Confirmation dialog: title "Leave desktop?", body "Files are saved to this 
     browser. Running processes will stop." Buttons: "Stay" (secondary), 
     "Leave" (primary). Never use Esc for this — Esc belongs to the guest.
   - Also add "Back to home" as the first item in the Desktop menu.

4) Panels content — shorten aggressively:
   - Each section: title, controls, and ONE short line of helper text. Move the 
     long explanations into an info (ⓘ) popover or "Learn more" link to docs.
   - Display: Fit/Native segmented control, Lock pointer (helper: "Press Esc to release").
   - Terminal: "Open terminal" button; helper: "Separate tty1 console".
   - Disk: used (the origin usage), quota, protection status + "Request storage protection", 
     Save, Restart, Reset disk (danger, confirmation). Warning text about async writes 
     collapses under ⓘ.
   - Network: Tailscale (off by default).
   - Shortcuts: a tidy two-column table of the i3 shortcuts that are actually in 
     the image config. Alt is the modifier, not Super. Show the modifier as <kbd>Alt</kbd>.
   - Logs: monospace viewer with copy button.
   - Language: shared switcher component.

5) Keyboard: Ctrl+K opens the command palette (same actions). While the guest 
   canvas is focused, do NOT intercept any keys except an explicitly documented 
   escape chord (propose one, e.g. Ctrl+Alt+Shift+M to open the menu); 
   list it in Shortcuts.

## D. i18n
All new strings go through en.json / ru.json. No mixed language. Technical terms stay in English.

## E. Process
1. Brief plan, then implement in order: bugs → landing → /run rail & panels → immersive pill → exit dialog.
2. Deliver screenshots at 1440 and 390: landing hero, landing full page, 
   /run docked (rail collapsed and with Disk panel open), /run immersive with pill visible, 
   exit dialog. List what you removed.
3. Less code, fewer DOM nodes than before.