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

const desk = {
  ...devices["Desktop Chrome"],
  viewport: { width: 1440, height: 900 },
  ...state("desk"),
};

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
      testIgnore: /stage\d|v2-|issue-/,
      grepInvert: /@focus/,
      dependencies: ["setup"],
      use: { ...phone(390, 844), ...state("brendon") },
    },
    {
      name: "desktop-1440",
      testIgnore: /stage\d|v2-|issue-/,
      grepInvert: /@focus/,
      dependencies: ["setup"],
      use: desk,
    },
    // A running Focus session overlays every screen of its user: the @focus
    // tests run once the other tests of the same users have finished.
    {
      name: "focus-390",
      grep: /@focus/,
      testIgnore: /stage\d|v2-|issue-/,
      dependencies: ["mobile-390", "desktop-1440"],
      use: { ...phone(390, 844), ...state("brendon") },
    },
    {
      name: "focus-1440",
      grep: /@focus/,
      testIgnore: /stage\d|v2-|issue-/,
      dependencies: ["mobile-390", "desktop-1440"],
      use: desk,
    },
    {
      name: "mobile-375",
      grep: /@layout/,
      testIgnore: /stage\d|v2-|issue-/,
      dependencies: ["setup"],
      use: { ...phone(375, 812), ...state("layout") },
    },
    {
      name: "mobile-430",
      grep: /@layout/,
      testIgnore: /stage\d|v2-|issue-/,
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
    // Two / three real browser contexts on the same users: runs after stage4.
    {
      name: "stage5",
      testMatch: /stage5\.spec\.ts/,
      dependencies: ["stage4"],
      use: phone(390, 844),
    },
    // Persistent focus with two browsers on the same users: runs after stage5.
    {
      name: "stage6",
      testMatch: /stage6\.spec\.ts/,
      dependencies: ["stage5"],
      use: phone(390, 844),
    },
    // Progress and the weekly competition, same users: runs after stage6.
    {
      name: "stage7",
      testMatch: /stage7\.spec\.ts/,
      dependencies: ["stage6"],
      use: phone(390, 844),
    },
    // Complete product (onboarding, reactions, challenges, settings, duo
    // end), same users: runs after stage7.
    {
      name: "stage8",
      testMatch: /stage8\.spec\.ts/,
      dependencies: ["stage7"],
      use: phone(390, 844),
    },
    // Final audit: attacks on the public API, races, channel isolation,
    // headers, redirects; same users, runs last.
    {
      name: "stage9",
      testMatch: /stage9\.spec\.ts/,
      dependencies: ["stage8"],
      use: phone(390, 844),
    },
    // V2 Phase 1 — Resume State (real storage, close / reopen, two users on
    // one device); Alice / Bruno again, so after the stage chain. 390 first,
    // then the same tests at 1440.
    {
      name: "v2-390",
      testMatch: /v2-resume\.spec\.ts/,
      dependencies: ["stage9"],
      use: phone(390, 844),
    },
    {
      name: "v2-1440",
      testMatch: /v2-resume\.spec\.ts/,
      dependencies: ["v2-390"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    // V2 Phase 2 — presence / last seen and the planner (2–3 browsers,
    // Alice / Bruno / Carla again), after Phase 1.
    {
      name: "v2p2-390",
      testMatch: /v2-phase2\.spec\.ts/,
      dependencies: ["v2-1440"],
      use: phone(390, 844),
    },
    // V2 Phase 3 — goals, vision and the mirror (private), after Phase 2.
    {
      name: "v2p3-390",
      testMatch: /v2-phase3\.spec\.ts/,
      dependencies: ["v2p2-390"],
      use: phone(390, 844),
    },
    // V2 Phase 4 — North Star, Top 3 and the morning card, after Phase 3.
    {
      name: "v2p4-390",
      testMatch: /v2-phase4\.spec\.ts/,
      dependencies: ["v2p3-390"],
      use: phone(390, 844),
    },
    // V2 Phase 5 — Goal → Action → Proof (Alice / Bruno / Carla), after Phase 4.
    {
      name: "v2p5-390",
      testMatch: /v2-phase5\.spec\.ts/,
      dependencies: ["v2p4-390"],
      use: phone(390, 844),
    },
    // ISSUE-001 — idle session on the first /today (controlled cookie
    // expiry, fresh sign-ins of Alice / Bruno), after Phase 5.
    {
      name: "issue001-390",
      testMatch: /issue-001\.spec\.ts/,
      dependencies: ["v2p5-390"],
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
