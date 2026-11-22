import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { cookies } from "next/headers";
import { LanguageProvider } from "@/components/ui/language-provider";
import { languages, loadMessages, resolveLocale, translate, LOCALE_COOKIE, type Locale } from "@/lib/i18n";
import { getSiteUrl } from "@/lib/site-url";
import "./globals.css";

const geist = localFont({
  src: [
    { path: "../node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2", weight: "100 900", style: "normal" },
    { path: "../node_modules/@fontsource-variable/geist/files/geist-cyrillic-wght-normal.woff2", weight: "100 900", style: "normal" },
  ],
  variable: "--font-geist",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["system-ui", "sans-serif"],
});

const geistMono = localFont({
  src: [
    { path: "../node_modules/@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2", weight: "100 900", style: "normal" },
    { path: "../node_modules/@fontsource-variable/geist-mono/files/geist-mono-cyrillic-wght-normal.woff2", weight: "100 900", style: "normal" },
    { path: "../node_modules/@fontsource-variable/geist-mono/files/geist-mono-symbols2-wght-normal.woff2", weight: "100 900", style: "normal" },
  ],
  variable: "--font-geist-mono",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["ui-monospace", "monospace"],
});

const title = "pocketosix — real unix vibe right in your browser!";

export async function generateMetadata(): Promise<Metadata> {
  const locale = resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  const messages = await loadMessages(locale);
  const description = translate(messages, "metadata.description");
  const alternateLocale = await Promise.all((Object.keys(languages) as Locale[])
    .filter((code) => code !== locale)
    .map(async (code) => translate(await loadMessages(code), "metadata.ogLocale")));

  return {
    metadataBase: getSiteUrl(),
    title: { default: title, template: "%s · pocketosix" },
    description,
    applicationName: "pocketosix",
    manifest: "/manifest.webmanifest",
    icons: {
      icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
    openGraph: {
      title,
      description,
      siteName: "pocketosix",
      locale: translate(messages, "metadata.ogLocale"),
      alternateLocale,
      type: "website",
      images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "pocketosix — real unix vibe right in your browser!" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: "/og-image.png", alt: "pocketosix — real unix vibe right in your browser!" }],
    },
  };
}

// SITE_URL / Vercel задаёт настоящий адрес публикации; без него используется localhost.
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#08090a", colorScheme: "dark" };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  const messages = await loadMessages(locale);
  return (
    <html lang={locale} className={`${geist.variable} ${geistMono.variable}`}>
      <body><LanguageProvider initialLocale={locale} initialMessages={messages}>{children}</LanguageProvider></body>
    </html>
  );
}
