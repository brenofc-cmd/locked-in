import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Supabase DEV settings and the git-ignored test-user credentials
// (see docs/DATABASE.md → "Test users").
for (const f of [".env.local", ".env.test.local"]) {
  if (existsSync(f)) process.loadEnvFile(f);
}

const PORT = 3100;
/** One real user per project (tests/e2e/auth.setup.ts). */
const state = (name: "brendon" | "desk" | "layout") => ({
  storageState: `tests/e2e/.auth/${name}.json`,
});

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
  // 375 and 430 run the tests tagged @layout. Stage 3 auth / duo flows use
  // shared DEV users, so they run once, serially, in their own projects.
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "mobile-390",
      testIgnore: /stage\d/,
      dependencies: ["setup"],
      use: { ...phone(390, 844), ...state("brendon") },
    },
    {
      name: "desktop-1440",
      testIgnore: /stage\d/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        ...state("desk"),
      },
    },
    {
      name: "mobile-375",
      grep: /@layout/,
      testIgnore: /stage\d/,
      dependencies: ["setup"],
      use: { ...phone(375, 812), ...state("layout") },
    },
    {
      name: "mobile-430",
      grep: /@layout/,
      testIgnore: /stage\d/,
      dependencies: ["setup"],
      use: { ...phone(430, 932), ...state("layout") },
    },
    { name: "stage3", testMatch: /stage3\.spec\.ts/, use: phone(390, 844) },
    // Same shared users as stage3 (Alice / Bruno / Carla): runs after it.
    {
      name: "stage4",
      testMatch: /stage4\.spec\.ts/,
      dependencies: ["stage3"],
      use: phone(390, 844),
    },
  ],
  webServer: {
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
