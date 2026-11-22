export const languages = {
  en: "English",
  ru: "Русский",
} as const;

export type Locale = keyof typeof languages;
export type Messages = { [key: string]: string | Messages };
export const LOCALE_COOKIE = "pocketosix-locale";
export const DEFAULT_LOCALE: Locale = "en";

export function resolveLocale(value?: string): Locale {
  return value && Object.hasOwn(languages, value) ? value as Locale : DEFAULT_LOCALE;
}

export async function loadMessages(locale: Locale): Promise<Messages> {
  return (await import(`../messages/${locale}.json`)).default;
}

export function translate(messages: Messages, key: string): string {
  let value: string | Messages = messages;
  for (const segment of key.split(".")) {
    if (typeof value === "string" || !(segment in value)) throw new Error(`Missing translation: ${key}`);
    value = value[segment];
  }
  if (typeof value !== "string") throw new Error(`Translation is not text: ${key}`);
  return value;
}
