import { expect, test, type Page } from "@playwright/test";
import { addDays, dateLabel, localDateISO } from "@/lib/local-date";
import {
  apiAs,
  isoWeekday,
  makeDuo,
  resetTasks,
  signInUI,
  trackWrites,
  users,
  type Api,
} from "./support";

/**
 * Stage 4: real Today, routine and one-off tasks against the DEV project.
 * Alice (A) owns the tasks, Bruno (B) is her duo partner, Carla (C) is an
 * outsider. Runs after the stage3 project (same users), serially.
 */
test.describe.configure({ mode: "serial" });

let A: Api;
let B: Api;
let C: Api;

test.beforeAll(async () => {
  [A, B, C] = await Promise.all([
    apiAs(users.a),
    apiAs(users.b),
    apiAs(users.c),
  ]);
  await Promise.all([resetTasks(A), resetTasks(B), resetTasks(C)]);
  await C.rpc("leave_duo");
  await makeDuo(A, B);
  await A.from("profiles")
    .update({ timezone: "America/Sao_Paulo" })
    .neq("display_name", "");
});

test.afterAll(async () => {
  await A.from("profiles")
    .update({ timezone: "America/Sao_Paulo" })
    .neq("display_name", "");
  await Promise.all([resetTasks(A), resetTasks(B), resetTasks(C)]);
  await Promise.all([A, B, C].map((x) => x.rpc("leave_duo")));
});

const row = (page: Page, name: string) =>
  page.getByRole("checkbox", { name, exact: true });

async function addRoutine(
  page: Page,
  name: string,
  days: "Every day" | "Weekdays",
) {
  await page.goto("/routine");
  await page.getByRole("button", { name: "+ Add item" }).click();
  const sheet = page.getByRole("dialog", { name: "Add task" });
  await sheet.getByRole("textbox", { name: "Task name" }).fill(name);
  await sheet.getByRole("radio", { name: days }).click();
  await sheet.getByRole("button", { name: "ADD", exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(
    page.getByRole("button", { name: new RegExp(`^${name}`) }),
  ).toBeVisible();
}

async function taskStatus(api: Api, title: string) {
  const today = (await api.rpc("my_today")).data!;
  const { data } = await api
    .from("daily_tasks")
    .select("status")
    .eq("title", title)
    .eq("task_date", today);
  return data?.map((d) => d.status) ?? [];
}

test("a real user builds a routine and runs the day; everything survives reloads and re-login", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const writes = trackWrites(page);
  await signInUI(page, users.a);

  // New user: no fake tasks.
  await expect(page.getByText("NO ROUTINE YET")).toBeVisible();
  await expect(page.getByTestId("today-count")).toHaveText("0 / 0 done");

  // Recurring items. Morning Run is MON–FRI: it is on Today only on weekdays.
  await addRoutine(page, "Morning Run", "Weekdays");
  await addRoutine(page, "Wake Up", "Every day");
  const today = (await A.rpc("my_today")).data!;
  const weekday = isoWeekday(today) <= 5;

  await page.goto("/today");
  await expect(row(page, "Wake Up")).toBeVisible();
  await expect(row(page, "Morning Run")).toHaveCount(weekday ? 1 : 0);
  await page.reload();
  await expect(row(page, "Wake Up")).toBeVisible();

  // Complete -> reload -> still completed (and in the database).
  await row(page, "Wake Up").click();
  await expect(row(page, "Wake Up")).toHaveAttribute("aria-checked", "true");
  await writes.idle();
  expect(await taskStatus(A, "Wake Up")).toEqual(["completed"]);
  await page.reload();
  await expect(row(page, "Wake Up")).toHaveAttribute("aria-checked", "true");

  // Undo -> reload -> pending.
  await row(page, "Wake Up").click();
  await expect(row(page, "Wake Up")).toHaveAttribute("aria-checked", "false");
  await writes.idle();
  await page.reload();
  await expect(row(page, "Wake Up")).toHaveAttribute("aria-checked", "false");

  // Skip -> reload -> skipped, stays in the total and not done.
  await page.getByRole("button", { name: "Options for Wake Up" }).click();
  await page
    .getByRole("dialog", { name: "Task options" })
    .getByRole("button", { name: "Rest" })
    .click();
  await expect(page.getByText("SKIPPED · REST")).toBeVisible();
  await writes.idle();
  await page.reload();
  await expect(page.getByText("SKIPPED · REST")).toBeVisible();
  const total = weekday ? 2 : 1;
  await expect(page.getByTestId("today-count")).toHaveText(`0 / ${total} done`);
  expect(await taskStatus(A, "Wake Up")).toEqual(["skipped"]);

  // Unskip (correction) -> pending again.
  await page.getByRole("button", { name: "Options for Wake Up" }).click();
  await page
    .getByRole("dialog", { name: "Task options" })
    .getByRole("button", { name: /Unskip/ })
    .click();
  await expect(page.getByText("SKIPPED · REST")).toBeHidden();
  await writes.idle();
  expect(await taskStatus(A, "Wake Up")).toEqual(["pending"]);

  // Quick Add a one-off -> reload -> still there.
  await page.getByRole("button", { name: "Add task" }).click();
  const add = page.getByRole("dialog", { name: "Add task" });
  await add
    .getByRole("textbox", { name: "Task name" })
    .fill("Finish Physics assignment");
  await add.getByRole("button", { name: "ADD", exact: true }).click();
  await expect(row(page, "Finish Physics assignment")).toBeVisible();
  await writes.idle();
  await page.reload();
  await expect(row(page, "Finish Physics assignment")).toBeVisible();

  // Edit today only -> the routine keeps its name.
  await page.getByRole("button", { name: "Options for Wake Up" }).click();
  await page
    .getByRole("dialog", { name: "Task options" })
    .getByRole("button", { name: "Edit" })
    .click();
  const edit = page.getByRole("dialog", { name: "Edit task" });
  await edit.getByRole("textbox", { name: "Task name" }).fill("Wake Up late");
  await edit.getByRole("button", { name: "SAVE" }).click();
  await edit.getByRole("button", { name: "Today only" }).click();
  await expect(row(page, "Wake Up late")).toBeVisible();
  await writes.idle();
  await page.reload();
  await expect(row(page, "Wake Up late")).toBeVisible();
  await page.goto("/routine");
  await expect(page.getByRole("button", { name: /^Wake Up\b/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Wake Up late/ })).toHaveCount(
    0,
  );

  // Edit today and future from the Routine screen -> today follows.
  await page.getByRole("button", { name: /^Wake Up\b/ }).click();
  const routineEdit = page.getByRole("dialog", { name: "Edit task" });
  await routineEdit
    .getByRole("textbox", { name: "Task name" })
    .fill("Wake Up 6am");
  await routineEdit.getByRole("button", { name: "SAVE" }).click();
  await expect(
    page.getByRole("button", { name: /^Wake Up 6am/ }),
  ).toBeVisible();
  await writes.idle();
  await page.goto("/today");
  await expect(row(page, "Wake Up 6am")).toBeVisible();

  // Another routine item, then reorder it to the top; the order persists.
  await addRoutine(page, "Read", "Every day");
  const names = async () =>
    (await page.locator("li[data-rid]").allInnerTexts()).map((t) =>
      t.split("\n")[0].trim(),
    );
  await page
    .getByRole("button", { name: "Reorder Read. Use arrow keys to move." })
    .press("ArrowUp");
  await page
    .getByRole("button", { name: "Reorder Read. Use arrow keys to move." })
    .press("ArrowUp");
  await writes.idle();
  const expected = ["Read", "Morning Run", "Wake Up 6am"];
  await expect.poll(names).toEqual(expected);
  await page.reload();
  await expect.poll(names).toEqual(expected);

  // Archive (Delete) -> gone from the routine and from Today; history kept.
  await page.getByRole("button", { name: /^Read/ }).click();
  await page
    .getByRole("dialog", { name: "Edit task" })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(page.getByRole("button", { name: /^Read/ })).toHaveCount(0);
  await writes.idle();
  await page.reload();
  await expect(page.getByRole("button", { name: /^Read/ })).toHaveCount(0);
  await page.goto("/today");
  await expect(row(page, "Read")).toHaveCount(0);

  // Complete a task, sign out, sign in: the day is intact.
  await row(page, "Wake Up 6am").click();
  await writes.idle();
  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await signInUI(page, users.a);
  await expect(row(page, "Wake Up 6am")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(row(page, "Finish Physics assignment")).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await expect(page.getByTestId("today-count")).toHaveText(
    `1 / ${total + 1} done`,
  );
});

test("partner reads only shared tasks and cannot change them; outsider sees nothing (API)", async () => {
  const shared = await A.rpc("create_routine_item", {
    p_title: "Shared gym",
    p_days: [1, 2, 3, 4, 5, 6, 7],
  });
  const hidden = await A.rpc("create_routine_item", {
    p_title: "Private journal",
    p_days: [1, 2, 3, 4, 5, 6, 7],
    p_visible: false,
  });
  expect(shared.error).toBeNull();
  expect(hidden.error).toBeNull();
  const aId = (await A.auth.getUser()).data.user!.id;

  // Partner: shared yes, private no.
  const bTasks = await B.from("daily_tasks")
    .select("title")
    .eq("owner_id", aId);
  expect(bTasks.data!.map((t) => t.title)).toContain("Shared gym");
  expect(bTasks.data!.map((t) => t.title)).not.toContain("Private journal");
  const bRoutines = await B.from("routine_items")
    .select("title")
    .eq("owner_id", aId);
  expect(bRoutines.data!.map((t) => t.title)).not.toContain("Private journal");
  expect(
    (await B.from("routine_items").select("id").eq("id", hidden.data!)).data,
  ).toHaveLength(0);

  // Partner cannot modify: updates / deletes match no rows, RPCs refuse, spoofing fails.
  const upd = await B.from("daily_tasks")
    .update({ status: "completed" })
    .eq("owner_id", aId)
    .select();
  expect(upd.data).toHaveLength(0);
  const del = await B.from("daily_tasks").delete().eq("owner_id", aId).select();
  expect(del.data).toHaveLength(0);
  expect(
    (await B.rpc("archive_routine_item", { p_id: shared.data! })).error
      ?.message,
  ).toContain("LI_NOT_FOUND");
  expect(
    (await B.from("daily_tasks").insert({ owner_id: aId, title: "spoof" }))
      .error?.code,
  ).toBe("42501");
  expect(await taskStatus(A, "Shared gym")).toEqual(["pending"]);

  // Outsider: nothing readable, nothing writable.
  expect(
    (await C.from("daily_tasks").select("id").eq("owner_id", aId)).data,
  ).toHaveLength(0);
  expect(
    (await C.from("routine_items").select("id").eq("owner_id", aId)).data,
  ).toHaveLength(0);
  expect(
    (
      await C.from("daily_tasks")
        .update({ title: "hacked" })
        .eq("owner_id", aId)
        .select()
    ).data,
  ).toHaveLength(0);
  expect(
    (
      await C.from("routine_items").insert({
        owner_id: aId,
        title: "spoof",
        days_of_week: [1],
        start_date: "2026-01-01",
      })
    ).error?.code,
  ).toBe("42501");

  // A task cannot point at someone else's routine.
  const cRoutine = await C.rpc("create_routine_item", {
    p_title: "Carla run",
    p_days: [1],
  });
  const link = await A.from("daily_tasks").insert({
    routine_item_id: cRoutine.data!,
    task_date: "2030-01-01",
    title: "link",
  });
  expect(link.error?.code).toBe("23503");
});

test("generation is idempotent under 5 concurrent calls and catches up missed days", async () => {
  const today = (await A.rpc("my_today")).data!;
  // A routine that last materialised 4 days ago (the app was not opened since).
  const ins = await A.from("routine_items")
    .insert({
      title: "Catch up",
      days_of_week: [1, 2, 3, 4, 5, 6, 7],
      start_date: addDays(today, -6),
    })
    .select()
    .single();
  expect(ins.error).toBeNull();
  await A.from("routine_items")
    .update({ materialized_through: addDays(today, -4) })
    .eq("id", ins.data!.id);

  const results = await Promise.all(
    Array.from({ length: 5 }, () => A.rpc("ensure_my_daily_tasks")),
  );
  expect(results.every((r) => r.error === null && r.data === today)).toBe(true);

  const { data } = await A.from("daily_tasks")
    .select("task_date")
    .eq("routine_item_id", ins.data!.id);
  const dates = data!.map((d) => d.task_date).sort();
  expect(dates).toEqual([
    addDays(today, -3),
    addDays(today, -2),
    addDays(today, -1),
    today,
  ]);

  // Snapshot: renaming the routine changes today, never the past.
  const up = await A.rpc("update_routine_item", {
    p_id: ins.data!.id,
    p_title: "Catch up renamed",
    p_days: [1, 2, 3, 4, 5, 6, 7],
    p_category: "custom",
    p_time: null as unknown as string,
    p_visible: true,
    p_notes: "",
    p_reminder: false,
  });
  expect(up.error).toBeNull();
  const after = await A.from("daily_tasks")
    .select("task_date, title")
    .eq("routine_item_id", ins.data!.id);
  for (const t of after.data!) {
    expect(t.title).toBe(
      t.task_date === today ? "Catch up renamed" : "Catch up",
    );
  }
});

test("today follows profiles.timezone, not UTC", async ({ page }) => {
  // Kiritimati is UTC+14: its calendar day differs from São Paulo's (UTC-3) most of the day.
  await A.from("profiles")
    .update({ timezone: "Pacific/Kiritimati" })
    .neq("display_name", "");
  const expected = localDateISO("Pacific/Kiritimati");
  expect((await A.rpc("my_today")).data).toBe(expected);

  await signInUI(page, users.a);
  await expect(
    page.getByText(dateLabel(expected), { exact: true }),
  ).toBeVisible();

  await A.from("profiles")
    .update({ timezone: "America/Sao_Paulo" })
    .neq("display_name", "");
  expect((await A.rpc("my_today")).data).toBe(
    localDateISO("America/Sao_Paulo"),
  );
});
