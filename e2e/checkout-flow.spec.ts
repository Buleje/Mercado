import { test, expect, type Page } from "@playwright/test";

/**
 * Checkout Flow E2E — Refactored sub-components
 *
 * Tests the full checkout modal flow using the refactored components:
 *   CheckoutAccountStep → customer form (datos) → CheckoutPaymentSection
 *
 * Steps: "cuenta" → "datos" → "pago" → "exito"
 * Uses serial mode since later tests depend on earlier state (cart + modal).
 */

test.describe("Checkout Flow (refactored)", () => {
  test.describe.configure({ mode: "serial" });

  /**
   * Helper: add a product to cart and open the checkout modal.
   * Reused across tests that need the modal open with items.
   */
  async function addProductAndOpenCheckout(page: Page) {
    await page.goto("/tienda");
    await page.waitForLoadState("networkidle");

    // Wait for at least one product card with an "Agregar" button
    const addBtn = page.locator('button[aria-label^="Agregar"]').first();
    await addBtn.waitFor({ state: "visible", timeout: 20000 });
    await addBtn.click();

    // Wait for the cart count to update
    const cartBtn = page.locator('button[aria-label="Abrir carrito"]');
    await expect(cartBtn).toContainText("1", { timeout: 5000 });

    // Open cart sidebar
    await cartBtn.click();
    const sidebar = page.getByRole("dialog", { name: "Carrito de compras" });
    await expect(sidebar).toBeVisible({ timeout: 5000 });

    // Click the checkout / pay button inside the sidebar
    const checkoutBtn = sidebar
      .getByRole("button", {
        name: /pagar|checkout|finalizar|comprar|completar pedido/i,
      })
      .or(sidebar.locator('[data-testid="checkout-button"]'));
    await expect(checkoutBtn).toBeVisible({ timeout: 5000 });
    await checkoutBtn.click();

    // Return the modal locator for downstream assertions
    const modal = page
      .locator('[data-testid="checkout-modal"]')
      .or(page.getByRole("dialog").filter({ hasText: /cuenta|pago|datos/i }));
    await expect(modal).toBeVisible({ timeout: 10000 });
    return modal;
  }

  // ── 1. Checkout modal opens ────────────────────────────────────────

  test("1 — checkout modal opens when clicking pay from cart", async ({
    page,
  }) => {
    const modal = await addProductAndOpenCheckout(page);

    // Step bar should be visible with step labels
    await expect(modal.getByText(/tu cuenta/i).or(modal.getByText("1"))).toBeVisible({
      timeout: 5000,
    });
  });

  // ── 2. Account step — phone lookup ─────────────────────────────────

  test("2 — account step: enter phone number and see customer lookup", async ({
    page,
  }) => {
    const modal = await addProductAndOpenCheckout(page);

    // Should show "Ya tienes cuenta?" heading
    await expect(
      modal.getByText(/ya tienes cuenta/i)
    ).toBeVisible({ timeout: 5000 });

    // Phone input should be present (type=tel with placeholder 987654321)
    const phoneInput = modal.locator('input[type="tel"]');
    await expect(phoneInput).toBeVisible();
    await phoneInput.fill("987654321");

    // "Buscar" button should be enabled once 9 digits entered
    const searchBtn = modal.getByRole("button", { name: /buscar/i });
    await expect(searchBtn).toBeEnabled();
  });

  // ── 3. Customer form — skip to "Soy nuevo" and fill data ──────────

  test("3 — customer form: click 'Soy nuevo' and fill name/address", async ({
    page,
  }) => {
    const modal = await addProductAndOpenCheckout(page);

    // Click "Continuar" (skip account / soy nuevo)
    const newCustomerBtn = modal.getByRole("button", {
      name: /continuar|soy nuevo/i,
    });
    await expect(newCustomerBtn).toBeVisible({ timeout: 5000 });
    await newCustomerBtn.click();

    // Should transition to step "datos" — look for name input or address fields
    // The step bar should highlight step 2
    const nameInput = modal
      .getByPlaceholder(/nombre/i)
      .or(modal.locator('input[name="name"]'))
      .or(modal.locator('input[name="customerName"]'));

    const addressInput = modal
      .getByPlaceholder(/direcci[oó]n|calle|ubicaci[oó]n/i)
      .or(modal.locator('input[name="location"]'))
      .or(modal.locator('input[name="address"]'))
      .or(modal.locator('textarea[name="location"]'));

    // At least one of name/address should be visible on the datos step
    const nameOrAddress = nameInput.or(addressInput);
    await expect(nameOrAddress.first()).toBeVisible({ timeout: 10000 });
  });

  // ── 4. Delivery schedule — select time slot ────────────────────────

  test("4 — delivery schedule: select a delivery time slot", async ({
    page,
  }) => {
    const modal = await addProductAndOpenCheckout(page);

    // Skip account step
    await modal
      .getByRole("button", { name: /continuar|soy nuevo/i })
      .click();

    // Wait for datos step to load
    await page.waitForTimeout(500);

    // Look for delivery schedule section — "Horario de entrega" label
    const scheduleLabel = modal.getByText(/horario de entrega/i);

    // The delivery schedule might be on the datos step or as part of the pago step
    // Try to find the "Lo antes posible" slot button
    const asapSlot = modal.getByRole("button", {
      name: /lo antes posible/i,
    });

    // If schedule is on current step, interact with it
    if (await scheduleLabel.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(asapSlot).toBeVisible({ timeout: 5000 });
      // Should be selected by default or clickable
      await asapSlot.click();
      // Verify it gets the selected style (contains bg-[#00B4A6] or similar)
      await expect(asapSlot).toHaveClass(/bg-\[#00B4A6\]|bg-primary/);
    } else {
      // Navigate forward to find it — fill minimal datos and continue
      const continueBtn = modal.getByRole("button", {
        name: /continuar|siguiente/i,
      });
      if (await continueBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await continueBtn.click();
        await expect(
          scheduleLabel.or(asapSlot)
        ).toBeVisible({ timeout: 8000 });
      }
    }
  });

  // ── 5. Payment method — choose Yape ────────────────────────────────

  test("5 — payment method: select Yape and see Yape panel", async ({
    page,
  }) => {
    // Mock the coupon validation API to avoid network dependency
    await page.route("**/api/coupons/**", (route) =>
      route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "not found" }),
      })
    );

    const modal = await addProductAndOpenCheckout(page);

    // Skip to datos step
    await modal
      .getByRole("button", { name: /continuar|soy nuevo/i })
      .click();
    await page.waitForTimeout(500);

    // Try to advance to payment step
    const continueBtn = modal.getByRole("button", {
      name: /continuar|siguiente/i,
    });
    if (await continueBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await continueBtn.click();
      await page.waitForTimeout(500);
    }

    // Look for "Metodo de pago" section
    const paymentSection = modal.getByText(/m[eé]todo de pago/i);
    await expect(paymentSection).toBeVisible({ timeout: 10000 });

    // Select Yape (role="radio" with text "Yape")
    const yapeBtn = modal
      .getByRole("radio", { name: /yape/i })
      .or(modal.locator('button').filter({ hasText: /^Yape$/ }));

    if (await yapeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await yapeBtn.click();

      // The YapePaymentPanel should appear — look for "Pago con Yape" text
      await expect(
        modal.getByText(/pago con yape/i)
      ).toBeVisible({ timeout: 5000 });

      // Operation number input should appear
      const opInput = modal
        .getByPlaceholder(/123456789/i)
        .or(modal.locator('input[inputmode="numeric"]'));
      await expect(opInput).toBeVisible({ timeout: 5000 });
    } else {
      // Yape may not be enabled in test env — skip gracefully
      test.skip(true, "Yape payment not enabled in test environment");
    }
  });

  // ── 6. Payment method — choose Efectivo and see change calculator ──

  test("6 — payment method: select cash and see change calculator", async ({
    page,
  }) => {
    const modal = await addProductAndOpenCheckout(page);

    // Skip to datos step
    await modal
      .getByRole("button", { name: /continuar|soy nuevo/i })
      .click();
    await page.waitForTimeout(500);

    // Advance to payment step if needed
    const continueBtn = modal.getByRole("button", {
      name: /continuar|siguiente/i,
    });
    if (await continueBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await continueBtn.click();
      await page.waitForTimeout(500);
    }

    // Select Efectivo
    const cashBtn = modal
      .getByRole("radio", { name: /efectivo/i })
      .or(modal.locator('button').filter({ hasText: /^Efectivo$/ }));
    await expect(cashBtn).toBeVisible({ timeout: 10000 });
    await cashBtn.click();

    // CashChangeCalculator should appear — look for "Pago contra entrega" or bill buttons
    await expect(
      modal
        .getByText(/pago contra entrega/i)
        .or(modal.getByText(/cu[aá]nto vas a pagar/i))
    ).toBeVisible({ timeout: 5000 });

    // Bill denomination buttons should appear (S/10, S/20, etc.)
    const billBtn = modal.getByRole("button", { name: /S\/\d+/ }).first();
    await expect(billBtn).toBeVisible({ timeout: 5000 });

    // Click a bill to see the change amount
    await billBtn.click();

    // "Tu vuelto" message should appear if the bill is larger than the total
    // (This may or may not appear depending on total vs bill, so we just verify the click worked)
    const changeMsg = modal.getByText(/tu vuelto/i);
    const exactBtn = modal.getByRole("button", { name: /monto exacto/i });
    // Either change is shown or "monto exacto" is visible
    await expect(changeMsg.or(exactBtn)).toBeVisible({ timeout: 5000 });
  });

  // ── 7. Order summary — verify cart items displayed ─────────────────

  test("7 — order summary: cart items are displayed correctly", async ({
    page,
  }) => {
    const modal = await addProductAndOpenCheckout(page);

    // Skip account step
    await modal
      .getByRole("button", { name: /continuar|soy nuevo/i })
      .click();
    await page.waitForTimeout(500);

    // Advance to payment step if needed
    const continueBtn = modal.getByRole("button", {
      name: /continuar|siguiente/i,
    });
    if (await continueBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await continueBtn.click();
      await page.waitForTimeout(500);
    }

    // Look for the order review section — "Revisar pedido" summary
    const reviewSummary = modal.getByText(/revisar pedido/i);
    await expect(reviewSummary).toBeVisible({ timeout: 10000 });

    // At least 1 product should be listed (we added 1 item)
    await expect(
      modal.getByText(/1\s*producto/i).or(modal.getByText(/x1/))
    ).toBeVisible({ timeout: 5000 });

    // Subtotal and total should be displayed with S/ currency
    await expect(
      modal.getByText(/subtotal/i)
    ).toBeVisible({ timeout: 5000 });

    await expect(
      modal.getByText(/total a pagar/i).or(modal.getByText(/total/i))
    ).toBeVisible({ timeout: 5000 });

    // A monetary amount should be visible (S/ followed by digits)
    await expect(
      modal.getByText(/S\/\s*\d+/).first()
    ).toBeVisible({ timeout: 5000 });
  });

  // ── 8. Coupon validation — enter invalid coupon, see error ─────────

  test("8 — coupon validation: enter invalid coupon and see error", async ({
    page,
  }) => {
    // Mock coupon API to return error
    await page.route("**/api/coupons/**", (route) =>
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "Cupon no valido" }),
      })
    );
    await page.route("**/api/validate-coupon**", (route) =>
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "Cupon no valido" }),
      })
    );

    const modal = await addProductAndOpenCheckout(page);

    // Skip account step
    await modal
      .getByRole("button", { name: /continuar|soy nuevo/i })
      .click();
    await page.waitForTimeout(500);

    // Advance to payment step
    const continueBtn = modal.getByRole("button", {
      name: /continuar|siguiente/i,
    });
    if (await continueBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await continueBtn.click();
      await page.waitForTimeout(500);
    }

    // Look for coupon input (placeholder "CODIGO")
    const couponInput = modal
      .getByPlaceholder(/codigo/i)
      .or(modal.locator('input[placeholder="CODIGO"]'));
    await expect(couponInput).toBeVisible({ timeout: 10000 });

    // Type invalid coupon
    await couponInput.fill("INVALIDO123");

    // Click "Aplicar" button
    const applyBtn = modal.getByRole("button", { name: /aplicar/i });
    await expect(applyBtn).toBeEnabled();
    await applyBtn.click();

    // Should show error message (couponMsg displayed as red text when !couponApplied)
    // The component shows couponMsg in a <p> with text-red-500 class
    const errorMsg = modal.locator(".text-red-500").or(
      modal.getByText(/no v[aá]lid|invalid|error|no encontrad/i)
    );
    await expect(errorMsg.first()).toBeVisible({ timeout: 8000 });
  });

  // ── 9. Submit order — complete checkout flow (mock API) ────────────

  test("9 — submit order: complete full checkout flow with mocked API", async ({
    page,
  }) => {
    // Mock the order creation API
    await page.route("**/api/orders**", (route) => {
      if (route.request().method() === "POST") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: { id: "TEST-001", status: "confirmed" },
            orderId: "TEST-001",
          }),
        });
      }
      return route.continue();
    });

    // Mock customer search to return not found
    await page.route("**/api/customers**", (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: [] }),
        });
      }
      return route.continue();
    });

    const modal = await addProductAndOpenCheckout(page);

    // Step 1: Skip account — click "Soy nuevo" / "Continuar"
    const skipBtn = modal.getByRole("button", {
      name: /continuar|soy nuevo/i,
    });
    await expect(skipBtn).toBeVisible({ timeout: 5000 });
    await skipBtn.click();
    await page.waitForTimeout(500);

    // Step 2: Fill customer data (datos step)
    // Try to fill name
    const nameInput = modal
      .getByPlaceholder(/nombre/i)
      .or(modal.locator('input[name="name"]'))
      .or(modal.locator('input[name="customerName"]'));
    if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nameInput.fill("Test Customer");
    }

    // Try to fill phone
    const phoneInput = modal
      .locator('input[type="tel"]')
      .or(modal.getByPlaceholder(/celular|tel[eé]fono|9/i));
    if (await phoneInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await phoneInput.fill("999888777");
    }

    // Try to advance to payment step
    const continueBtn = modal.getByRole("button", {
      name: /continuar|siguiente/i,
    });
    if (await continueBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await continueBtn.click();
      await page.waitForTimeout(500);
    }

    // Step 3: Select payment method (Efectivo is always available)
    const cashBtn = modal
      .getByRole("radio", { name: /efectivo/i })
      .or(modal.locator('button').filter({ hasText: /^Efectivo$/ }));
    if (await cashBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await cashBtn.click();
      await page.waitForTimeout(300);
    }

    // Submit the order — click "Finalizar pedido"
    const submitBtn = modal
      .getByRole("button", { name: /finalizar pedido/i })
      .or(modal.locator('button[type="submit"]'));
    await expect(submitBtn).toBeVisible({ timeout: 10000 });
    await submitBtn.click();

    // Should transition to success step or show confirmation
    // Look for "Pedido confirmado" text or order ID
    const successMsg = page
      .getByText(/pedido confirmado/i)
      .or(page.getByText(/TEST-001/))
      .or(page.getByText(/seguir comprando/i));
    await expect(successMsg.first()).toBeVisible({ timeout: 15000 });
  });
});
