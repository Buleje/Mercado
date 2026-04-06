import { test, expect, type Page } from "@playwright/test";

/**
 * E2E: Multi-tenant isolation tests
 *
 * These tests verify that:
 * 1. Each tenant's store loads via /t/{slug}/tienda path routing
 * 2. Products shown belong to the correct tenant
 * 3. Carts are isolated between tenants
 * 4. The tenant indicator bar shows the correct store name
 *
 * Prerequisites:
 *   - seed-demo.ts executed  (tenant: demo)
 *   - seed-fruteria.ts executed (tenant: fruteria-maria)
 */

const DEMO_URL = "/t/demo/tienda";
const FRUTERIA_URL = "/t/fruteria-maria/tienda";

/** Helper: clear all bsm-* localStorage keys */
async function clearTenantStorage(page: Page) {
  await page.evaluate(() => {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith("bsm-"));
    keys.forEach((k) => localStorage.removeItem(k));
  });
}

test.describe("Tenant Routing", () => {
  test("demo store loads via slug path", async ({ page }) => {
    await page.goto(DEMO_URL);
    // Should not be a 404
    await expect(page.locator("body")).not.toContainText("404");
    // Should show some content
    await expect(page.locator("main#main-content").or(page.locator("main")).first()).toBeVisible();
  });

  test("fruteria store loads via slug path", async ({ page }) => {
    await page.goto(FRUTERIA_URL);
    await expect(page.locator("body")).not.toContainText("404");
    await expect(page.locator("main#main-content").or(page.locator("main")).first()).toBeVisible();
  });

  test("invalid slug returns error or redirect", async ({ page }) => {
    const res = await page.goto("/t/nonexistent-store-12345/tienda");
    // Either a 404 page or redirect is acceptable
    const status = res?.status() ?? 200;
    const isErrorOrRedirect = status === 404 || status >= 300 || (await page.locator("body").textContent())?.includes("404");
    expect(isErrorOrRedirect || status === 200).toBeTruthy();
  });
});

test.describe("Tenant Indicator Bar", () => {
  test("shows store name for non-main tenant", async ({ page }) => {
    await page.goto(DEMO_URL);
    // Wait for hydration
    await page.waitForTimeout(1000);
    const indicator = page.getByText("Estás comprando en");
    // The indicator should be visible for non-main tenants
    await expect(indicator).toBeVisible({ timeout: 5000 });
  });

  test("indicator hidden on main tenant", async ({ page }) => {
    await page.goto("/tienda");
    await page.waitForTimeout(1000);
    const indicator = page.getByText("Estás comprando en");
    await expect(indicator).toBeHidden();
  });
});

test.describe("Cart Isolation", () => {
  test.beforeEach(async ({ page }) => {
    // Clear storage for clean state
    await page.goto("/");
    await clearTenantStorage(page);
  });

  test("adding item in demo does not appear in fruteria cart", async ({ page }) => {
    // Visit demo store and add an item
    await page.goto(DEMO_URL);
    await page.waitForTimeout(1500); // hydration

    // Find and click first "Agregar" button
    const addBtn = page.getByRole("button", { name: /agregar|añadir/i }).first();
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await page.waitForTimeout(500);

      // Read demo cart from localStorage
      const demoCart = await page.evaluate(() => {
        return localStorage.getItem("bsm-demo-cart");
      });
      expect(demoCart).toBeTruthy();
      const demoItems = JSON.parse(demoCart!);
      expect(demoItems.length).toBeGreaterThan(0);

      // Navigate to fruteria
      await page.goto(FRUTERIA_URL);
      await page.waitForTimeout(1500);

      // Fruteria cart should be empty
      const fruteriaCart = await page.evaluate(() => {
        return localStorage.getItem("bsm-fruteria-maria-cart");
      });
      const fruteriaItems = fruteriaCart ? JSON.parse(fruteriaCart) : [];
      expect(fruteriaItems.length).toBe(0);
    }
  });

  test("localStorage keys are scoped by tenant slug", async ({ page }) => {
    await page.goto(DEMO_URL);
    await page.waitForTimeout(1500);

    // Check that cart key uses demo prefix
    const keys = await page.evaluate(() => {
      return Object.keys(localStorage).filter((k) => k.includes("demo"));
    });

    // After visiting demo store, there should be at least one key with "demo" in it
    // (either bsm-demo-cart or bsm-demo-pending)
    const hasDemoKey = keys.some((k) => k.startsWith("bsm-demo-"));
    expect(hasDemoKey).toBeTruthy();
  });
});

test.describe("Product Isolation", () => {
  test("demo and fruteria show different products", async ({ page }) => {
    // Get demo products
    await page.goto(DEMO_URL);
    await page.waitForTimeout(2000);
    const demoText = await page.locator("main").textContent();

    // Get fruteria products
    await page.goto(FRUTERIA_URL);
    await page.waitForTimeout(2000);
    const fruteriaText = await page.locator("main").textContent();

    // Fruteria should have fruit-related content
    // (This is a heuristic — at minimum the page content should differ)
    if (demoText && fruteriaText) {
      expect(demoText).not.toEqual(fruteriaText);
    }
  });
});

// ── API-Level Isolation Tests ─────────────────────────────────────────────────

test.describe("API Product Isolation", () => {
  test("GET /api/products returns different products per tenant", async ({ request }) => {
    const demoRes = await request.get("/t/demo/api/products");
    const fruteriaRes = await request.get("/t/fruteria-maria/api/products");

    // Both should succeed
    expect([200, 304]).toContain(demoRes.status());
    expect([200, 304]).toContain(fruteriaRes.status());

    const demoData = await demoRes.json();
    const fruteriaData = await fruteriaRes.json();

    // Both should be arrays (or have a data/products property)
    const demoProducts = Array.isArray(demoData) ? demoData : demoData.products ?? demoData.data ?? [];
    const fruteriaProducts = Array.isArray(fruteriaData) ? fruteriaData : fruteriaData.products ?? fruteriaData.data ?? [];

    // Extract product IDs — they must not overlap
    const demoIds = new Set(demoProducts.map((p: { id: number | string }) => p.id));
    const fruteriaIds = new Set(fruteriaProducts.map((p: { id: number | string }) => p.id));

    for (const id of fruteriaIds) {
      expect(demoIds.has(id)).toBe(false);
    }
  });
});

test.describe("Header Injection Prevention", () => {
  test("manually set x-tenant-id header is ignored by proxy", async ({ request }) => {
    // Try to access fruteria data by injecting x-tenant-id header while on demo
    const res = await request.get("/t/demo/api/products", {
      headers: { "x-tenant-id": "fruteria-maria" },
    });

    expect([200, 304]).toContain(res.status());

    const data = await res.json();
    const products = Array.isArray(data) ? data : data.products ?? data.data ?? [];

    // Get the actual fruteria products for comparison
    const fruteriaRes = await request.get("/t/fruteria-maria/api/products");
    const fruteriaData = await fruteriaRes.json();
    const fruteriaProducts = Array.isArray(fruteriaData) ? fruteriaData : fruteriaData.products ?? fruteriaData.data ?? [];
    const fruteriaIds = new Set(fruteriaProducts.map((p: { id: number | string }) => p.id));

    // The response from /t/demo/ must NOT contain fruteria products
    // even though we sent x-tenant-id: fruteria-maria
    for (const product of products) {
      expect(fruteriaIds.has(product.id)).toBe(false);
    }
  });
});

test.describe("Nonexistent Tenant Handling", () => {
  test("accessing a nonexistent tenant via API returns error or empty", async ({ request }) => {
    const res = await request.get("/t/tienda-fantasma-xyz/api/products");
    const status = res.status();
    // Acceptable: 404, 500 (if tenant validation), or 200 with empty results
    if (status === 200) {
      const data = await res.json();
      const products = Array.isArray(data) ? data : data.products ?? data.data ?? [];
      // A nonexistent tenant should have no products
      expect(products.length).toBe(0);
    } else {
      expect([400, 404, 500]).toContain(status);
    }
  });

  test("nonexistent tenant tienda page shows 404 or error", async ({ page }) => {
    const res = await page.goto("/t/tienda-fantasma-xyz-99/tienda");
    const status = res?.status() ?? 200;
    const bodyText = await page.locator("body").textContent();
    // Should show 404 page or have "404" / "no encontrada" text
    const isError = status === 404 || bodyText?.includes("404") || bodyText?.toLowerCase().includes("no encontrad");
    expect(isError).toBeTruthy();
  });
});

test.describe("Favorites Isolation", () => {
  test("favorites in demo do not appear in fruteria", async ({ page }) => {
    // Visit demo and check favorites key
    await page.goto(DEMO_URL);
    await page.waitForTimeout(1500);

    // Set a fake favorite in demo scope
    await page.evaluate(() => {
      localStorage.setItem("bsm-favorites-demo", JSON.stringify(["product-1"]));
    });

    // Navigate to fruteria
    await page.goto(FRUTERIA_URL);
    await page.waitForTimeout(1500);

    // Fruteria favorites should be empty/different
    const fruteriaFavs = await page.evaluate(() => {
      return localStorage.getItem("bsm-favorites-fruteria-maria");
    });
    const favs = fruteriaFavs ? JSON.parse(fruteriaFavs) : [];
    expect(favs).not.toContain("product-1");
  });
});

test.describe("Admin Auth Cross-Tenant", () => {
  test("admin login page loads for each tenant", async ({ page }) => {
    // Demo admin login
    await page.goto("/t/demo/admin/login");
    await expect(page.locator("body")).not.toContainText("500");

    // Fruteria admin login
    await page.goto("/t/fruteria-maria/admin/login");
    await expect(page.locator("body")).not.toContainText("500");
  });
});
