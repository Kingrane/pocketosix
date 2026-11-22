import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 30000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    viewport: { width: 1440, height: 960 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", testMatch: ["shell.spec.ts", "landing.spec.ts", "kms-input.spec.ts", "desktop-ui.spec.ts"], use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 960 } } },
    {
      name: "real-vm", testMatch: "real-vm.spec.ts", timeout: 720000,
      use: {
        ...devices["Desktop Chrome"], viewport: { width: 1440, height: 960 },
        ...(process.env.POCKETOSIX_VM_BROWSER ? { channel: process.env.POCKETOSIX_VM_BROWSER } : {}),
      },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
