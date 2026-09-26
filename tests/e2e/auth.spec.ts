import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { makeSignature } from "better-auth/crypto";

test("an active session skips login and signup", async ({ page }) => {
  const { name } = JSON.parse(await readFile("playwright/.cache/test-web-database.json", "utf8"));
  const secret = process.env.SPECTHREAD_TEST_AUTH_SECRET;
  if (!secret) throw new Error("Test auth secret is missing");
  const userId = randomUUID();
  const sessionId = randomUUID();
  const token = randomUUID();
  const runSql = (sql: string) => execFileSync("docker", [
    "exec", "-u", "postgres", name, "psql", "-U", "postgres", "-d", "postgres",
    "-v", "ON_ERROR_STOP=1", "-c", sql,
  ], { stdio: "ignore" });

  runSql(`INSERT INTO public."user" (id,name,email,"emailVerified","createdAt","updatedAt")
    VALUES ('${userId}','Navigation test','${userId}@example.invalid',true,now(),now());
    INSERT INTO public.session (id,"userId",token,"expiresAt","createdAt","updatedAt")
    VALUES ('${sessionId}','${userId}','${token}',now() + interval '1 hour',now(),now());`);
  try {
    await page.context().addCookies([{
      name: "better-auth.session_token",
      value: `${token}.${await makeSignature(token, secret)}`,
      url: "http://127.0.0.1:3100",
    }]);
    const sessionResponse = await page.request.get("/api/auth/get-session");
    expect((await sessionResponse.json())?.user?.id).toBe(userId);
    for (const route of ["/login", "/signup"]) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/dashboard$/);
    }
    const accountLink = page.getByRole("link", { name: "Account" });
    await expect(accountLink).toHaveAttribute("href", "/account");
    await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Log in" })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Sign up" })).toHaveCount(0);
    await accountLink.click();
    await expect(page).toHaveURL(/\/account$/);
  } finally {
    runSql(`DELETE FROM public."user" WHERE id = '${userId}'`);
  }
});

test("an invalid session cookie does not skip login", async ({ page }) => {
  await page.context().addCookies([{
    name: "better-auth.session_token", value: "not-a-valid-session",
    url: "http://127.0.0.1:3100",
  }]);
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});

for (const path of ["/login", "/signup"]) {
  test(`${path} handles returned errors and retries on the current origin`, async ({ page }) => {
    let attempts = 0;
    await page.route("**/api/auth/sign-in/social", async route => {
      expect(new URL(route.request().url()).origin).toBe("http://127.0.0.1:3100");
      expect(route.request().postDataJSON()).toMatchObject({ provider: "github", callbackURL: "/dashboard", errorCallbackURL: "/auth/error" });
      attempts++;
      await route.fulfill({ status: attempts === 1 ? 500 : 429, json: { message: "private-provider-detail" } });
    });
    await page.goto(path);
    const button = page.getByRole("button", { name: /with GitHub/ });
    const alert = page.locator(".auth-panel [role='alert']");
    await button.click();
    await expect(alert).toHaveText("Unable to start GitHub sign-in. Please try again.");
    await expect(button).toBeEnabled();
    await button.click();
    await expect(alert).toContainText("Too many attempts");
    await expect(button).toBeEnabled();
    expect(attempts).toBe(2);
  });
}

test("network failure makes sign-in retryable", async ({ page }) => {
  await page.route("**/api/auth/sign-in/social", route => route.abort("failed"));
  await page.goto("/login");
  await page.getByRole("button", { name: /with GitHub/ }).click();
  await expect(page.locator(".auth-panel [role='alert']")).toContainText("Please try again.");
  await expect(page.getByRole("button", { name: /with GitHub/ })).toBeEnabled();
});

test("successful initiation follows the provider redirect", async ({ page }) => {
  await page.route("https://github.com/login/oauth/authorize**", route => route.fulfill({ contentType: "text/html", body: "<h1>Test provider</h1>" }));
  await page.route("**/api/auth/sign-in/social", route => route.fulfill({ json: { url: "https://github.com/login/oauth/authorize?client_id=test", redirect: true } }));
  await page.goto("/login");
  await page.getByRole("button", { name: /with GitHub/ }).click();
  await expect(page).toHaveURL(/github\.com\/login\/oauth\/authorize/);
});

test("OAuth callback failures use the public error page", async ({ page }) => {
  await page.goto("/api/auth/callback/github?error=access_denied");
  await expect(page).toHaveURL(/\/auth\/error\?error=state_not_found/);
  await expect(page.getByText("This sign-in attempt could not be verified. Start a new attempt to continue.")).toBeVisible();
});

test("error page handles cancellation and untrusted input accessibly", async ({ page }, testInfo) => {
  await page.goto("/auth/error?error=access_denied");
  await expect(page.getByRole("heading", { name: "Sign-in cancelled" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("auth-error-desktop.png"), fullPage: true });
  const retry = page.getByRole("link", { name: "Try signing in again" });
  await retry.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/login$/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/auth/error?error=unknown&error_description=private-provider-detail&callbackURL=https://evil.example");
  await expect(page.getByRole("heading", { name: "Sign-in unsuccessful" })).toBeVisible();
  await expect(page.getByText("private-provider-detail")).toHaveCount(0);
  await expect(page.locator('a[href*="evil.example"]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("auth-error-mobile.png"), fullPage: true });
});

test("Google sign-in requests the Google provider", async ({ page }) => {
  let body: unknown;
  await page.route("**/api/auth/sign-in/social", async route => {
    body = route.request().postDataJSON();
    await route.fulfill({ status: 500, json: {} });
  });
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page.locator(".auth-panel [role='alert']")).toHaveText("Unable to start Google sign-in. Please try again.");
  expect(body).toMatchObject({ provider: "google", callbackURL: "/dashboard", errorCallbackURL: "/auth/error" });
});

test("email login handles wrong passwords, throttling and unverified email by keyboard", async ({ page }) => {
  const statuses = [401, 429, 403];
  await page.route("**/api/auth/sign-in/email", route => {
    const status = statuses.shift()!;
    return route.fulfill({ status, json: { code: status === 403 ? "EMAIL_NOT_VERIFIED" : "ERROR", message: "private-detail" } });
  });
  let resent: unknown;
  await page.route("**/api/auth/send-verification-email", async route => {
    resent = route.request().postDataJSON();
    await route.fulfill({ json: { status: true } });
  });
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("person@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("a long enough password");
  await page.keyboard.press("Enter");
  const alert = page.locator(".auth-panel [role='alert']");
  await expect(alert).toHaveText("Incorrect email or password.");
  await page.keyboard.press("Enter");
  await expect(alert).toContainText("Too many attempts");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await expect(page.getByText("private-detail")).toHaveCount(0);
  await page.getByRole("button", { name: "Resend verification email" }).click();
  await expect(page.getByRole("status")).toContainText("a new email is on its way");
  expect(resent).toMatchObject({ email: "person@example.invalid", callbackURL: "/dashboard" });
});

test("sign-up validates the password and then asks the user to check their email", async ({ page }) => {
  let body: Record<string, unknown> = {};
  await page.route("**/api/auth/sign-up/email", async route => {
    body = route.request().postDataJSON();
    await route.fulfill({ json: { token: null, user: {} } });
  });
  await page.goto("/signup");
  await page.getByLabel("Name", { exact: true }).fill("Person");
  await page.getByLabel("Email", { exact: true }).fill("person@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("short");
  await page.getByRole("button", { name: "Sign up" }).click();
  expect(await page.getByLabel("Password", { exact: true }).evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(false);
  await page.getByLabel("Password", { exact: true }).fill("a long enough password");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  expect(body).toMatchObject({ name: "Person", email: "person@example.invalid", callbackURL: "/dashboard" });
});

test("forgot password never reveals whether an account exists", async ({ page }) => {
  await page.route("**/api/auth/request-password-reset", route => route.fulfill({ json: { status: true } }));
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill("anyone@example.invalid");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toHaveText("If an account uses that email, we sent a link to reset its password.");
});

test("reset password checks confirmation and handles expired links", async ({ page }) => {
  await page.route("**/api/auth/reset-password", route => route.fulfill({ status: 400, json: { code: "INVALID_TOKEN" } }));
  await page.goto("/reset-password?token=test-token");
  await page.getByLabel("New password", { exact: true }).fill("a long enough password");
  await page.getByLabel("Confirm new password", { exact: true }).fill("a different long password");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.locator(".auth-panel [role='alert']")).toHaveText("The passwords do not match.");
  await page.getByLabel("Confirm new password", { exact: true }).fill("a long enough password");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByRole("heading", { name: "Reset link expired" })).toBeVisible();
  await page.goto("/reset-password?error=INVALID_TOKEN");
  await expect(page.getByRole("link", { name: "Request a new link" })).toBeVisible();
});

test("account page requires sign-in", async ({ page }) => {
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login$/);
});

test("linking errors show fixed guidance", async ({ page }) => {
  await page.goto("/auth/error?error=account_already_linked_to_different_user");
  await expect(page.getByText("already linked to a different SpecThread account")).toBeVisible();
  await page.goto("/auth/error?error=account_not_linked");
  await expect(page.getByText("An account with this email already exists.")).toBeVisible();
});
