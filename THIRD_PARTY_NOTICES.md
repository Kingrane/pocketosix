# Third-party notices

PocketOSix's MIT license covers only its original code and documentation.

## Wallpaper assets

`public/assets/wallpaper28.png` (planet), `wallpaper72.jpg` (cloud), and
`Без названия.png` (the owner's new wallpaper) were provided by the project owner.
The new wallpaper is served as a lossless RGB8 copy at `public/assets/alpine_bg.png`,
the path expected by the upstream i3 configuration. `alpine_bg_rgb.png` is the
identical verification copy; the RGBA original is preserved unchanged.
This is a read-only WebDevice asset, not a change to the Alpine base disk or
the user's writable overlay. The old upstream-branded wallpaper is no longer
served at that path. A change of this read-only asset does not change the Alpine
base image or reuse an overlay with a different base.

Before the initial 0.0.1 commit on 22 November 2026, the project owner confirmed
that permission or a suitable license allows publishing the planet and cloud wallpapers and
screenshots containing them on GitHub. Their original source and license name
were not provided. This records the owner's confirmation, not an independent
license verification or a grant under PocketOSix's MIT license. The project's
original directory listings `public/index.list` and `public/assets/index.list`
expose this asset.

The new `Без названия.png` was supplied later by the owner. No separate license
name or independent license verification is recorded for it; converting it to
RGB8 does not place it under PocketOSix's MIT license.

`public/hero-desktop.png` is a genuine, unedited guest framebuffer capture, not
a separately licensed stock image. Wallpaper visible in that capture or in
`artifacts/redesign2/screenshots/` retains its own third-party licensing status.
Capturing the desktop does not replace third-party asset or package
licenses with PocketOSix's MIT license.

Any subsequently copied WebVM / Alpine image assets must retain their upstream
Apache-2.0 attribution and notices. A copy of Apache-2.0 is retained in
[`licenses/Apache-2.0.txt`](licenses/Apache-2.0.txt).

## Runtime and guest system

CheerpX SDK/runtime belongs to Leaning Technologies and has its own proprietary
license, included with `@leaningtech/cheerpx`. It is loaded from the official CDN,
not redistributed by this repository. See
[the upstream license](https://github.com/leaningtech/cheerpx-meta/blob/main/LICENSE.txt).

The streamed Alpine image and its packages retain their own licenses. Their
license/source obligations are not replaced by this repository's MIT license.

## Fonts and dependencies

Geist and Geist Mono are distributed through `@fontsource-variable/geist` and
`@fontsource-variable/geist-mono` under the SIL Open Font License 1.1.
A copy is included in [`licenses/Geist-OFL-1.1.txt`](licenses/Geist-OFL-1.1.txt).

The docked terminal uses xterm.js (`@xterm/xterm`) under its MIT license, with
the notices included in the installed package. Its console integration follows
the documented CheerpX API; no upstream WebVM component code is copied.

IBM Plex Sans and IBM Plex Mono are distributed through their Fontsource npm
packages under the SIL Open Font License 1.1. Their license files are included
in the installed packages. All other dependencies retain the notices and
licenses included in their npm packages.
