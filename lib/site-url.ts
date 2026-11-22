// Build-time publication address; localhost is the actual development origin.
// No production domain is guessed when the project has not been published.
export function getSiteUrl() {
  const value = process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("SITE_URL must use HTTP or HTTPS.");
  return url;
}
