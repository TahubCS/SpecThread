import { expect, test } from "./fixtures";

// Temporary: renders the proposed final palette. Not committed.
const tokens: Record<string, string> = {
  bg: "#111315", sidebar: "#0b0d0e", surface: "#181b1e", hover: "#1c2023", raised: "#23282c", "raised-hover": "#2d3338",
  line: "#272c30", "line-strong": "#3a4147", text: "#f1f4f5", "text-2": "#a7afb5", "text-3": "#7d868d",
  accent: "#22d3ee", "accent-strong": "#67e3f5", "accent-soft": "#22d3ee24", "on-accent": "#00161a",
  warn: "#f5b83d", danger: "#ff6b6b",
};
const style = `.app-shell { ${Object.entries(tokens).map(([key, value]) => `--app-${key}: ${value};`).join(" ")} }
  .app-shell * { transition: none !important; }
  .evidence-step::after { border-top-color: ${tokens.accent}b3; }
  .evidence-step:has(+ .pending)::after { border-top-color: ${tokens["line-strong"]}; }
  .icon-button.is-on { background: ${tokens.accent}2e; }
  .dashboard-controls .icon-button.is-on { border-color: ${tokens.accent}80; }
  .evidence-step.pending .evidence-node { border-color: ${tokens["text-3"]}; }
  .app-main .field input:focus-visible { outline-color: ${tokens.accent}40; }`;

test("final palette", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 720 });
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Your work" })).toBeVisible();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Show only items needing action" }).click();
  await page.addStyleTag({ content: style });
  await page.mouse.move(600, 700);
  await page.waitForTimeout(400);
  await page.screenshot({ path: "playwright/.cache/palettes/final-cyan-dashboard.png" });

  await page.goto("/projects/new");
  await page.addStyleTag({ content: style });
  await page.getByLabel("Project name").fill("Checkout redesign");
  await page.waitForTimeout(300);
  await page.screenshot({ path: "playwright/.cache/palettes/final-cyan-form.png" });
});
