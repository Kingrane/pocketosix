import { test, expect } from "@playwright/test";
import en from "../../messages/en.json";
import ru from "../../messages/ru.json";

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

test("hero decorations pause offscreen and reveal sections only once", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const ambient = page.locator("[data-hero-ambient]");
  await expect(ambient).toHaveAttribute("aria-hidden", "true");
  await expect(ambient).toHaveCSS("pointer-events", "none");
  await expect(ambient).toHaveAttribute("data-motion", "running");
  await expect(ambient.locator("svg[viewBox]")).toHaveCount(16);
  const cta = page.locator('[data-surface="cta"]');
  await expect(cta).not.toHaveAttribute("data-revealed");
  await cta.scrollIntoViewIfNeeded();
  await expect(cta).toHaveAttribute("data-revealed", "");
  await expect(cta).toHaveCSS("opacity", "1");
  await expect(ambient).toHaveAttribute("data-motion", "paused");
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(ambient).toHaveAttribute("data-motion", "running");
  await expect(cta).toHaveAttribute("data-revealed", "");
});

test("reduced motion disables logo drift and reveals all content, including a live preference change", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(page.locator("[data-motion-ready]")).toBeAttached();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("[data-hero-ambient]")).toHaveAttribute("data-motion", "paused");
  await expect(page.locator("[data-reveal]:not([data-revealed])")).toHaveCount(0);
  await expect(page.locator("[data-motion-ready]")).not.toBeAttached();
  const animations = await page.locator("[data-hero-ambient]").evaluate(element => element.getAnimations({ subtree: true }).filter(animation => animation.playState === "running").length);
  expect(animations).toBe(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(page.locator("[data-hero-ambient]")).toHaveAttribute("data-motion", "running");
  await expect(page.locator("[data-reveal]:not([data-revealed])")).toHaveCount(0);
});

test("keyboard focus reveals the final action without waiting for scrolling", async ({ page }) => {
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
  } finally { await context.close(); }
});

for (const width of [390, 768, 1440]) {
  test(`landing and docs fit ${width}px in both languages without a motion dependency`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 960 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const locale of ["en", "ru"]) {
      await context.addCookies([{ name: "pocketosix-locale", value: locale, url: "http://localhost:3000" }]);
      for (const route of ["/", "/docs"]) {
        await page.goto(route);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await expect(page.locator(".workspace-bar")).not.toBeAttached();
      }
    }
  });
}
