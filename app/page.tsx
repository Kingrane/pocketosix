import { existsSync } from "node:fs";
import { join } from "node:path";
import { Landing } from "@/components/landing/landing";

export default function Home() {
  const hasDesktopMedia = existsSync(join(process.cwd(), "public", "hero-desktop.png"));
  return <Landing hasDesktopMedia={hasDesktopMedia} />;
}
