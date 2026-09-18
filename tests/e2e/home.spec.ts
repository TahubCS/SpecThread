import { expect, test } from "@playwright/test";

test("the starter homepage renders successfully", async ({ page }) => {
  const response = await page.goto("/");

  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle("Create Next App");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "To get started, edit the page.tsx file.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Documentation", exact: true }),
  ).toHaveAttribute("href", /^https:\/\/nextjs\.org\/docs\?/);
});
