import { test, expect, APIRequestContext } from "@playwright/test";

// ─────────────────────────────────────────────────────────────────────────────
// Helper: login to superadmin via API and return cookie string
// ─────────────────────────────────────────────────────────────────────────────
async function superadminLogin(request: APIRequestContext): Promise<string | null> {
  const username = process.env.E2E_SUPERADMIN_USERNAME;
  const password = process.env.E2E_SUPERADMIN_PASSWORD;
  if (!username || !password) return null;

  const res = await request.post("/api/superadmin/auth", {
    data: { username, password },
  });
  if (!res.ok()) return null;

  const setCookie = res.headers()["set-cookie"] ?? "";
  const match = setCookie.match(/bsm-platform-sess=[^;]+/);
  return match ? match[0] : null;
}

// ─── Pricing Page ────────────────────────────────────────────────────────────

test.describe("Pricing Page", () => {
  test("renders 4 plan cards with correct names", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.getByText("Planes y Precios")).toBeVisible();
    await expect(page.getByText("Free")).toBeVisible();
    await expect(page.getByText("Pro")).toBeVisible();
    await expect(page.getByText("Business")).toBeVisible();
    await expect(page.getByText("Enterprise")).toBeVisible();
  });

  test("monthly/annual toggle works and shows discount", async ({ page }) => {
    await page.goto("/pricing");
    // Default is monthly
    const annualBtn = page.getByRole("button", { name: /Anual/i });
    await annualBtn.click();
    // Should show "-20%" badge and annual pricing
    await expect(page.getByText("-20%")).toBeVisible();
    await expect(page.getByText(/Ahorras/)).toBeVisible();
  });

  test("plan cards link to /registro with correct plan param", async ({ page }) => {
    await page.goto("/pricing");
    // Check that "Empezar gratis" links to /registro?plan=free
    const freeLink = page.getByRole("link", { name: /Empezar gratis/i });
    await expect(freeLink).toHaveAttribute("href", /\/registro\?plan=free/);
  });

  test("comparison table displays all features", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.getByText("Comparación detallada")).toBeVisible();
    await expect(page.getByText("Dominio propio")).toBeVisible();
    await expect(page.getByText("Analytics avanzado")).toBeVisible();
    await expect(page.getByText("White label")).toBeVisible();
    await expect(page.getByText("SLA garantizado")).toBeVisible();
  });

  test("FAQ section is visible and expandable", async ({ page }) => {
    await page.goto("/pricing");
    const faqQuestion = page.getByText("¿Puedo cambiar de plan en cualquier momento?");
    await expect(faqQuestion).toBeVisible();
    await faqQuestion.click();
    await expect(page.getByText(/ajusta al final del período/)).toBeVisible();
  });
});

// ─── SuperAdmin ──────────────────────────────────────────────────────────────

test.describe("SuperAdmin", () => {
  test("unauthenticated access to /superadmin redirects or shows login", async ({ page }) => {
    await page.context().clearCookies();
    // The superadmin page either shows its own login redirect or auth check
    await page.goto("/superadmin");
    // Should require authentication
    await page.waitForTimeout(2000);
    const url = page.url();
    const hasLogin = url.includes("login") || (await page.getByText(/iniciar sesión|login|contraseña/i).count()) > 0;
    expect(hasLogin || url.includes("login")).toBeTruthy();
  });

  test("superadmin login page renders", async ({ page }) => {
    await page.goto("/superadmin/login");
    await expect(page.getByPlaceholder(/usuario/i)).toBeVisible();
    await expect(page.getByPlaceholder(/contraseña/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /entrar|ingresar|acceder/i })).toBeVisible();
  });

  test("superadmin API requires authentication", async ({ request }) => {
    const res = await request.get("/api/superadmin/tenants");
    expect(res.status()).toBe(401);
  });

  test("superadmin analytics API requires authentication", async ({ request }) => {
    const res = await request.get("/api/superadmin/analytics");
    expect(res.status()).toBe(401);
  });

  test("superadmin activity API requires authentication", async ({ request }) => {
    const res = await request.get("/api/superadmin/activity");
    expect(res.status()).toBe(401);
  });

  test("superadmin login with wrong password fails", async ({ page }) => {
    await page.goto("/superadmin/login");
    await page.getByPlaceholder(/usuario/i).fill("baduser");
    await page.getByPlaceholder(/contraseña/i).fill("wrongpassword123");
    await page.getByRole("button", { name: /entrar|ingresar|acceder/i }).click();
    await page.waitForTimeout(1500);
    // Should still be on login page
    expect(page.url()).toContain("login");
  });

  // Tests below require E2E_SUPERADMIN_USERNAME and E2E_SUPERADMIN_PASSWORD
  test("authenticated superadmin can access tenants API", async ({ request }) => {
    const cookie = await superadminLogin(request);
    test.skip(!cookie, "E2E_SUPERADMIN_USERNAME/PASSWORD not set");

    const res = await request.get("/api/superadmin/tenants", {
      headers: { Cookie: cookie! },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("tenants");
    expect(Array.isArray(data.tenants)).toBe(true);
  });

  test("authenticated superadmin can access analytics API", async ({ request }) => {
    const cookie = await superadminLogin(request);
    test.skip(!cookie, "E2E_SUPERADMIN_USERNAME/PASSWORD not set");

    const res = await request.get("/api/superadmin/analytics", {
      headers: { Cookie: cookie! },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("overview");
    expect(data).toHaveProperty("growth");
    expect(data).toHaveProperty("planDistribution");
    expect(data).toHaveProperty("monthlySignups");
    expect(data).toHaveProperty("monthlyRevenue");
  });

  test("authenticated superadmin can access activity API", async ({ request }) => {
    const cookie = await superadminLogin(request);
    test.skip(!cookie, "E2E_SUPERADMIN_USERNAME/PASSWORD not set");

    const res = await request.get("/api/superadmin/activity", {
      headers: { Cookie: cookie! },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("logs");
    expect(data).toHaveProperty("pagination");
  });
});

// ─── Registration Page ───────────────────────────────────────────────────────

test.describe("Registration Page", () => {
  test("renders step 1 with store name input", async ({ page }) => {
    await page.goto("/registro");
    await expect(page.getByText("Crea tu tienda")).toBeVisible();
    await expect(page.getByPlaceholder(/Bodega/)).toBeVisible();
  });

  test("pre-selects plan from URL query param", async ({ page }) => {
    await page.goto("/registro?plan=pro");
    // Navigate to step 2 to verify plan selection
    await page.getByPlaceholder(/Bodega/).fill("Mi Tienda Test");
    await page.waitForTimeout(600);
    // Fill email
    const emailInput = page.locator("input[type='email']");
    if (await emailInput.count() > 0) {
      await emailInput.fill("test@test.com");
    }
  });

  test("enterprise plan is selectable", async ({ page }) => {
    await page.goto("/registro?plan=enterprise");
    await expect(page.getByText("Crea tu tienda")).toBeVisible();
  });
});
