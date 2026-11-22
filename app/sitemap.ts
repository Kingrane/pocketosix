import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/run", "/docs"].map((path) => ({ url: new URL(path, getSiteUrl()).href }));
}
