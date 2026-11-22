import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { Landing } from "@/components/landing/landing";
import { LANDING_FEATURES } from "@/lib/landing-config";

export default function Home() {
  const publicFile = (name: string) => join(process.cwd(), "public", name);
  const hasDesktopMedia = existsSync(publicFile("hero-desktop.png"));
  const hasDesktopVideo = hasDesktopMedia && ["hero-desktop.webm", "hero-desktop.mp4"].every((name) => {
    const path = publicFile(name);
    if (!existsSync(path)) return false;
    const file = statSync(path);
    return file.isFile() && file.size > 0 && file.size < 3_000_000;
  });
  const featureMedia = Object.fromEntries(LANDING_FEATURES.map(({ key, image }) => [key, existsSync(publicFile(image.slice(1)))]));
  return <Landing hasDesktopMedia={hasDesktopMedia} hasDesktopVideo={hasDesktopVideo} featureMedia={featureMedia} />;
}
