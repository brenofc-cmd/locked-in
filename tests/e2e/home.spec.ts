import { expect, test } from "@playwright/test";

test("app boots and renders the foundation screen", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("LOCKED IN");
  await expect(
    page.getByRole("heading", { level: 1, name: "LOCKED IN" }),
  ).toBeVisible();
  await expect(page.getByText("STAGE 1 / 10")).toBeVisible();
});
