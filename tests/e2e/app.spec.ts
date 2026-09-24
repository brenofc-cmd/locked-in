import { expect, test, type Page } from "@playwright/test";
import { trackWrites } from "./support";

/**
 * Stage 2 UI suite, now on REAL data: each project's user is seeded with the
 * design's Today (tests/e2e/auth.setup.ts). Tests that write restore what they
 * changed and wait for the write to reach the database, so the file runs
 * serially within a project.
 */
test.describe.configure({ mode: "serial" });

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 0) < 780;

/** Primary navigation: bottom tabs on mobile, sidebar from 780px. */
function nav(page: Page) {
  return page.getByRole("navigation", {
    name: isMobile(page) ? "Tabs" : "Main",
  });
}

async function openToday(page: Page) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/today$/);
  await expect(
    page.getByRole("heading", { name: "GOOD MORNING, BRENDON." }),
  ).toBeVisible();
}

test.describe("layout @layout", () => {
  test("Today loads with the design numbers and no horizontal overflow", async ({
    page,
  }) => {
    await openToday(page);
    await expect(page.getByTestId("today-count")).toHaveText("8 / 12 done");
    await expect(page.getByTestId("today-pct")).toHaveAccessibleName(
      "67% complete",
    );
    await expect(
      page.getByRole("checkbox", { name: "Morning Run" }),
    ).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
  });

  test("shows the right navigation for the viewport", async ({ page }) => {
    await openToday(page);
    const tabs = page.getByRole("navigation", { name: "Tabs" });
    const sidebar = page.getByRole("navigation", { name: "Main" });
    if (isMobile(page)) {
      await expect(tabs).toBeVisible();
      await expect(sidebar).toBeHidden();
      await expect(
        page.getByRole("button", { name: "Add task" }),
      ).toBeVisible();
    } else {
      await expect(sidebar).toBeVisible();
      await expect(tabs).toBeHidden();
    }
  });
});

test("navigation reaches every main section", async ({ page }) => {
  await openToday(page);
  const n = nav(page);
  const targets: [RegExp, string, string][] = [
    [/partner/i, "/partner", "LUCAS"],
    [/focus/i, "/focus", "WHAT ARE YOU WORKING ON?"],
    [/progress/i, "/progress", "PROGRESS"],
    [/today/i, "/today", "GOOD MORNING, BRENDON."],
  ];
  for (const [name, url, heading] of targets) {
    await n.getByRole("link", { name }).click();
    await expect(page).toHaveURL(new RegExp(`${url}$`));
    await expect(
      page.getByRole("heading", { level: 1, name: heading }),
    ).toBeVisible();
  }
  if (isMobile(page)) {
    await n.getByRole("link", { name: /more/i }).click();
    await expect(page).toHaveURL(/\/more$/);
    await expect(page.getByRole("heading", { name: "MORE" })).toBeVisible();
  }
});

test("completing a task updates row, count, percentage and bar; undo reverts", async ({
  page,
}) => {
  const writes = trackWrites(page);
  await openToday(page);
  const run = page.getByRole("checkbox", { name: "Morning Run" });
  await expect(run).toHaveAttribute("aria-checked", "false");

  await run.click();
  await expect(run).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("today-count")).toHaveText("9 / 12 done");
  await expect(page.getByTestId("today-pct")).toHaveAccessibleName(
    "75% complete",
  );
  await expect(
    page.getByRole("progressbar", { name: "Today's completion" }),
  ).toHaveAttribute("aria-valuenow", "75");

  await expect(page.getByText("Morning Run completed")).toBeVisible();
  await page.getByRole("button", { name: "UNDO" }).click();
  await expect(run).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("today-count")).toHaveText("8 / 12 done");
  await expect(page.getByTestId("today-pct")).toHaveAccessibleName(
    "67% complete",
  );
  await writes.idle();
  // Persisted: a reload shows the same state.
  await page.reload();
  await expect(run).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("today-count")).toHaveText("8 / 12 done");
});

test("a completed task can be unchecked with the keyboard", async ({
  page,
}) => {
  const writes = trackWrites(page);
  await openToday(page);
  const gym = page.getByRole("checkbox", { name: "Gym" });
  await expect(gym).toHaveAttribute("aria-checked", "true");
  await gym.focus();
  await page.keyboard.press("Space");
  await expect(gym).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("today-count")).toHaveText("7 / 12 done");
  // Restore the seeded state for the next tests.
  await page.keyboard.press("Space");
  await expect(gym).toHaveAttribute("aria-checked", "true");
  await writes.idle();
});

test("quick add puts a new task on Today", async ({ page }) => {
  const writes = trackWrites(page);
  await openToday(page);
  await page
    .getByRole("button", { name: isMobile(page) ? "Add task" : "+ Add task" })
    .click();
  const sheet = page.getByRole("dialog", { name: "Add task" });
  await expect(sheet).toBeVisible();
  await sheet
    .getByRole("textbox", { name: "Task name" })
    .fill("Revisar Física");
  await sheet.getByRole("button", { name: "ADD", exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(
    page.getByRole("checkbox", { name: "Revisar Física" }),
  ).toBeVisible();
  await expect(page.getByTestId("today-count")).toHaveText("8 / 13 done");
  await writes.idle();

  // Persisted, then removed again (keeps the seeded day for the next tests).
  await page.reload();
  const added = page.getByRole("checkbox", { name: "Revisar Física" });
  await expect(added).toBeVisible();
  await page
    .getByRole("button", { name: "Options for Revisar Física" })
    .click();
  await page
    .getByRole("dialog", { name: "Task options" })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(added).toBeHidden();
  await expect(page.getByTestId("today-count")).toHaveText("8 / 12 done");
  await writes.idle();
});

test("partner page shows the duo comparison and live activity; reactions work", async ({
  page,
}) => {
  await openToday(page);
  if (isMobile(page)) {
    await page.getByRole("link", { name: /Lucas is online/ }).click();
  } else {
    await page.getByRole("link", { name: /Open partner/ }).click();
  }
  await expect(page).toHaveURL(/\/partner$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "LUCAS" }),
  ).toBeVisible();
  const week = page.getByRole("region", { name: "This week" });
  await expect(week.getByText("87%")).toBeVisible();
  await expect(week.getByText("81%")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Head to head" }),
  ).toBeVisible();

  const activity = page.getByRole("region", { name: "Activity" });
  await expect(activity.getByText("completed Morning Run")).toBeVisible();
  await activity
    .getByRole("button", { name: "React to Lucas completed Morning Run" })
    .click();
  await page
    .getByRole("dialog", { name: "React" })
    .getByRole("button", { name: "React 🔥" })
    .click();
  await expect(activity.getByRole("button", { name: "🔥 sent" })).toBeVisible();
});

test("focus: pick duration, start, pause, resume, end and record", async ({
  page,
}) => {
  await page.goto("/focus");
  await expect(
    page.getByRole("heading", { name: "WHAT ARE YOU WORKING ON?" }),
  ).toBeVisible();

  const d25 = page.getByRole("radio", { name: "25 minutes" });
  await d25.click();
  await expect(d25).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("radio", { name: "50 minutes" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await page.getByRole("radio", { name: "Physics" }).click();

  await page.getByRole("button", { name: "LOCK IN" }).click();
  const session = page.getByRole("dialog", { name: "Focus session" });
  await expect(session).toBeVisible();
  await expect(session.getByText("PHYSICS")).toBeVisible();
  const clock = session.getByTestId("focus-clock");
  await expect(clock).toHaveText(/^2[45]:\d\d$/);
  await expect(clock).not.toHaveText("25:00", { timeout: 3000 });

  await session.getByRole("button", { name: "PAUSE" }).click();
  await expect(session.getByRole("button", { name: "RESUME" })).toBeVisible();
  const paused = (await clock.textContent()) ?? "";
  await page.waitForTimeout(1500);
  await expect(clock).toHaveText(paused);

  await session.getByRole("button", { name: "RESUME" }).click();
  await expect(clock).not.toHaveText(paused, { timeout: 3000 });

  await session.getByRole("button", { name: "End session" }).click();
  const done = page.getByRole("dialog", { name: "Session complete" });
  await expect(done.getByText("MIN COMPLETE")).toBeVisible();
  await done.getByRole("textbox").fill("Problem set 6.");
  await done.getByRole("button", { name: "DONE" }).click();
  await expect(done).toBeHidden();
  await expect(page.getByTestId("focus-today")).toHaveText("1h 11m");
  await expect(page.getByText("Problem set 6.")).toBeVisible();
});

test("progress opens and the range switch changes the numbers", async ({
  page,
}) => {
  await page.goto("/progress");
  await expect(
    page.getByRole("heading", { level: 1, name: "PROGRESS" }),
  ).toBeVisible();
  await expect(page.getByTestId("progress-pct")).toHaveText("89%");
  await page.getByRole("radio", { name: "30 DAYS" }).click();
  await expect(page.getByTestId("progress-pct")).toHaveText("84%");
  await expect(page.getByRole("region", { name: "September" })).toBeVisible();
});

test("more lists the secondary screens and opens routine", async ({ page }) => {
  await page.goto("/more");
  await expect(page.getByRole("heading", { name: "MORE" })).toBeVisible();
  const more = page.getByRole("navigation", { name: "More" });
  for (const name of ["Routine", "Challenges", "Invite partner", "Settings"]) {
    await expect(
      more.getByRole("link", { name: new RegExp(name) }),
    ).toBeVisible();
  }
  await more.getByRole("link", { name: /Routine/ }).click();
  await expect(page.getByRole("heading", { name: "ROUTINE" })).toBeVisible();
});
