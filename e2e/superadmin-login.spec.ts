import { test, expect } from "@playwright/test";

test.describe("Superadmin Login Flow", () => {
  test("login page loads without infinite redirect loop", async ({ page }) => {
    // Navigate to login — should NOT redirect back to itself infinitely
    const response = await page.goto("/superadmin/login");
    expect(response?.status()).toBe(200);

    // Should show the login form, not a redirect chain
    await expect(page.locator('input[type="text"], input[name="username"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 5000 });
  });

  test("login page does not flash unstyled content", async ({ page }) => {
    await page.goto("/superadmin/login");

    // The login form should appear once and stay — no layout shift
    const form = page.locator("form");
    await expect(form).toBeVisible({ timeout: 5000 });

    // Wait a bit and verify the form is still there (no redirect cycle)
    await page.waitForTimeout(2000);
    await expect(form).toBeVisible();
  });

  test("shows error on invalid credentials", async ({ page }) => {
    await page.goto("/superadmin/login");

    await page.fill('input[type="text"], input[name="username"]', "wronguser");
    await page.fill('input[type="password"]', "wrongpass");
    await page.click('button[type="submit"]');

    // Should show an error message, not crash or redirect
    await expect(page.locator("text=/credenciales|error|invalid|incorrecto/i")).toBeVisible({ timeout: 10000 });
  });

  test("unauthenticated access to /superadmin/dashboard redirects to login", async ({ page }) => {
    await page.goto("/superadmin/dashboard");

    // Should end up at login page
    await expect(page).toHaveURL(/\/superadmin\/login/, { timeout: 10000 });
  });

  test("dashboard loads with sidebar shell after login", async ({ page }) => {
    await page.goto("/superadmin/login");

    // Fill in valid credentials (from env or defaults)
    const username = process.env.SUPERADMIN_USER ?? "platform";
    const password = process.env.SUPERADMIN_PASS ?? "platform123";

    await page.fill('input[type="text"], input[name="username"]', username);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');

    // Should navigate to dashboard
    await expect(page).toHaveURL(/\/superadmin\/dashboard/, { timeout: 15000 });

    // Dashboard should have the sidebar (SuperAdminShell)
    await expect(page.locator("nav, aside")).toBeVisible({ timeout: 5000 });
  });
});
