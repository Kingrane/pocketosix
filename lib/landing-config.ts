// TODO: Fill these two values with measured cold-boot time and base-image size, including units.
export const LANDING_STATS = {
  computeServers: 0,
  coldBoot: null as string | null,
  baseImageSize: null as string | null,
  localCompute: "100%",
} as const;

export const LANDING_FEATURES = [
  { key: "userspace", image: "/feature-shell.png" },
  { key: "disk", image: "/feature-disk.png" },
  { key: "compute", image: "/feature-local.png" },
] as const;

export type LandingFeatureMedia = Partial<Record<(typeof LANDING_FEATURES)[number]["key"], boolean>>;
