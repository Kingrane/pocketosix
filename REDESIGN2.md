You are redesigning PocketOSix: a landing page and the /run app shell. 
Goal: minimal, calm, premium — in the spirit of Linear, Vercel, Raycast. 
The current design is over-boxed and over-themed ("terminal cosplay"). 
DO NOT touch CheerpX boot logic, COOP/COEP headers, disk/persistence logic or 
networking logic. This is a visual + information-architecture + i18n task.

## Principles
- One idea per screen. Generous whitespace. Fewer elements, not prettier ones.
- Hierarchy through size, weight and spacing — NOT through borders.
- Show the real product. The strongest proof is a real screenshot/video of the 
  guest desktop (Xorg + i3 with a terminal). No fake UI, no dither/hex art.
- Honest but quiet: limitations live in one calm section, never in headlines.
- Each fact is displayed once. No duplicated status anywhere.

## Remove completely
- All `[ bracketed titles ]`, `01 / 04` counters, `host ≠ guest`-style microlabels.
- The i3-style bottom bar and "workspaces" navigation on the landing page.
- Browser capability-check panel on the landing page (move to /run preflight, 
  and show it ONLY if a check fails).
- Gradient text, dithered hexagon hero, WebGL cursor light, glow-on-everything.
- Defensive headlines ("Not a kernel. Not pretending.", "No imaginary stars").
- The GitHub placeholder card ("link not published"). Just a normal GitHub link.
- Right sidebar, top status bar and bottom bar in /run (see below).

## Design tokens
- Background #08090a; surface #0e0f11; border rgba(255,255,255,0.08) (hairline, 
  used sparingly — dividers and the hero screenshot frame only).
- Text #f7f8f8; muted #8a8f98; subtle #5b5f66.
- ONE accent: use the cyan from the logo (#3DD6D0-ish) ну или либо мне понравился такой приглушенный: #748CAB. к кнопочкам или еще куда 
  focus rings, small links, and a very soft radial glow behind the hero image. 
  Never on headlines.
- Primary button: solid white bg, near-black text, 36–40px height, radius 8px. 
  Secondary: transparent with hairline border.
- Fonts: Geist Sans (UI + headings), Geist Mono (code, keybindings, numbers only), 
  via next/font. Headings weight 600, letter-spacing -0.035em, line-height 1.05.
- Type scale: hero 64–72px (40px mobile), section titles 36px, body 16–17px muted, 
  small 13px. Radius scale: 8 / 12. Max content width 1120px, hero text 720px.
- Motion: subtle only — 150–200ms ease-out fades/translateY(4px) on scroll reveal; 
  respect prefers-reduced-motion. No parallax, no marquee.

## Landing page (route /)
1. Nav (sticky, 56px, backdrop-blur, hairline bottom border on scroll):
   logo + wordmark "pocketosix" | right: Docs, GitHub, language globe dropdown, 
   "Launch" button (primary, small). 
2. Hero (centered):
   - Small pill above title: "Open source · Runs locally" (optional, subtle).
   - H1: "Linux in a browser tab."
   - Sub (max 2 lines, muted): "A real Alpine desktop — Xorg and i3 — running 
     locally on your device. No install, no account, no server."
   - CTAs: [Launch] (primary) [GitHub] (secondary).
   - Caption in subtle text: "Powered by CheerpX · Your disk stays in your browser".
   - Below: large screenshot (or muted autoplay looped video, <3MB, poster 
     included) of the real i3 desktop inside a minimal browser-window frame 
     (3 dots, no URL text), with a soft cyan radial glow behind and a bottom 
     fade into the background. Use a placeholder image path 
     /public/hero-desktop.png and tell me exactly what to capture 
     (1920×1200, i3 with a terminal running `neofetch` + a second tile).
3. Features — 3 columns, NO card borders, just icon (24px, stroke), title, 
   one sentence:
   - "Real Alpine userspace" — Shell, coreutils and apk packages. Not a scripted demo.
   - "Persistent local disk" — Files are saved in your browser and survive reloads.
   - "Runs on your device" — Compute happens locally via WebAssembly. Zero compute servers.
4. How it works — one thin horizontal line of 5 nodes in small text, 
   connected with hairlines (no boxes): 
   Browser → CheerpX (x86 → wasm) → Alpine → Xorg + i3 → Canvas. 
   One sentence below it: "Next.js renders the shell. CheerpX runs guest programs 
   locally in your browser."
5. Good to know — short, calm, 3 rows separated by hairlines (title left, text right):
   - No Linux kernel — CheerpX provides syscall compatibility for 32-bit x86 
     userspace. Not Docker, not systemd, not a full VM. Some syscalls and apps 
     may not work.
   - Local, not immortal — Files persist in this browser. Clearing site data 
     deletes them. 
   - Networking is optional — The desktop starts offline. Internet access 
     requires your own Tailscale account and exit node.
6. Final CTA: H2 "Open your desktop." + Launch button. 
   Footer: logo, Docs, GitHub, License (MIT for original code; CheerpX is 
   proprietary; Alpine packages have their own licenses), language switcher, 
   "Made by <name>".
Mobile: stack everything; the Launch button on mobile shows a small notice 
"PocketOSix works best on desktop with a keyboard."

## /run app shell
States:
a) Preflight: run the capability checks silently. If all pass → go straight to 
   boot screen. If something fails → show ONE centered message listing only 
   failed checks with a short fix hint.
b) Boot screen: centered on a clean dark screen. Logo, title "Starting Alpine…", 
   a 4-step quiet stepper (Checking browser · Loading runtime · Mounting disk · 
   Starting Xorg & i3), current step with subtle pulse, elapsed time in mono. 
   Percentages are unavailable — do not fake a progress bar; use the stepper. 
   Below: "Show logs" as a text link. A single tiny dismissable line on first 
   launch: "No Linux kernel — syscall compatibility only."
c) Running: the guest canvas fills 100vw × 100vh. No header, no sidebar, no bottom bar.
   - A floating toolbar pill, top-center, 40px high, auto-hides after 2s of 
     inactivity, reappears on mouse near top edge. Contains: status dot + 
     "Running", fullscreen, keyboard shortcuts, menu (⋯). Must not steal 
     keyboard focus from the guest.
   - The menu opens a right-side drawer (360px) with sections: Display 
     (fit / native, pointer lock), Disk (storage used, Save, Restart, Reset 
     disk — danger style with confirmation dialog), Network (Tailscale, off by 
     default), i3 shortcuts (Alt is the modifier, not Super), Logs, Language.
   - Optional: ⌘K / Ctrl+K command palette with the same actions.
   - Status is shown in ONE place only (the pill).

## i18n
- Use next-intl (or equivalent) with /messages/en.json and /messages/ru.json. 
  Default locale: en. Remember choice in a cookie. No browser auto-detection.
- Language switcher: globe icon button → small dropdown "English / Русский" 
  with a checkmark on the active one. Same component on landing, /run drawer 
  and footer.
- Every user-facing string goes through the dictionary — no hardcoded text and 
  no mixed-language screens. Technical terms stay in English in all locales.
- Adding a language must require only a new JSON file + one line in a config. 
  Do NOT add Chinese now; add a CONTRIBUTING note "translations welcome".
- Write the Russian copy naturally (not literal translation), neutral "вы"/impersonal tone.

## Quality bar
- Lighthouse: Performance ≥ 90 on the landing page, hero media lazy/optimized 
  (next/image, AVIF/WebP).
- Accessible: visible focus rings, contrast AA, semantic landmarks, 
  keyboard-operable drawer and dropdown, aria-labels on icon buttons.
- Responsive at 390 / 768 / 1440 px. 
- Delete dead CSS/components. Net effect should be LESS code and fewer DOM nodes.

## Process
1. First reply with a short plan and the proposed design tokens (Tailwind theme / 
   CSS variables) — wait for nothing, then implement.
2. Order: tokens + fonts → i18n scaffold → landing → /run shell.
3. At the end, give me screenshots at 1440 and 390 of: landing (full page), 
   boot screen, running state with toolbar visible, drawer open. 
   List anything you intentionally removed.

А также поставь из папки assets на фон (там я 2 обои закинул выбери одно), и может ярлыки какието может добавить? ну вот хочется чтоб сразу было понятно что делать и хотяб работало!! а то у меня твое нчиего не работает не знаю жму и ничего ни кнопки не клавиши на клавиатуре, мышка просто двигается.