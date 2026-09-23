import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

const phone = (width: number, height: number) => ({
  ...devices["Pixel 7"],
  viewport: { width, height },
});

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  // Mobile-first: the full suite runs at 390 (primary) and 1440 (desktop).
  // 375 and 430 run the tests tagged @layout.
  projects: [
    { name: "mobile-390", use: phone(390, 844) },
    {
      name: "desktop-1440",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    { name: "mobile-375", grep: /@layout/, use: phone(375, 812) },
    { name: "mobile-430", grep: /@layout/, use: phone(430, 932) },
  ],
  webServer: {
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: `http://localhost:${PORT}/today`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
