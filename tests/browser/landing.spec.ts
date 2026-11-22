import { test, expect } from "@playwright/test";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import en from "../../messages/en.json";
import ru from "../../messages/ru.json";
import { LANDING_FEATURES, LANDING_STATS } from "../../lib/landing-config";

const locales = [
  { locale: "en", messages: en, statsLabel: "Compute and image facts", statsLabels: ["Compute servers", "Cold boot", "Base image", "Local compute"], notMeasured: "Not measured", capturePending: "Capture pending", mobileTitle: "A desktop is recommended." },
  { locale: "ru", messages: ru, statsLabel: "Вычисления и образ системы", statsLabels: ["Серверов для вычислений", "Холодный запуск", "Базовый образ", "Локальные вычисления"], notMeasured: "Не измерено", capturePending: "Снимок готовится", mobileTitle: "Рекомендуем компьютер." },
] as const;
const publicFile = (name: string) => join(process.cwd(), "public", name);
const hasDesktopVideo = existsSync(publicFile("hero-desktop.png")) && ["hero-desktop.webm", "hero-desktop.mp4"].every((name) => {
  if (!existsSync(publicFile(name))) return false;
  const file = statSync(publicFile(name));
  return file.isFile() && file.size > 0 && file.size < 3_000_000;
});

test("landing explains the real product without importing SDK or checking guest capabilities", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.addInitScript(() => Object.defineProperty(navigator, "language", { get: () => "ru-RU" }));
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Linux in a browser tab.");
  await expect(page.locator("canvas, .workspace-bar")).not.toBeAttached();
  await expect(page.getByRole("link", { name: "GitHub", exact: true }).first()).toHaveAttribute("href", "https://github.com/Kingrane/pocketosix");
  expect(requests.filter((url) => /cxrtnc|disks\.webvm|\.ext2/.test(url))).toEqual([]);
});

test("metadata defaults to English and follows the Russian cookie without changing the brand title", async ({ page, context, baseURL }) => {
  for (const { locale, messages, alternate } of [
    { locale: "en", messages: en, alternate: "ru_RU" },
    { locale: "ru", messages: ru, alternate: "en_US" },
  ]) {
    if (locale === "ru") await context.addCookies([{ name: "pocketosix-locale", value: locale, url: baseURL! }]);
    for (const route of ["/", "/run"]) {
      await page.goto(route);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page).toHaveTitle(route === "/" ? "pocketosix — real unix vibe right in your browser!" : "run · pocketosix");
      await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", route === "/" ? messages.metadata.description : messages.metadata.runDescription);
      await expect(page.locator('meta[property="og:description"]')).toHaveAttribute("content", messages.metadata.description);
      await expect(page.locator('meta[name="twitter:description"]')).toHaveAttribute("content", messages.metadata.description);
      await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute("content", messages.metadata.ogLocale);
      await expect(page.locator('meta[property="og:locale:alternate"]')).toHaveAttribute("content", alternate);
    }
  }
});

test("language dropdown is keyboard-operable, uses a cookie and survives navigation/reload", async ({ page, context }) => {
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Choose language", exact: true }).first();
  await trigger.click();
  await expect(page.getByRole("menuitemradio", { name: "English", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitemradio", { name: "Русский", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  await expect(page.getByRole("button", { name: "Выбрать язык", exact: true }).first()).toBeFocused();
  expect((await context.cookies()).find((cookie) => cookie.name === "pocketosix-locale")?.value).toBe("ru");
  await page.goto("/docs");
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  await page.getByRole("button", { name: "Выбрать язык", exact: true }).first().click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).not.toBeAttached();
  await expect(page.getByRole("button", { name: "Выбрать язык", exact: true }).first()).toBeFocused();
});

for (const { locale, messages, statsLabel, statsLabels, notMeasured, capturePending } of locales) {
  test(`landing signature, genuine poster, honest stats and feature cards in ${locale}`, async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "pocketosix-locale", value: locale, url: baseURL! }]);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const heroAmbient = page.locator('[data-hero-ambient][data-ambient-variant="hero"]');
    const sectionAmbient = page.locator('[data-hero-ambient][data-ambient-variant="section"]');
    await expect(heroAmbient.locator("svg[viewBox]")).toHaveCount(16);
    await expect(sectionAmbient.locator("svg[viewBox]")).toHaveCount(8);
    await expect(heroAmbient.locator("clipPath path")).toHaveAttribute("d", "M128 16 L225 72 V184 L128 240 L31 184 V72 Z");
    await expect(heroAmbient).toHaveAttribute("aria-hidden", "true");
    await expect(sectionAmbient).toHaveAttribute("aria-hidden", "true");
    await expect(heroAmbient).toHaveCSS("pointer-events", "none");
    await expect(sectionAmbient).toHaveCSS("pointer-events", "none");
    await expect(page.locator('[data-hero-ambient][data-motion="running"]')).toHaveCount(0);
    const hero = page.locator('section[aria-labelledby="hero-heading"]');
    const signature = await hero.evaluate((element) => {
      const spotlight = getComputedStyle(element, "::before");
      const grid = getComputedStyle(element, "::after");
      return { spotlight: spotlight.backgroundImage, grid: grid.backgroundImage, mask: grid.maskImage, spotlightPointer: spotlight.pointerEvents, gridPointer: grid.pointerEvents };
    });
    expect(signature.spotlight).toContain("radial-gradient");
    expect(signature.spotlight).toContain("0.06");
    expect(signature.grid).toContain("linear-gradient");
    expect(signature.grid).toContain("0.03");
    expect(signature.mask).toContain("radial-gradient");
    expect(signature.spotlightPointer).toBe("none");
    expect(signature.gridPointer).toBe("none");
    await expect(hero.locator("h1").locator("..")).toHaveCSS("animation-name", "none");
    const media = page.locator("[data-hero-media]");
    const poster = media.getByRole("img", { name: messages.landing.hero.imageAlt, exact: true });
    await media.scrollIntoViewIfNeeded();
    await expect(poster).toHaveAttribute("width", "1920");
    await expect(poster).toHaveAttribute("height", "1200");
    await expect(poster).toHaveAttribute("src", /(?:url=%2Fhero-desktop\.png|\/hero-desktop\.png)/);
    await expect.poll(() => poster.evaluate((element) => (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth > 0)).toBe(true);
    await expect(media.locator("video, source")).not.toBeAttached();

    const stats = page.locator("main > dl");
    await expect(stats).toHaveAttribute("aria-label", statsLabel);
    await expect(stats).toHaveCSS("border-top-width", "1px");
    await expect(hero.locator("xpath=following-sibling::*[1]")).toHaveAttribute("aria-label", statsLabel);
    await expect(stats.locator("dt")).toHaveText([...statsLabels]);
    await expect(stats.locator("dd").first()).toHaveText("0");
    await expect(stats.locator("dd").last()).toHaveText("100%");
    for (const [index, value] of Object.values(LANDING_STATS).entries()) {
      const definition = stats.locator("dd").nth(index);
      await expect(definition).toHaveCSS("font-family", /geist.*mono/i);
      if (value === null) {
        await expect(definition.locator('[aria-hidden="true"]')).toHaveText("—");
        await expect(definition.locator(".sr-only")).toHaveText(notMeasured);
      } else await expect(definition).toHaveText(String(value));
    }
    const features = page.getByRole("region", { name: messages.landing.features.label, exact: true });
    await expect(features.getByRole("article")).toHaveCount(3);
    for (const [index, { key, image }] of LANDING_FEATURES.entries()) {
      const card = features.getByRole("article").nth(index);
      await expect(card.getByRole("heading")).toHaveText(messages.landing.features[key].title);
      await expect(card.locator("p")).toHaveText(messages.landing.features[key].description);
      await expect(card).toHaveCSS("border-radius", "12px");
      await expect(card).toHaveCSS("background-color", "rgb(14, 15, 17)");
      await expect(card.locator(":scope > div").first()).toHaveCSS("aspect-ratio", "16 / 10");
      if (existsSync(publicFile(image.slice(1)))) {
        await expect(card.getByRole("img")).toHaveAttribute("alt", /^(?!landing\.).+/);
        await expect(card.getByRole("img")).toHaveAttribute("src", new RegExp(image.slice(1).replace(".", "\\.")));
      } else {
        await expect(card.getByRole("img")).not.toBeAttached();
        await expect(card.getByText(capturePending, { exact: true })).toBeAttached();
      }
    }
    await expect(page.locator('[data-surface="notes"]')).toContainText(messages.landing.notes.network.description);
  });
}

test("scroll reveals happen once, without simultaneous section animations", async ({ page }) => {
  // Keep optional hero video outside the viewport so this exercises the reveal path, not media suppression.
  await page.setViewportSize({ width: 1440, height: 400 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const landing = page.locator("[data-landing]");
  // Start between the two ambient regions, before feature content enters the viewport.
  await page.locator("main > dl").scrollIntoViewIfNeeded();
  await expect(page.locator('[data-hero-ambient][data-motion="running"]')).toHaveCount(0);
  await expect(landing).toHaveAttribute("data-motion-ready", "");
  await landing.evaluate((root) => {
    root.setAttribute("data-test-max-reveals", "0");
    const observer = new MutationObserver(() => {
      const active = root.querySelectorAll("[data-reveal-active]");
      root.setAttribute("data-test-max-reveals", String(Math.max(Number(root.getAttribute("data-test-max-reveals")), active.length)));
      if (active.length) root.setAttribute("data-test-reveal-duration", String(parseFloat(getComputedStyle(active[0]).animationDuration) * 1000));
    });
    observer.observe(root, { attributes: true, subtree: true, attributeFilter: ["data-reveal-active"] });
  });
  const cta = page.locator('[data-surface="cta"]');
  await expect(cta).not.toHaveAttribute("data-revealed");
  await cta.scrollIntoViewIfNeeded();
  await expect(cta).toHaveAttribute("data-revealed", "");
  await expect(cta).toHaveCSS("opacity", "1");
  await expect(page.locator("[data-reveal-active]")).toHaveCount(0);
  expect(Number(await landing.getAttribute("data-test-max-reveals"))).toBe(1);
  const duration = Number(await landing.getAttribute("data-test-reveal-duration"));
  expect(duration).toBeGreaterThanOrEqual(150);
  expect(duration).toBeLessThanOrEqual(200);
  await page.locator("main > dl").scrollIntoViewIfNeeded();
  await cta.scrollIntoViewIfNeeded();
  await expect(cta).toHaveAttribute("data-revealed", "");
  expect(await cta.evaluate((element) => element.getAnimations().filter((animation) => animation.playState === "running").length)).toBe(0);
});

test("live reduced motion reveals all content and leaves no landing animation running", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 400 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(page.locator("[data-motion-ready]")).toBeAttached();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator('[data-hero-ambient][data-motion="running"]')).toHaveCount(0);
  await expect(page.locator("[data-reveal]:not([data-revealed])")).toHaveCount(0);
  await expect(page.locator("[data-motion-ready]")).not.toBeAttached();
  const animations = await page.locator("[data-landing]").evaluate(element => element.getAnimations({ subtree: true }).filter(animation => animation.playState === "running").length);
  expect(animations).toBe(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(page.locator("[data-motion-ready]")).toBeAttached();
  await expect(page.locator('[data-hero-ambient][data-ambient-variant="hero"]')).toHaveAttribute("data-motion", "running");
  await expect(page.locator("[data-reveal]:not([data-revealed])")).toHaveCount(0);
});

for (const width of [390, 1440]) {
  test(`original 3D logos hand off to the sparse lower region without overflow at ${width}px, in both locales`, async ({ page, context, baseURL }) => {
    await page.setViewportSize({ width, height: 400 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    for (const { locale } of locales) {
      await context.addCookies([{ name: "pocketosix-locale", value: locale, url: baseURL! }]);
      await page.goto("/");
      const landing = page.locator("[data-landing]");
      const hero = page.locator('[data-ambient-variant="hero"]');
      const lower = page.locator('[data-ambient-variant="section"]');
      await expect(hero).toHaveAttribute("data-motion", "running");
      await expect(lower).toHaveAttribute("data-motion", "paused");
      await expect(landing).toHaveAttribute("data-ambient-playing", "hero");
      await expect(hero.locator("[data-ambient-float]").first()).toHaveCSS("transform-style", "preserve-3d");
      await page.locator('[data-surface="architecture"]').scrollIntoViewIfNeeded();
      await expect(hero).toHaveAttribute("data-motion", "paused");
      await expect(lower).toHaveAttribute("data-motion", "running");
      await expect(landing).toHaveAttribute("data-ambient-playing", "section");
      await expect(page.locator('[data-hero-ambient][data-motion="running"]')).toHaveCount(1);
      await expect(page.locator("[data-reveal-active]")).toHaveCount(0);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect(page.locator('[data-hero-ambient][data-motion="running"]')).toHaveCount(0);
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await expect(lower).toHaveAttribute("data-motion", "running");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await page.locator('[data-surface="cta"]').scrollIntoViewIfNeeded();
      await expect(page.locator('[data-hero-ambient][data-motion="running"]')).toHaveCount(0);
      await expect(landing).not.toHaveAttribute("data-ambient-playing");
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(hero).toHaveAttribute("data-motion", "running");
      await expect(lower).toHaveAttribute("data-motion", "paused");
    }
  });
}

test("two simultaneously visible ambient regions still have only one motion owner", async ({ page }) => {
  test.skip(hasDesktopVideo, "A genuine video takes priority in this viewport; its ownership is covered by the optional video test.");
  await page.setViewportSize({ width: 1440, height: 3000 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const hero = page.locator('[data-ambient-variant="hero"]');
  const lower = page.locator('[data-ambient-variant="section"]');
  await expect(hero).toBeInViewport();
  await expect(lower).toBeInViewport();
  await expect(hero).toHaveAttribute("data-motion", "running");
  await expect(lower).toHaveAttribute("data-motion", "paused");
  await expect(page.locator('[data-hero-ambient][data-motion="running"]')).toHaveCount(1);
});

test("scoped media/launch signals and simulated document.hidden pause ambient motion", async ({ page }) => {
  // This verifies coordinator inputs, not video playback or a real background-tab visibility change.
  await page.setViewportSize({ width: 1440, height: 400 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const landing = page.locator("[data-landing]");
  const hero = page.locator('[data-ambient-variant="hero"]');
  await expect(hero).toHaveAttribute("data-motion", "running");
  for (const attribute of ["data-media-playing", "data-launching"]) {
    await landing.evaluate((root, name) => root.setAttribute(name, ""), attribute);
    await expect(page.locator('[data-hero-ambient][data-motion="running"]')).toHaveCount(0);
    await expect(landing).not.toHaveAttribute("data-ambient-playing");
    await expect(page.locator("[data-reveal-active]")).toHaveCount(0);
    await landing.evaluate((root, name) => root.removeAttribute(name), attribute);
    await expect(hero).toHaveAttribute("data-motion", "running");
  }
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator('[data-hero-ambient][data-motion="running"]')).toHaveCount(0);
  await expect(landing).not.toHaveAttribute("data-ambient-playing");
  await page.evaluate(() => {
    Reflect.deleteProperty(document, "hidden");
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(hero).toHaveAttribute("data-motion", "running");
});

test("optional genuine hero video is lazy, pauses offscreen and suppresses reveals", async ({ page }) => {
  test.skip(!hasDesktopVideo, "No genuine WebM/MP4 pair under 3 MB per file; playback is not verified by poster tests.");
  await page.setViewportSize({ width: 1440, height: 400 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const landing = page.locator("[data-landing]");
  const media = page.locator("[data-hero-media]");
  await expect(media.locator("video, source")).not.toBeAttached();
  await media.scrollIntoViewIfNeeded();
  const video = media.locator("video");
  await expect(video.locator("source")).toHaveCount(2);
  await expect(video.locator("source").first()).toHaveAttribute("src", "/hero-desktop.webm");
  await expect(video.locator("source").last()).toHaveAttribute("src", "/hero-desktop.mp4");
  await expect(video).toHaveAttribute("poster", "/hero-desktop.png");
  await expect(video).toHaveJSProperty("muted", true);
  await expect(video).toHaveJSProperty("loop", true);
  await expect(video).toHaveJSProperty("playsInline", true);
  await expect(video).toHaveJSProperty("paused", false);
  await expect(landing).toHaveAttribute("data-media-playing", "");
  await expect(page.locator('[data-hero-ambient][data-motion="running"]')).toHaveCount(0);
  await expect(page.locator("[data-reveal-active], [data-reveal]:not([data-revealed])")).toHaveCount(0);
  await page.locator('[data-surface="cta"]').scrollIntoViewIfNeeded();
  await expect(video).toHaveJSProperty("paused", true);
  await expect(landing).not.toHaveAttribute("data-media-playing");
  await media.scrollIntoViewIfNeeded();
  await expect(video).toHaveJSProperty("paused", false);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(video).toHaveJSProperty("paused", true);
  await expect(video).toBeHidden();
  await expect(landing).not.toHaveAttribute("data-media-playing");
  await expect(media.getByRole("img")).toBeVisible();
});

test("keyboard focus reveals the final action without waiting for scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 400 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const cta = page.locator('[data-surface="cta"]');
  await expect(cta).not.toHaveAttribute("data-revealed");
  await cta.getByRole("link").focus();
  await expect(cta).toHaveAttribute("data-revealed", "");
  await expect(cta).toHaveCSS("opacity", "1");
});

test("SSR landing stays readable without JavaScript", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(baseURL!);
    await expect(page.locator("[data-motion-ready]")).not.toBeAttached();
    for (const element of await page.locator("[data-reveal]").all()) await expect(element).toHaveCSS("opacity", "1");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("canvas")).not.toBeAttached();
    await expect(page.locator("[data-hero-ambient]")).toHaveCount(2);
    await expect(page.locator('[data-hero-ambient][data-motion="running"]')).toHaveCount(0);
    await expect(page.locator('[data-ambient-variant="hero"] [data-ambient-float]').first()).toHaveCSS("transform", /matrix/);
  } finally { await context.close(); }
});

for (const width of [390, 768, 1440]) {
  test(`landing and docs fit ${width}px in both languages without a motion dependency`, async ({ page, context, baseURL }) => {
    await page.setViewportSize({ width, height: 960 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const locale of ["en", "ru"]) {
      await context.addCookies([{ name: "pocketosix-locale", value: locale, url: baseURL! }]);
      for (const route of ["/", "/docs"]) {
        await page.goto(route);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
        await expect(page.locator(".workspace-bar")).not.toBeAttached();
      }
    }
  });
}

for (const width of [390, 1440]) {
  test(`56px nav centers Launch at ${width}px in both locales; reduced-motion launch keeps mobile confirmation`, async ({ page, context, baseURL }) => {
    await page.setViewportSize({ width, height: 960 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const { locale, messages, mobileTitle } of locales) {
      await context.addCookies([{ name: "pocketosix-locale", value: locale, url: baseURL! }]);
      await page.goto("/");
      const header = page.locator(".site-header");
      const trigger = header.getByRole("link", { name: messages.common.launch, exact: true });
      await expect(header).toHaveCSS("height", "56px");
      for (const scrollY of [0, 600]) {
        await page.evaluate((y) => window.scrollTo(0, y), scrollY);
        const headerBox = await header.boundingBox();
        const launchBox = await trigger.boundingBox();
        if (!headerBox || !launchBox) throw new Error("Header and Launch must have visible geometry");
        expect(headerBox.y).toBeCloseTo(0, 1);
        expect(headerBox.height).toBeCloseTo(56, 1);
        expect(launchBox.y - headerBox.y).toBeGreaterThanOrEqual(4);
        expect(headerBox.y + headerBox.height - launchBox.y - launchBox.height).toBeGreaterThanOrEqual(4);
        expect(Math.abs(launchBox.y + launchBox.height / 2 - headerBox.y - headerBox.height / 2)).toBeLessThanOrEqual(1);
      }
      const documentStart = await page.evaluate(() => {
        const observer = new MutationObserver((records) => {
          if (records.some((record) => Array.from(record.addedNodes).some((node) => node instanceof Element && (node.matches("[data-launch-transition]") || node.querySelector("[data-launch-transition]"))))) {
            document.documentElement.setAttribute("data-test-launch-transition-seen", "true");
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        return performance.timeOrigin;
      });
      await trigger.click();
      if (width < 768) {
        const notice = page.getByRole("dialog", { name: mobileTitle, exact: true });
        await expect(notice).toBeVisible();
        await expect(notice).toHaveAccessibleDescription(messages.common.mobileNotice);
        await expect(notice.getByRole("button", { name: messages.common.cancel, exact: true })).toBeFocused();
        await expect(page).toHaveURL(/\/$/);
        await notice.getByRole("button", { name: messages.common.cancel, exact: true }).click();
        await expect(notice).toBeHidden();
        await expect(trigger).toBeFocused();
        await trigger.click();
        await notice.getByRole("link", { name: messages.common.launch, exact: true }).click();
      }
      await expect(page).toHaveURL(/\/run$/);
      expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentStart);
      await expect(page.locator("html")).not.toHaveAttribute("data-test-launch-transition-seen", "true");
      await expect(page.locator("[data-launch-transition]")).not.toBeAttached();
      await expect(page.getByRole("dialog")).not.toBeVisible();
    }
  });

  test(`Ctrl+Launch opens a native new tab at ${width}px without a notice or transition, in both locales`, async ({ page, context, baseURL }) => {
    await page.setViewportSize({ width, height: 960 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    for (const { locale, messages } of locales) {
      await context.addCookies([{ name: "pocketosix-locale", value: locale, url: baseURL! }]);
      await page.goto("/");
      const newPagePromise = context.waitForEvent("page");
      await page.locator(".site-header").getByRole("link", { name: messages.common.launch, exact: true }).click({ modifiers: ["Control"] });
      const newPage = await newPagePromise;
      try {
        await expect(newPage).toHaveURL(/\/run$/);
        await expect(page).toHaveURL(/\/$/);
        await expect(page.locator("dialog[open], [data-launch-transition]")).not.toBeAttached();
        await expect(page.locator("[data-landing]")).not.toHaveAttribute("data-launching");
      } finally { await newPage.close(); }
    }
  });
}
