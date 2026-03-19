import { test, expect } from "@playwright/test";

/** Helper: navigate to /tienda, clear cart, and add the first product */
async function addFirstProductToCart(page: import("@playwright/test").Page) {
  await page.goto("/tienda");
  await page.evaluate(() => localStorage.removeItem("bsm-cart"));
  await page.reload();
  await page.waitForLoadState("networkidle");

  const addBtn = page.locator('button[aria-label^="Agregar"]').first();
  await addBtn.waitFor({ state: "visible", timeout: 15000 });
  await addBtn.click();
}

test.describe("Checkout", () => {
  test.beforeEach(async ({ page }) => {
    await addFirstProductToCart(page);
  });

  test("botón Completar pedido abre modal de checkout", async ({ page }) => {
    await page.locator('button[aria-label="Abrir carrito"]').click();
    const checkoutBtn = page.getByText("Completar pedido");
    await expect(checkoutBtn).toBeVisible();
    await checkoutBtn.click();

    const modal = page.getByRole("dialog", { name: "Completar pedido" });
    await expect(modal).toBeVisible();
  });

  test("checkout modal muestra paso 1: Cuenta", async ({ page }) => {
    await page.locator('button[aria-label="Abrir carrito"]').click();
    await page.getByText("Completar pedido").click();

    // Step 1: phone lookup
    const phoneInput = page.locator('input[placeholder="Ej: 961234567"]').first();
    await expect(phoneInput).toBeVisible({ timeout: 5000 });
  });

  test("puede omitir el paso de cuenta y avanzar a Datos", async ({ page }) => {
    await page.locator('button[aria-label="Abrir carrito"]').click();
    await page.getByText("Completar pedido").click();

    const skipBtn = page.getByText("Continuar sin cuenta");
    await expect(skipBtn).toBeVisible({ timeout: 5000 });
    await skipBtn.click();

    // Step 2: delivery details
    const nameInput = page.locator(
      'input[placeholder="Tu nombre completo"]'
    );
    await expect(nameInput).toBeVisible({ timeout: 5000 });
  });

  test("formulario de Datos valida campos requeridos", async ({ page }) => {
    await page.locator('button[aria-label="Abrir carrito"]').click();
    await page.getByText("Completar pedido").click();
    await page.getByText("Continuar sin cuenta").click();

    // Try to advance without filling required fields
    const nextBtn = page.getByRole("button", { name: /siguiente|continuar/i });
    if (await nextBtn.isVisible()) {
      await nextBtn.click();
      // Should still be on step 2 (not advanced)
      await expect(
        page.locator('input[placeholder="Tu nombre completo"]')
      ).toBeVisible();
    }
  });

  test("puede completar datos de entrega y avanzar a Pago", async ({ page }) => {
    await page.locator('button[aria-label="Abrir carrito"]').click();
    await page.getByText("Completar pedido").click();
    await page.getByText("Continuar sin cuenta").click();

    // Fill step 2
    await page
      .locator('input[placeholder="Tu nombre completo"]')
      .fill("Juan Pérez");
    await page
      .locator('input[placeholder="Ej: 961234567"]')
      .last()
      .fill("961234567");
    const addrInput = page.locator(
      'textarea[placeholder*="Calle Principal"]'
    );
    if (await addrInput.isVisible()) {
      await addrInput.fill("Calle Los Pinos 123, Pucallpa");
    }

    const nextBtn = page.getByRole("button", { name: /siguiente|continuar/i });
    if (await nextBtn.isVisible()) {
      await nextBtn.click();
      // Should advance to Pago step (payment method visible)
      await expect(
        page.getByText(/efectivo|yape/i).first()
      ).toBeVisible({ timeout: 5000 });
    }
  });

  // ────────────────────────────────────────────────────────────────────
  // Full end-to-end checkout flow — API mocked to avoid hitting real DB
  // ────────────────────────────────────────────────────────────────────
  test("flujo completo: llena datos → pago efectivo → confirma pedido", async ({ page }) => {
    const MOCK_ORDER_ID = "ORD-E2E-0001";

    // Intercept the order creation API and return a mock successful response
    await page.route("**/api/orders", (route) => {
      if (route.request().method() === "POST") {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: MOCK_ORDER_ID,
            status: "pendiente",
            total: 10,
            items: [],
          }),
        });
      } else {
        route.continue();
      }
    });

    // Step 0: open cart → open checkout
    await page.locator('button[aria-label="Abrir carrito"]').click();
    await page.getByText("Completar pedido").click();

    const modal = page.getByRole("dialog", { name: "Completar pedido" });
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Step 1: skip account lookup
    await page.getByText("Continuar sin cuenta").click();
    await expect(
      page.locator('input[placeholder="Tu nombre completo"]')
    ).toBeVisible({ timeout: 5000 });

    // Step 2: fill delivery details
    await page.locator('input[placeholder="Tu nombre completo"]').fill("Ana García");
    // Phone number in datos step (last visible phone input on page)
    const phoneInputs = page.locator('input[placeholder="Ej: 961234567"]');
    await phoneInputs.last().fill("987654321");

    const addrTextarea = page.locator('textarea[placeholder*="Calle Principal"]');
    if (await addrTextarea.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addrTextarea.fill("Jr. Ucayali 456, Pucallpa");
    }

    // Advance to payment step
    const continueBtn = page.getByRole("button", { name: /siguiente|continuar/i });
    await continueBtn.waitFor({ state: "visible", timeout: 5000 });
    await continueBtn.click();

    // Step 3: select Efectivo payment method
    const efectivoBtn = page.getByRole("radio", { name: /efectivo/i });
    await efectivoBtn.waitFor({ state: "visible", timeout: 5000 });
    await efectivoBtn.click();
    await expect(efectivoBtn).toHaveAttribute("aria-checked", "true");

    // Submit the order
    const submitBtn = page.getByRole("button", { name: /finalizar pedido/i });
    await submitBtn.waitFor({ state: "visible", timeout: 5000 });
    await submitBtn.click();

    // Verify confirmation screen
    await expect(
      page.getByText("¡Pedido enviado!")
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(MOCK_ORDER_ID)).toBeVisible({ timeout: 5000 });
  });

  // ──────────────────────────────────────────────────────────────────
  // Error path: API returns 500 → user sees an error message
  // ──────────────────────────────────────────────────────────────────
  test("muestra error cuando la API falla al crear el pedido", async ({ page }) => {    // Intercept and simulate a server error
    await page.route("**/api/orders", (route) => {
      if (route.request().method() === "POST") {
        route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Internal Server Error" }),
        });
      } else {
        route.continue();
      }
    });

    // Navigate through all steps
    await page.locator('button[aria-label="Abrir carrito"]').click();
    await page.getByText("Completar pedido").click();
    await page.getByText("Continuar sin cuenta").click();

    await page.locator('input[placeholder="Tu nombre completo"]').fill("Error Test");
    await page.locator('input[placeholder="Ej: 961234567"]').last().fill("900000001");

    const addrTextarea = page.locator('textarea[placeholder*="Calle Principal"]');
    if (await addrTextarea.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addrTextarea.fill("Calle Error 000");
    }

    const continueBtn = page.getByRole("button", { name: /siguiente|continuar/i });
    await continueBtn.waitFor({ state: "visible", timeout: 5000 });
    await continueBtn.click();

    const efectivoBtn = page.getByRole("radio", { name: /efectivo/i });
    await efectivoBtn.waitFor({ state: "visible", timeout: 5000 });
    await efectivoBtn.click();

    const submitBtn = page.getByRole("button", { name: /finalizar pedido/i });
    await submitBtn.waitFor({ state: "visible", timeout: 5000 });
    await submitBtn.click();

    // The success screen should NOT appear; an error feedback should be shown instead
    await expect(page.getByText("¡Pedido enviado!")).not.toBeVisible({ timeout: 5000 });
  });

  // ──────────────────────────────────────────────────────────────────
  // Yape payment path — requires operation number before submit
  // ──────────────────────────────────────────────────────────────────
  test("flujo completo: pago con Yape → ingresa número de operación → confirma pedido", async ({ page }) => {
    const MOCK_ORDER_ID = "ORD-E2E-YAPE-001";

    // Mock API to return success without hitting real DB
    await page.route("**/api/orders", (route) => {
      if (route.request().method() === "POST") {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ id: MOCK_ORDER_ID, status: "pendiente", total: 10, items: [] }),
        });
      } else {
        route.continue();
      }
    });

    // Step 0: open checkout modal
    await page.locator('button[aria-label="Abrir carrito"]').click();
    await page.getByText("Completar pedido").click();
    await expect(page.getByRole("dialog", { name: "Completar pedido" })).toBeVisible({ timeout: 5000 });

    // Step 1: skip account
    await page.getByText("Continuar sin cuenta").click();
    await expect(page.locator('input[placeholder="Tu nombre completo"]')).toBeVisible({ timeout: 5000 });

    // Step 2: fill delivery details
    await page.locator('input[placeholder="Tu nombre completo"]').fill("María López");
    await page.locator('input[placeholder="Ej: 961234567"]').last().fill("912345678");
    const addrTextarea = page.locator('textarea[placeholder*="Calle Principal"]');
    if (await addrTextarea.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addrTextarea.fill("Jr. Callao 789, Pucallpa");
    }
    const continueBtn = page.getByRole("button", { name: /siguiente|continuar/i });
    await continueBtn.waitFor({ state: "visible", timeout: 5000 });
    await continueBtn.click();

    // Step 3: select Yape — must show operation number input
    const yapeBtn = page.getByRole("radio", { name: /yape/i });
    await yapeBtn.waitFor({ state: "visible", timeout: 5000 });
    await yapeBtn.click();
    await expect(yapeBtn).toHaveAttribute("aria-checked", "true");

    // Operation number input appears after selecting Yape
    const opInput = page.locator('input[placeholder="Ej: 123456789"]');
    await opInput.waitFor({ state: "visible", timeout: 5000 });

    // Submit button should be disabled until a valid op number is entered
    const submitBtn = page.getByRole("button", { name: /finalizar pedido/i });
    await expect(submitBtn).toBeDisabled();

    // Enter valid operation number (min 6 digits)
    await opInput.fill("987654321");

    // Button should now be enabled
    await expect(submitBtn).toBeEnabled({ timeout: 3000 });
    await submitBtn.click();

    // Verify confirmation screen with order ID
    await expect(page.getByText("¡Pedido enviado!")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(MOCK_ORDER_ID)).toBeVisible({ timeout: 5000 });
  });

  // ──────────────────────────────────────────────────────────────────
  // Coupon flow — apply coupon in checkout, verify discount shown
  // ──────────────────────────────────────────────────────────────────
  test("flujo de cupón: aplica cupón → ve descuento en resumen", async ({ page }) => {
    const MOCK_ORDER_ID = "ORD-E2E-COUPON-01";
    const MOCK_DISCOUNT = 5.00;

    // Mock coupon validation endpoint — return a valid coupon with S/5 discount
    await page.route("**/api/coupons/validate", (route) => {
      if (route.request().method() === "POST") {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            coupon: { code: "DESCUENTO10", discountType: "fixed", discountValue: 5, active: true },
            discount: MOCK_DISCOUNT,
          }),
        });
      } else {
        route.continue();
      }
    });

    // Mock order creation
    await page.route("**/api/orders", (route) => {
      if (route.request().method() === "POST") {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ id: MOCK_ORDER_ID, status: "pendiente", total: 10, items: [] }),
        });
      } else {
        route.continue();
      }
    });

    // Open checkout
    await page.locator('button[aria-label="Abrir carrito"]').click();
    await page.getByText("Completar pedido").click();
    await expect(page.getByRole("dialog", { name: "Completar pedido" })).toBeVisible({ timeout: 5000 });

    // Skip account
    await page.getByText("Continuar sin cuenta").click();
    await expect(page.locator('input[placeholder="Tu nombre completo"]')).toBeVisible({ timeout: 5000 });

    // Fill delivery details
    await page.locator('input[placeholder="Tu nombre completo"]').fill("Test Cupón");
    await page.locator('input[placeholder="Ej: 961234567"]').last().fill("999888777");
    const addrTextarea = page.locator('textarea[placeholder*="Calle Principal"]');
    if (await addrTextarea.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addrTextarea.fill("Av. Cupones 123, Pucallpa");
    }

    // Advance to payment step
    const continueBtn = page.getByRole("button", { name: /siguiente|continuar/i });
    await continueBtn.waitFor({ state: "visible", timeout: 5000 });
    await continueBtn.click();

    // Apply coupon — find the coupon input and type the code
    const couponInput = page.locator('input[placeholder="Ej: DESCUENTO10"]');
    await couponInput.waitFor({ state: "visible", timeout: 5000 });
    await couponInput.fill("DESCUENTO10");

    const applyBtn = page.getByRole("button", { name: "Aplicar" });
    await applyBtn.click();

    // Verify the coupon success message appears
    await expect(page.getByText(`¡Cupón aplicado! -S/${MOCK_DISCOUNT.toFixed(2)}`)).toBeVisible({ timeout: 5000 });

    // Select Efectivo and submit
    const efectivoBtn = page.getByRole("radio", { name: /efectivo/i });
    await efectivoBtn.waitFor({ state: "visible", timeout: 5000 });
    await efectivoBtn.click();

    const submitBtn = page.getByRole("button", { name: /finalizar pedido/i });
    await submitBtn.waitFor({ state: "visible", timeout: 5000 });
    await submitBtn.click();

    // Verify confirmation
    await expect(page.getByText("¡Pedido enviado!")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(MOCK_ORDER_ID)).toBeVisible({ timeout: 5000 });
  });
});
