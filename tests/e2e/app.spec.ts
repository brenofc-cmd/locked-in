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
    name: isMobile(page) ? "Abas" : "Principal",
  });
}

async function openToday(page: Page) {
  await page.goto("/");
  // "/" restores by a client navigation that loads the whole layout from the
  // remote DEV project (V2): allow for a loaded full-suite run.
  await expect(page).toHaveURL(/\/today$/, { timeout: 15_000 });
  await expect(
    page.getByRole("heading", { name: "BOM DIA, BRENDON." }),
  ).toBeVisible();
}

test.describe("layout @layout", () => {
  test("Today loads with the design numbers and no horizontal overflow", async ({
    page,
  }) => {
    await openToday(page);
    await expect(page.getByTestId("today-count")).toHaveText("8 / 12 feitas");
    await expect(page.getByTestId("today-pct")).toHaveAccessibleName(
      "67% concluído",
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
    const tabs = page.getByRole("navigation", { name: "Abas" });
    const sidebar = page.getByRole("navigation", { name: "Principal" });
    if (isMobile(page)) {
      await expect(tabs).toBeVisible();
      await expect(sidebar).toBeHidden();
      await expect(
        page.getByRole("button", { name: "Adicionar tarefa" }),
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
    [/parceiro/i, "/partner", "LUCAS"],
    [/foco/i, "/focus", "NO QUE VOCÊ VAI TRABALHAR?"],
    [/progress/i, "/progress", "PROGRESSO"],
    [/hoje/i, "/today", "BOM DIA, BRENDON."],
  ];
  for (const [name, url, heading] of targets) {
    await n.getByRole("link", { name }).click();
    await expect(page).toHaveURL(new RegExp(`${url}$`));
    await expect(
      page.getByRole("heading", { level: 1, name: heading }),
    ).toBeVisible();
  }
  if (isMobile(page)) {
    await n.getByRole("link", { name: /mais/i }).click();
    await expect(page).toHaveURL(/\/more$/);
    await expect(page.getByRole("heading", { name: "MAIS" })).toBeVisible();
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
  await expect(page.getByTestId("today-count")).toHaveText("9 / 12 feitas");
  await expect(page.getByTestId("today-pct")).toHaveAccessibleName(
    "75% concluído",
  );
  await expect(
    page.getByRole("progressbar", { name: "Conclusão de hoje" }),
  ).toHaveAttribute("aria-valuenow", "75");

  await expect(page.getByText("Morning Run concluída")).toBeVisible();
  await page.getByRole("button", { name: "DESFAZER" }).click();
  await expect(run).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("today-count")).toHaveText("8 / 12 feitas");
  await expect(page.getByTestId("today-pct")).toHaveAccessibleName(
    "67% concluído",
  );
  await writes.idle();
  // Persisted: a reload shows the same state.
  await page.reload();
  await expect(run).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("today-count")).toHaveText("8 / 12 feitas");
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
  await expect(page.getByTestId("today-count")).toHaveText("7 / 12 feitas");
  // Restore the seeded state for the next tests.
  await page.keyboard.press("Space");
  await expect(gym).toHaveAttribute("aria-checked", "true");
  await writes.idle();
});

test("quick add puts a new task on Today", async ({ page }) => {
  const writes = trackWrites(page);
  await openToday(page);
  await page
    .getByRole("button", {
      name: isMobile(page) ? "Adicionar tarefa" : "+ Adicionar tarefa",
    })
    .click();
  const sheet = page.getByRole("dialog", { name: "Adicionar tarefa" });
  await expect(sheet).toBeVisible();
  await sheet
    .getByRole("textbox", { name: "Nome da tarefa" })
    .fill("Revisar Física");
  await sheet.getByRole("button", { name: "ADICIONAR", exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(
    page.getByRole("checkbox", { name: "Revisar Física" }),
  ).toBeVisible();
  await expect(page.getByTestId("today-count")).toHaveText("8 / 13 feitas");
  await writes.idle();

  // Persisted, then removed again (keeps the seeded day for the next tests).
  await page.reload();
  const added = page.getByRole("checkbox", { name: "Revisar Física" });
  await expect(added).toBeVisible();
  await page.getByRole("button", { name: "Opções de Revisar Física" }).click();
  await page
    .getByRole("dialog", { name: "Opções da tarefa" })
    .getByRole("button", { name: "Excluir" })
    .click();
  await expect(added).toBeHidden();
  await expect(page.getByTestId("today-count")).toHaveText("8 / 12 feitas");
  await writes.idle();
});

test("partner page shows the duo comparison and live activity; reactions work", async ({
  page,
}) => {
  await openToday(page);
  if (isMobile(page)) {
    // Lucas's presence is real now; in the suite nobody is signed in as Lucas.
    await page
      .getByRole("link", { name: /Lucas está (online|offline)/ })
      .click();
  } else {
    await page.getByRole("link", { name: /Abrir dupla/ }).click();
  }
  await expect(page).toHaveURL(/\/partner$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "LUCAS" }),
  ).toBeVisible();
  // Real week (the seeds only create today): Brendon 8 / 12 = 67 %, Lucas
  // 3 / 5 = 60 %. No completed week yet, so head to head is 0 — 0.
  const week = page.getByRole("region", { name: "Esta semana" });
  await expect(week.getByTestId("week-me")).toHaveText("67%");
  await expect(week.getByTestId("week-partner")).toHaveText("60%");
  await expect(week.getByTestId("week-leader")).toHaveText(
    /VOCÊ ESTÁ NA FRENTE\s*\+7%/,
  );
  const h2h = page.getByRole("region", { name: "Confronto" });
  await expect(h2h.getByTestId("h2h-score")).toHaveText(/^0\s*—\s*0$/);

  const activity = page.getByRole("region", { name: "Atividade" });
  await expect(activity.getByText("concluiu Morning Run")).toBeVisible();
  await activity
    .getByRole("button", { name: "Reagir a Lucas concluiu Morning Run" })
    .click();
  await page
    .getByRole("dialog", { name: "Reagir" })
    .getByRole("button", { name: "Reagir 🔥" })
    .click();
  // Persisted (Stage 8): survives a reload.
  const reacted = activity.getByRole("button", {
    name: "Você reagiu 🔥 a Lucas concluiu Morning Run. Mudar reação",
  });
  await expect(reacted).toBeVisible();
  await page.reload();
  await expect(reacted).toBeVisible();
  // Leave the seeded state as it was.
  await reacted.click();
  await page
    .getByRole("dialog", { name: "Reagir" })
    .getByRole("button", { name: "Remover reação" })
    .click();
  await expect(
    activity.getByRole("button", {
      name: "Reagir a Lucas concluiu Morning Run",
    }),
  ).toBeVisible();
});

// @focus: a running session covers every screen of that user, so this runs
// after the rest of the suite for the same user (playwright.config.ts).
test("focus: pick duration, start, pause, resume, end and record @focus", async ({
  page,
}) => {
  const writes = trackWrites(page);
  await page.goto("/focus");
  await expect(
    page.getByRole("heading", { name: "NO QUE VOCÊ VAI TRABALHAR?" }),
  ).toBeVisible();

  const d25 = page.getByRole("radio", { name: "25 minutos" });
  await d25.click();
  await expect(d25).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("radio", { name: "50 minutos" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await page.getByRole("radio", { name: "Física", exact: true }).click();

  await page.getByRole("button", { name: "LOCK IN" }).click();
  const session = page.getByRole("dialog", { name: "Sessão de Foco" });
  await expect(session).toBeVisible();
  await expect(session.getByText("FÍSICA")).toBeVisible();
  const clock = session.getByTestId("focus-clock");
  // Database-clock aligned: right after the start, within a few seconds of
  // 25:00 (a device / app-server clock offset must not show up here).
  await expect(clock).toHaveText(/^(25:00|24:5[5-9])$/);
  await expect(clock).not.toHaveText("25:00", { timeout: 3000 });

  await session.getByRole("button", { name: "PAUSAR" }).click();
  await expect(session.getByRole("button", { name: "RETOMAR" })).toBeVisible();
  // The pause is optimistic; the database's paused_at can move the frozen
  // clock by a second when it lands. Read it once the write is confirmed.
  await writes.idle();
  const paused = (await clock.textContent()) ?? "";
  await page.waitForTimeout(1500);
  await expect(clock).toHaveText(paused);

  await session.getByRole("button", { name: "RETOMAR" }).click();
  await expect(clock).not.toHaveText(paused, { timeout: 3000 });

  await session.getByRole("button", { name: "Encerrar sessão" }).click();
  const done = page.getByRole("dialog", { name: "Sessão concluída" });
  await expect(done.getByText("MIN CONCLUÍDOS")).toBeVisible();
  await done.getByRole("textbox").fill("Problem set 6.");
  await done.getByRole("button", { name: "PRONTO" }).click();
  await expect(done).toBeHidden();
  // Real sessions now (Stage 6): the reflection is saved and listed; the
  // total is the real sum for today.
  await expect(page.getByText("Problem set 6.").first()).toBeVisible();
  await expect(page.getByTestId("focus-today")).toHaveText(/^(\d+h )?\d+m$/);
});

test("progress opens with the real numbers in every range", async ({
  page,
}) => {
  await page.goto("/progress");
  await expect(
    page.getByRole("heading", { level: 1, name: "PROGRESSO" }),
  ).toBeVisible();
  // Only today exists (8 / 12): 67 % in every range, below the 80 % standard.
  await expect(page.getByTestId("progress-pct")).toHaveText("67%");
  await expect(page.getByTestId("progress-streak")).toHaveText(/^0\s*dias$/);
  await expect(page.getByTestId("progress-perfect")).toHaveText("0");
  await page.getByRole("radio", { name: "30 DIAS" }).click();
  await expect(page.getByRole("radio", { name: "30 DIAS" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.getByTestId("progress-pct")).toHaveText("67%");
  await expect(
    page.getByRole("region", {
      name: /^(Janeiro|Fevereiro|Março|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro)$/,
    }),
  ).toBeVisible();
});

test("more lists the secondary screens and opens routine", async ({ page }) => {
  await page.goto("/more");
  await expect(page.getByRole("heading", { name: "MAIS" })).toBeVisible();
  const more = page.getByRole("navigation", { name: "Mais" });
  for (const name of ["Rotina", "Desafios", "Convidar dupla", "Ajustes"]) {
    await expect(
      more.getByRole("link", { name: new RegExp(name) }),
    ).toBeVisible();
  }
  await more.getByRole("link", { name: /Rotina/ }).click();
  await expect(page.getByRole("heading", { name: "ROTINA" })).toBeVisible();
});
