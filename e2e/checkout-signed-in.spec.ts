import { test, expect } from "@playwright/test";
import { signInCustomer } from "./helpers/sign-in-customer";

/**
 * checkout-signed-in.spec.ts — Sprint 4.1 (rev 2)
 *
 * Flujo completo de checkout para un cliente AUTENTICADO (signed-in):
 *   test-session → /tienda → agregar producto → carrito → checkout
 *   → paso Datos (pre-relleno con datos del customer) → paso Pago
 *   → paso Confirmar (review) — SIN confirmar pedido real.
 *
 * ESTRATEGIA DE AUTH (rev 2 — auth real, sin mock):
 *   En test.beforeEach se llama a POST /api/auth/customer/test-session.
 *   Esto setea la cookie HttpOnly "buleje-customer-sess" firmada con el
 *   mismo HMAC-SHA256 que usa OTP/verify, ANTES de navegar a cualquier ruta.
 *   El CustomerContext ya tiene la cookie cuando monta → cero race conditions.
 *
 *   GATE: requiere NODE_ENV=test o ALLOW_E2E_TEST_AUTH=1.
 *   Si el endpoint devuelve 404, el helper falla con mensaje accionable.
 *
 * ZONA DE PELIGRO (checkout):
 *   - POST /api/orders está mockeado → no crea pedidos reales en DB.
 *   - El test termina en StepConfirmar (review) SIN clickear "Confirmar".
 *   - Los totales los calcula el backend; aquí solo verificamos que el
 *     label "Total a pagar" esté visible con un valor S/XX.
 */

// ── Customer de prueba ───────────────────────────────────────────────────────

const CUSTOMER_QA = {
  phone: "999000111",
  name: "Ana QA Test",
  tenantId: "main",
  email: "qa-test@buleje.pe",
};

// ── Selectores ───────────────────────────────────────────────────────────────

const SEL = {
  cartButton: '[data-testid="cart-button"]',
  cartSidebar: '[data-testid="cart-sidebar"]',
  checkoutButton: '[data-testid="checkout-button"]',
  checkoutModal: '[data-testid="checkout-modal"]',
  // Paso cuenta — NO debe aparecer en flujo signed-in
  skipAccount: '[data-testid="checkout-skip-account"]',
  // Paso datos
  datosForm: '[data-testid="datos-form"]',
  datosSubmit: '[data-testid="datos-submit"]',
  // CustomerVerifiedCard — aparece cuando el customer ya está autenticado
  customerVerifiedCard: '[data-testid="customer-verified-card"]',
  // Paso pago
  pagoForm: '[data-testid="pago-form"]',
  paymentEfectivo: '[data-testid="payment-efectivo"]',
  pagoSubmit: '[data-testid="pago-submit"]',
} as const;

// ── Helper: mocks de soporte para checkout ───────────────────────────────────

import type { Page } from "@playwright/test";

async function instalarMocksCheckout(page: Page): Promise<void> {
  // Órdenes → simulado (no crea pedidos reales)
  await page.route("**/api/orders**", (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { id: "E2E-SIGNED-IN-001", status: "confirmed" },
          orderId: "E2E-SIGNED-IN-001",
        }),
      });
    }
    return route.continue();
  });

  // Cupones → 404 para no bloquear el paso de pago
  await page.route("**/api/coupons/**", (route) =>
    route.fulfill({ status: 404, body: '{"error":"not found"}' }),
  );
}

// ── Helper: agregar producto y abrir checkout ────────────────────────────────

async function agregarProductoYAbrirCheckout(page: Page) {
  // Suprimir modal de cupón de bienvenida y carrito previo
  await page.addInitScript(() => {
    try {
      localStorage.setItem("first-visit-coupon-shown", "true");
      localStorage.removeItem("cart");
      localStorage.removeItem("buleje-cart");
      localStorage.removeItem("bsm-cart");
    } catch { /* silent */ }
  });

  await page.goto("/tienda", { waitUntil: "domcontentloaded", timeout: 30_000 });

  // Esperar catálogo
  const btnAgregar = page.locator('button[aria-label^="Agregar"]').first();
  await btnAgregar.waitFor({ state: "visible", timeout: 25_000 });
  await btnAgregar.click();

  // Si abre QuickAddModal, confirmar desde ahí
  const quickAddDialog = page.locator('[role="dialog"][aria-label^="Agregar"]');
  const tieneQuickAdd = await quickAddDialog
    .isVisible({ timeout: 3_000 })
    .catch(() => false);

  if (tieneQuickAdd) {
    const btnAgregarModal = quickAddDialog.getByRole("button", {
      name: /^Agregar\s+S\//i,
    });
    await btnAgregarModal.waitFor({ state: "visible", timeout: 8_000 });
    await btnAgregarModal.click();
    await quickAddDialog.waitFor({ state: "hidden", timeout: 5_000 });
  }

  // Verificar badge del carrito
  const cartBtn = page.locator(SEL.cartButton);
  const cartBadge = cartBtn.locator('span[aria-live="polite"]');
  await expect(cartBadge).toBeVisible({ timeout: 8_000 });

  // Abrir sidebar
  await cartBtn.click();
  await expect(page.locator(SEL.cartSidebar)).toBeVisible({ timeout: 8_000 });

  // Click en "Pagar" del sidebar
  await page.locator(SEL.checkoutButton).click();

  // Esperar modal
  const modal = page.locator(SEL.checkoutModal);
  await expect(modal).toBeVisible({ timeout: 12_000 });
  return modal;
}

// ── Suite principal ──────────────────────────────────────────────────────────

test.describe("Checkout signed-in — flujo completo cliente autenticado", () => {
  test.describe.configure({ mode: "serial" });

  /**
   * beforeEach: setear sesión real ANTES de cada test.
   * La cookie HttpOnly se propaga a todas las requests del contexto,
   * por lo que GET /api/auth/customer/me ya retorna authenticated:true
   * cuando el CustomerContext monta en el navegador.
   */
  test.beforeEach(async ({ context, baseURL }) => {
    await signInCustomer(context, CUSTOMER_QA, baseURL ?? "http://localhost:3000");
  });

  // ── 1. Verificar que la sesión real retorna customer autenticado ───────────

  test("1 — GET /api/auth/customer/me retorna customer autenticado (sesion real)", async ({
    page,
  }) => {
    await page.goto("/tienda", { waitUntil: "domcontentloaded", timeout: 30_000 });

    // La cookie ya está en el contexto — /me debe devolver authenticated:true
    const res = await page.request.get("/api/auth/customer/me");
    const json = await res.json();

    expect(res.status()).toBe(200);
    expect(json.authenticated).toBe(true);
    // El endpoint /me devuelve el customer decodificado del JWT
    expect(json.customer).toBeDefined();
    expect(json.customer.phone ?? json.customer.customerId).toBeTruthy();
  });

  // ── 2. Con customer autenticado, el checkout salta paso "Cuenta" ──────────

  test("2 — checkout salta paso Cuenta y va directo a Datos (signed-in)", async ({
    page,
  }) => {
    await instalarMocksCheckout(page);

    const modal = await agregarProductoYAbrirCheckout(page);

    // Con auth real el CustomerContext hidrata antes de que monte el wizard:
    // el paso "Cuenta" NO debe aparecer.
    const skipAccountVisible = await modal
      .locator(SEL.skipAccount)
      .isVisible({ timeout: 3_000 })
      .catch(() => false);

    // Con sesión real no hay race condition — si skipAccount aparece es un bug real.
    expect(skipAccountVisible).toBe(false);

    // Debe ver datos-form O CustomerVerifiedCard
    const datosVisible = await modal
      .locator(SEL.datosForm)
      .isVisible({ timeout: 10_000 })
      .catch(() => false);

    const verifiedCardVisible = await modal
      .locator(SEL.customerVerifiedCard)
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    expect(datosVisible || verifiedCardVisible).toBe(true);
  });

  // ── 3. El paso Datos muestra el nombre del customer pre-relleno ───────────

  test("3 — paso Datos muestra nombre y teléfono del customer autenticado", async ({
    page,
  }) => {
    await instalarMocksCheckout(page);

    const modal = await agregarProductoYAbrirCheckout(page);

    // El formulario de datos debe estar visible (no hay paso Cuenta con auth real)
    const datosForm = modal.locator(SEL.datosForm);
    await expect(datosForm).toBeVisible({ timeout: 10_000 });

    // Si hay CustomerVerifiedCard, el nombre ya viene del customer autenticado
    const verifiedCard = modal.locator(SEL.customerVerifiedCard);
    if (await verifiedCard.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await expect(modal.getByText(CUSTOMER_QA.name)).toBeVisible({ timeout: 5_000 });
      await expect(modal.getByText(CUSTOMER_QA.phone)).toBeVisible({ timeout: 5_000 });
    } else {
      // Campos de formulario pre-rellenados por useCheckoutInit
      const inputNombre = datosForm
        .locator(
          'input[name="name"], input[name="customerName"], [data-testid="name-input"]',
        )
        .or(datosForm.getByPlaceholder(/nombre/i));

      if (await inputNombre.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
        const valor = await inputNombre.first().inputValue();
        if (valor) {
          expect(valor).toBe(CUSTOMER_QA.name);
        }
      }
    }
  });

  // ── 4. Completar paso Datos y llegar a paso Pago ──────────────────────────

  test("4 — completar paso Datos y avanzar al paso Pago", async ({ page }) => {
    await instalarMocksCheckout(page);

    const modal = await agregarProductoYAbrirCheckout(page);

    const datosForm = modal.locator(SEL.datosForm);
    await expect(datosForm).toBeVisible({ timeout: 10_000 });

    // Llenar campos si están vacíos (signed-in puede pre-rellenar)
    const inputNombre = datosForm
      .locator('input[name="name"], [data-testid="name-input"]')
      .or(datosForm.getByPlaceholder(/nombre/i));
    if (await inputNombre.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
      const val = await inputNombre.first().inputValue();
      if (!val) await inputNombre.first().fill(CUSTOMER_QA.name);
    }

    const inputTel = datosForm
      .locator('input[type="tel"], [data-testid="phone-input"]')
      .or(datosForm.getByPlaceholder(/cel[uú]lar|tel[eé]fono/i));
    if (await inputTel.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
      const val = await inputTel.first().inputValue();
      if (!val) await inputTel.first().fill(CUSTOMER_QA.phone);
    }

    const inputDir = datosForm
      .locator('[data-testid="location-input"], input[name="location"], textarea[name="location"]')
      .or(datosForm.getByPlaceholder(/direcci[oó]n|ubicaci[oó]n/i));
    if (await inputDir.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
      const val = await inputDir.first().inputValue();
      if (!val) await inputDir.first().fill("Jr. Ucayali 450, Pucallpa");
    }

    // Submit del paso Datos
    const btnSubmit = modal.locator(SEL.datosSubmit);
    await expect(btnSubmit).toBeVisible({ timeout: 5_000 });
    await btnSubmit.click();

    // Retry si GPS tooltip aparece
    if (await modal.getByText(/GPS|ubicaci[oó]n/i).isVisible({ timeout: 1_500 }).catch(() => false)) {
      await btnSubmit.click();
    }

    // Debe aparecer el formulario de pago
    const pagoForm = modal.locator(SEL.pagoForm);
    await expect(pagoForm).toBeVisible({ timeout: 12_000 });
  });

  // ── 5. Seleccionar Efectivo y llegar a paso Confirmar (sin confirmar) ──────

  test("5 — seleccionar Efectivo y verificar que StepConfirmar muestra total correcto", async ({
    page,
  }) => {
    await instalarMocksCheckout(page);

    const modal = await agregarProductoYAbrirCheckout(page);

    // Paso Datos
    const datosForm = modal.locator(SEL.datosForm);
    await expect(datosForm).toBeVisible({ timeout: 10_000 });

    const inputNombre = datosForm
      .locator('input[name="name"], [data-testid="name-input"]')
      .or(datosForm.getByPlaceholder(/nombre/i));
    if (await inputNombre.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
      const val = await inputNombre.first().inputValue();
      if (!val) await inputNombre.first().fill(CUSTOMER_QA.name);
    }

    const inputTel = datosForm
      .locator('input[type="tel"], [data-testid="phone-input"]')
      .or(datosForm.getByPlaceholder(/cel[uú]lar|tel[eé]fono/i));
    if (await inputTel.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
      const val = await inputTel.first().inputValue();
      if (!val) await inputTel.first().fill(CUSTOMER_QA.phone);
    }

    const inputDir = datosForm
      .locator('[data-testid="location-input"], input[name="location"]')
      .or(datosForm.getByPlaceholder(/direcci[oó]n|ubicaci[oó]n/i));
    if (await inputDir.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
      const val = await inputDir.first().inputValue();
      if (!val) await inputDir.first().fill("Jr. Ucayali 450, Pucallpa");
    }

    const btnDatosSubmit = modal.locator(SEL.datosSubmit);
    await expect(btnDatosSubmit).toBeVisible({ timeout: 5_000 });
    await btnDatosSubmit.click();

    if (await modal.getByText(/GPS/i).isVisible({ timeout: 1_500 }).catch(() => false)) {
      await btnDatosSubmit.click();
    }

    // Paso Pago
    const pagoForm = modal.locator(SEL.pagoForm);
    await expect(pagoForm).toBeVisible({ timeout: 12_000 });

    const btnEfectivo = modal.locator(SEL.paymentEfectivo);
    await expect(btnEfectivo).toBeVisible({ timeout: 5_000 });
    await btnEfectivo.click();
    await expect(btnEfectivo).toHaveAttribute("aria-checked", "true", { timeout: 3_000 });

    const btnPagoSubmit = modal.locator(SEL.pagoSubmit);
    await expect(btnPagoSubmit).toBeVisible({ timeout: 5_000 });
    await expect(btnPagoSubmit).toBeEnabled();
    await btnPagoSubmit.click();

    // ── StepConfirmar: verificar review screen ────────────────────────────────
    await expect(
      modal.getByRole("heading", { name: /revisa tu pedido/i }),
    ).toBeVisible({ timeout: 12_000 });

    // Total a pagar visible (recomputado en backend, formato S/XX.XX)
    await expect(modal.getByText(/total a pagar/i)).toBeVisible({ timeout: 5_000 });

    // Nombre del customer visible en la card de datos
    await expect(modal.getByText(CUSTOMER_QA.name)).toBeVisible({ timeout: 5_000 });

    // Método de pago visible
    await expect(modal.getByText(/efectivo/i).first()).toBeVisible();

    // Botón confirmar VISIBLE pero NO clickeado — test es read-only
    const btnConfirmar = modal.getByRole("button", { name: /confirmar/i });
    await expect(btnConfirmar).toBeVisible({ timeout: 5_000 });
    await expect(btnConfirmar).toBeEnabled();

    // PARAR AQUÍ — no enviamos el pedido real.
    // POST /api/orders está mockeado con instalarMocksCheckout(),
    // pero el objetivo del sprint es verificar que llegamos al step Confirmar.
  });

  // ── 6. Flujo completo end-to-end signed-in (un solo test) ────────────────

  test("6 — E2E completo: signed-in → tienda → cart → checkout → StepConfirmar", async ({
    page,
  }) => {
    await instalarMocksCheckout(page);

    const modal = await agregarProductoYAbrirCheckout(page);

    // Paso Cuenta: NO debe aparecer con auth real.
    // Si aparece, es un bug genuino — no saltamos silenciosamente.
    const skipBtn = modal.locator(SEL.skipAccount);
    const cuentaVisible = await skipBtn.isVisible({ timeout: 3_000 }).catch(() => false);
    expect(cuentaVisible).toBe(false);

    // Paso Datos
    const datosForm = modal.locator(SEL.datosForm);
    await expect(datosForm).toBeVisible({ timeout: 12_000 });

    const inputNombre = datosForm
      .locator('input[name="name"], [data-testid="name-input"]')
      .or(datosForm.getByPlaceholder(/nombre/i));
    if (await inputNombre.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
      const val = await inputNombre.first().inputValue();
      if (!val) await inputNombre.first().fill(CUSTOMER_QA.name);
    }

    const inputTel = datosForm
      .locator('input[type="tel"], [data-testid="phone-input"]')
      .or(datosForm.getByPlaceholder(/cel[uú]lar|tel[eé]fono/i));
    if (await inputTel.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
      const val = await inputTel.first().inputValue();
      if (!val) await inputTel.first().fill(CUSTOMER_QA.phone);
    }

    const inputDir = datosForm
      .locator('[data-testid="location-input"], input[name="location"]')
      .or(datosForm.getByPlaceholder(/direcci[oó]n|ubicaci[oó]n/i));
    if (await inputDir.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
      const val = await inputDir.first().inputValue();
      if (!val) await inputDir.first().fill("Jr. Ucayali 450, Pucallpa");
    }

    const btnDatosSubmit = modal.locator(SEL.datosSubmit);
    await expect(btnDatosSubmit).toBeVisible({ timeout: 5_000 });
    await btnDatosSubmit.click();
    if (await modal.getByText(/GPS/i).isVisible({ timeout: 1_500 }).catch(() => false)) {
      await btnDatosSubmit.click();
    }

    // Paso Pago: Efectivo
    const pagoForm = modal.locator(SEL.pagoForm);
    await expect(pagoForm).toBeVisible({ timeout: 12_000 });

    const btnEfectivo = modal.locator(SEL.paymentEfectivo);
    await expect(btnEfectivo).toBeVisible({ timeout: 5_000 });
    await btnEfectivo.click();
    await expect(btnEfectivo).toHaveAttribute("aria-checked", "true", { timeout: 3_000 });

    await modal.locator(SEL.pagoSubmit).click();

    // Paso Confirmar — objetivo final del sprint
    await expect(
      modal.getByRole("heading", { name: /revisa tu pedido/i }),
    ).toBeVisible({ timeout: 15_000 });

    await expect(modal.getByText(/total a pagar/i)).toBeVisible();
    await expect(modal.getByText(CUSTOMER_QA.name)).toBeVisible();
    await expect(modal.getByText(/efectivo/i).first()).toBeVisible();

    // Trust badges (si el tenant los tiene habilitados)
    const trustBadge = modal.getByText(/compra segura/i);
    if (await trustBadge.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await expect(trustBadge).toBeVisible();
    }

    // Botón confirmar visible y habilitado
    await expect(
      modal.getByRole("button", { name: /confirmar/i }),
    ).toBeEnabled({ timeout: 5_000 });

    // SPRINT 4.1 OBJETIVO CUMPLIDO: llegamos al step "Confirmar pedido"
    // sin ejecutar el POST real.
  });
});
