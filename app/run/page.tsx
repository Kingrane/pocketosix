import type { Metadata } from "next";
import { cookies } from "next/headers";
import { LinuxDesktop } from "@/components/linux/linux-desktop";
import { loadMessages, resolveLocale, translate, LOCALE_COOKIE } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const locale = resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  const messages = await loadMessages(locale);
  return {
    title: "run",
    description: translate(messages, "metadata.runDescription"),
  };
}

export default function RunPage() {
  return <LinuxDesktop />;
}
