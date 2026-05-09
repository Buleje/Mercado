import { test, expect, type Page } from "@playwright/test";

/**
 * checkout-full-flow.spec.ts
 *
 * Flujo completo de compra: desde la tienda pública hasta confirmación.
 *
 * Ruta de entrada: la tienda raíz (`/tienda`) que monta el Header global con
 * `data-testid="cart-button"` y el CheckoutModal con `data-testid="checkout-modal"`.
 *
 * NOTA: `/t/[slug]/tienda` (TenantCatalog standalone) usa un carrito local
 * independiente que redirige a `/t/[slug]/tienda/carrito` (sin CheckoutModal).
 * El CheckoutModal con wizard de pasos vive en el layout `(store)` →
 * `StoreClientShell`, accesible desde `/tienda`.
 *
 * Steps del wizard:
 *   0 — Cuenta    (CheckoutAccountStep) → saltar con checkout-skip-account
 *   1 — Datos     (StepDatos)            → datos-form / datos-submit
 *   2 — Pago      (StepPago)             → pago-form / payment-efectivo / pago-submit
 *   3 — Confirmar (StepConfirmar)        → Confirmar · S/XX.XX
 *   4 — Éxito     (CheckoutSuccessStep)  → "¡Pedido confirmado!"
 *
 * La API de órdenes se mockea para evitar pedidos basura en la DB de desarrollo.
 * La API de clientes devuelve lista vacía para garantizar flujo de invitado.
 */

// ── Selectores constantes ────────────────────────────────────────────────────

const SEL = {
  cartButton: '[data-testid="cart-button"]',
  cartSidebar: '[data-testid="cart-sidebar"]',
  checkoutButton: '[data-testid="checkout-button"]',
  checkoutModal: '[data-testid="checkout-modal"]',
  skipAccount: '[data-testid="checkout-skip-account"]',
  datosForm: '[data-testid="datos-form"]',
  nameInput: '[data-testid="name-input"]',
  phoneInput: '[data-testid="phone-input"]',
  locationInput: '[data-testid="location-input"]',
  datosSubmit: '[data-testid="datos-submit"]',
  pagoForm: '[data-testid="pago-form"]',
  paymentEfectivo: '[data-testid="payment-efectivo"]',
  pagoSubmit: '[data-testid="pago-submit"]',
} as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Navega a la tienda, agrega el primer producto visible y abre el CartSidebar.
 *
 * Flujo real: click en tarjeta de producto → abre QuickAddModal (role="dialog"
 * aria-label="Agregar …") → click en "Agregar S/X.XX" → modal cierra → badge.
 *
 * NOTA: supprimimos FirstVisitCouponModal (STORAGE_KEY "first-visit-coupon-shown")
 * vía localStorage ANTES de navegar; de lo contrario ese dialog intercepta el
 * locator `[role="dialog"]` ya que aparece a los 5 s de cargar /tienda.
 */
async function agregarProductoYAbrirSidebar(page: Page): Promise<void> {
  // Suprimir modal de cupón de bienvenida y limpiar carrito previo
  await page.addInitScript(() => {
    try {
      localStorage.setItem("first-visit-coupon-shown", "true");
      localStorage.removeItem("cart");
      localStorage.removeItem("buleje-cart");
    } catch { /* silent */ }
  });

  await page.goto("/tienda", { waitUntil: "domcontentloaded", timeout: 30_000 });

  // Paso 1: click en el botón "Agregar al carrito" de la primera tarjeta.
  // En /tienda este botón abre el QuickAddModal (UX intencional via QuickAddProvider).
  const btnTarjeta = page
    .locator('button[aria-label^="Agregar"]')
    .first();
  await btnTarjeta.waitFor({ state: "visible", timeout: 20_000 });
  await btnTarjeta.click();

  // Paso 2: esperar el QuickAddModal.
  // Selector discriminador: aria-label empieza con "Agregar " (producto) — no el
  // FirstVisitCouponModal (aria-labelledby="welcome-coupon-title", sin aria-label).
  const quickAddDialog = page.locator('[role="dialog"][aria-label^="Agregar"]');
  await quickAddDialog.waitFor({ state: "visible", timeout: 10_000 });

  // Paso 3: click en el CTA principal — texto dinámico "Agregar S/X.XX"
  // No tiene data-testid; localizamos por rol + regex de precio.
  const btnAgregarModal = quickAddDialog.getByRole("button", {
    name: /^Agregar\s+S\//i,
  });
  await btnAgregarModal.waitFor({ state: "visible", timeout: 8_000 });
  await btnAgregarModal.click();

  // Paso 4: esperar a que el modal cierre (setTimeout 350 ms en handleAdd)
  await quickAddDialog.waitFor({ state: "hidden", timeout: 5_000 });

  // Paso 5: verificar badge del carrito (span[aria-live="polite"] dentro de cart-button)
  const cartBtn = page.locator(SEL.cartButton);
  const cartBadge = cartBtn.locator('span[aria-live="polite"]');
  await expect(cartBadge).toBeVisible({ timeout: 8_000 });

  // Paso 6: abrir el sidebar
  await cartBtn.click();
  await expect(page.locator(SEL.cartSidebar)).toBeVisible({ timeout: 8_000 });
}

/**
 * Abre el CartSidebar → hace click en checkout-button → espera el modal.
 * Retorna el locator del modal para encadenar assertions.
 */
async function abrirCheckoutModal(page: Page) {
  const sidebar = page.locator(SEL.cartSidebar);
  if (!(await sidebar.isVisible().catch(() => false))) {
    await page.locator(SEL.cartButton).click();
    await expect(sidebar).toBeVisible({ timeout: 8_000 });
  }
  await page.locator(SEL.checkoutButton).click();
  const modal = page.locator(SEL.checkoutModal);
  await expect(modal).toBeVisible({ timeout: 10_000 });
  return modal;
}

/** Si el paso "Cuenta" está presente, lo salta usando checkout-skip-account. */
async function saltarPasoCuenta(modal: ReturnType<Page["locator"]>): Promise<void> {
  const skipBtn = modal.locator(SEL.skipAccount);
  const visible = await skipBtn.isVisible({ timeout: 5_000 }).catch(() => false);
  if (visible) {
    await skipBtn.click();
  }
}

/** Llena el formulario de datos del cliente (StepDatos) y avanza. */
async function completarStepDatos(
  modal: ReturnType<Page["locator"]>,
  opts: { nombre: string; telefono: string; direccion: string },
): Promise<void> {
  const datosForm = modal.locator(SEL.datosForm);
  await expect(datosForm).toBeVisible({ timeout: 10_000 });

  // Nombre — data-testid="name-input"  fallback placeholder
  const inputNombre = modal
    .locator(SEL.nameInput)
    .or(datosForm.getByPlaceholder(/nombre/i));
  await inputNombre.first().fill(opts.nombre);

  // Teléfono — data-testid="phone-input"  fallback type=tel
  const inputTel = modal
    .locator(SEL.phoneInput)
    .or(datosForm.locator('input[type="tel"]'));
  await inputTel.first().fill(opts.telefono);

  // Dirección — data-testid="location-input"  fallback placeholder
  const inputDir = modal
    .locator(SEL.locationInput)
    .or(datosForm.getByPlaceholder(/direcci[oó]n|ubicaci[oó]n/i));
  if (await inputDir.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
    await inputDir.first().fill(opts.direccion);
  }

  // Submit — puede quedar bloqueado si hay validación de GPS; reintentamos una vez
  const btnSubmit = modal.locator(SEL.datosSubmit);
  await expect(btnSubmit).toBeVisible({ timeout: 5_000 });
  await btnSubmit.click();

  // Si hay tooltip de GPS, reintentamos el click
  const tipGps = modal.getByText(/GPS|ubicaci[oó]n/i);
  if (await tipGps.isVisible({ timeout: 1_500 }).catch(() => false)) {
    await btnSubmit.click();
  }
}

// ── Mocks de API ─────────────────────────────────────────────────────────────

const ORDER_MOCK_ID = "E2E-FULL-001";

async function instalarMocks(page: Page): Promise<void> {
  // POST /api/orders → éxito simulado
  await page.route("**/api/orders**", (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { id: ORDER_MOCK_ID, status: "confirmed" },
          orderId: ORDER_MOCK_ID,
        }),
      });
    }
    return route.continue();
  });

  // GET /api/customers → lista vacía (flujo invitado)
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

  // GET /api/coupons → 404 para no bloquear el paso de pago
  await page.route("**/api/coupons/**", (route) =>
    route.fulfill({ status: 404, body: '{"error":"not found"}' }),
  );
}

// ── Suite principal ──────────────────────────────────────────────────────────

test.describe("Checkout completo — tienda → confirmación", () => {
  test.describe.configure({ mode: "serial" });

  // ── Step 1: el modal se abre y muestra el paso de cuenta ─────────────────

  test("1 — abrir modal de checkout desde el carrito", async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.removeItem("cart");
        localStorage.removeItem("buleje-cart");
      } catch { /* silent */ }
    });

    await agregarProductoYAbrirSidebar(page);
    const modal = await abrirCheckoutModal(page);

    // El paso de cuenta (phone input o botón saltar) debe estar visible
    const contenidoCuenta = modal
      .locator('input[type="tel"]')
      .or(modal.locator(SEL.skipAccount))
      .or(modal.getByText(/ya tienes cuenta|continuar como invitado/i));
    await expect(contenidoCuenta.first()).toBeVisible({ timeout: 8_000 });
  });

  // ── Step 2: ingresar teléfono en Step Cuenta y avanzar ───────────────────

  test("2 — Step Cuenta: ingresar teléfono 987654321 y avanzar", async ({ page }) => {
    await agregarProductoYAbrirSidebar(page);
    const modal = await abrirCheckoutModal(page);

    // Si hay input de teléfono en el paso cuenta, llenarlo
    const inputTelCuenta = modal.locator('input[type="tel"]').first();
    const tieneTelCuenta = await inputTelCuenta.isVisible({ timeout: 3_000 }).catch(() => false);

    if (tieneTelCuenta) {
      await inputTelCuenta.fill("987654321");
      // Botón siguiente/continuar del paso cuenta
      const btnSiguiente = modal
        .getByRole("button", { name: /siguiente|continuar|buscar|verificar/i })
        .first();
      if (await btnSiguiente.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await btnSiguiente.click();
      }
    } else {
      // El paso cuenta solo tiene botón "Continuar como invitado" / skip
      await saltarPasoCuenta(modal);
    }

    // Después de avanzar del paso cuenta debe verse datos-form O skip-account
    const siguienteVista = modal
      .locator(SEL.datosForm)
      .or(modal.locator(SEL.skipAccount))
      .or(modal.getByText(/tu información|tus datos|nombre/i));
    await expect(siguienteVista.first()).toBeVisible({ timeout: 8_000 });
  });

  // ── Step 3: Step Datos con nombre + dirección ────────────────────────────

  test("3 — Step Datos: ingresar nombre y dirección, avanzar al pago", async ({ page }) => {
    await agregarProductoYAbrirSidebar(page);
    const modal = await abrirCheckoutModal(page);
    await saltarPasoCuenta(modal);

    await completarStepDatos(modal, {
      nombre: "Test User",
      telefono: "987654321",
      direccion: "Av. Test 123",
    });

    // Debe aparecer el formulario de pago
    const pagoForm = modal.locator(SEL.pagoForm);
    await expect(pagoForm).toBeVisible({ timeout: 10_000 });
  });

  // ── Step 4: Step Pago con método Efectivo ───────────────────────────────

  test("4 — Step Pago: seleccionar Efectivo y avanzar a Confirmar", async ({ page }) => {
    await agregarProductoYAbrirSidebar(page);
    const modal = await abrirCheckoutModal(page);
    await saltarPasoCuenta(modal);
    await completarStepDatos(modal, {
      nombre: "Test User",
      telefono: "987654321",
      direccion: "Av. Test 123",
    });

    // Seleccionar Efectivo
    const pagoForm = modal.locator(SEL.pagoForm);
    await expect(pagoForm).toBeVisible({ timeout: 10_000 });

    const btnEfectivo = modal.locator(SEL.paymentEfectivo);
    await expect(btnEfectivo).toBeVisible({ timeout: 5_000 });
    await btnEfectivo.click();
    await expect(btnEfectivo).toHaveAttribute("aria-checked", "true", { timeout: 3_000 });

    // Avanzar con pago-submit
    const btnPagoSubmit = modal.locator(SEL.pagoSubmit);
    await expect(btnPagoSubmit).toBeVisible({ timeout: 5_000 });
    await expect(btnPagoSubmit).toBeEnabled();
    await btnPagoSubmit.click();

    // Debe aparecer la pantalla de revisión (StepConfirmar)
    await expect(
      modal.getByRole("heading", { name: /revisa tu pedido/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  // ── Step 5: Step Confirmar → pantalla de éxito con número de orden ───────

  test("5 — Step Confirmar: confirmar pedido y ver pantalla de éxito", async ({ page }) => {
    await instalarMocks(page);
    await agregarProductoYAbrirSidebar(page);
    const modal = await abrirCheckoutModal(page);
    await saltarPasoCuenta(modal);
    await completarStepDatos(modal, {
      nombre: "Test User",
      telefono: "987654321",
      direccion: "Av. Test 123",
    });

    // Pago: seleccionar Efectivo y avanzar
    const pagoForm = modal.locator(SEL.pagoForm);
    await expect(pagoForm).toBeVisible({ timeout: 10_000 });
    const btnEfectivo = modal.locator(SEL.paymentEfectivo);
    await expect(btnEfectivo).toBeVisible({ timeout: 5_000 });
    await btnEfectivo.click();
    await expect(btnEfectivo).toHaveAttribute("aria-checked", "true", { timeout: 3_000 });

    const btnPagoSubmit = modal.locator(SEL.pagoSubmit);
    await expect(btnPagoSubmit).toBeVisible({ timeout: 5_000 });
    await btnPagoSubmit.click();

    // Confirmar: esperar heading de revisión
    const headingRevisa = modal.getByRole("heading", { name: /revisa tu pedido/i });
    await expect(headingRevisa).toBeVisible({ timeout: 10_000 });

    // Verificar que los datos del cliente aparecen en el resumen
    await expect(modal.getByText("Test User")).toBeVisible({ timeout: 5_000 });
    await expect(modal.getByText(/efectivo/i).first()).toBeVisible();

    // Click en "Confirmar · S/XX.XX"
    const btnConfirmar = modal.getByRole("button", { name: /confirmar/i });
    await expect(btnConfirmar).toBeVisible({ timeout: 5_000 });
    await expect(btnConfirmar).toBeEnabled();
    await btnConfirmar.click();

    // Pantalla de éxito: "¡Pedido confirmado!" + número de orden
    const mensajeExito = page
      .getByText(/pedido confirmado/i)
      .or(page.getByText(ORDER_MOCK_ID))
      .or(modal.getByText(/pedido confirmado/i));
    await expect(mensajeExito.first()).toBeVisible({ timeout: 15_000 });
  });

  // ── Step 6: flujo completo end-to-end en un solo test ────────────────────

  test("6 — flujo completo de punta a punta: tienda → carrito → checkout → éxito", async ({
    page,
  }) => {
    // Instalar mocks antes de navegar
    await instalarMocks(page);

    // Limpiar carrito previo
    await page.addInitScript(() => {
      try {
        localStorage.removeItem("cart");
        localStorage.removeItem("buleje-cart");
      } catch { /* silent */ }
    });

    // Paso 0: agregar producto y abrir sidebar
    await agregarProductoYAbrirSidebar(page);

    // Paso 1: abrir modal de checkout
    const modal = await abrirCheckoutModal(page);

    // Paso 2 (Cuenta): saltar
    await saltarPasoCuenta(modal);

    // Paso 3 (Datos): nombre + teléfono + dirección
    await completarStepDatos(modal, {
      nombre: "Test User",
      telefono: "987654321",
      direccion: "Av. Test 123",
    });

    // Paso 4 (Pago): seleccionar Efectivo
    const pagoForm = modal.locator(SEL.pagoForm);
    await expect(pagoForm).toBeVisible({ timeout: 10_000 });
    const btnEfectivo = modal.locator(SEL.paymentEfectivo);
    await expect(btnEfectivo).toBeVisible({ timeout: 5_000 });
    await btnEfectivo.click();
    await expect(btnEfectivo).toHaveAttribute("aria-checked", "true", { timeout: 3_000 });

    // Avanzar al step Confirmar
    const btnPagoSubmit = modal.locator(SEL.pagoSubmit);
    await expect(btnPagoSubmit).toBeVisible({ timeout: 5_000 });
    await btnPagoSubmit.click();

    // Paso 5 (Confirmar): verificar resumen
    await expect(
      modal.getByRole("heading", { name: /revisa tu pedido/i }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(modal.getByText("Test User")).toBeVisible();
    await expect(modal.getByText(/efectivo/i).first()).toBeVisible();
    await expect(modal.getByText(/total a pagar/i)).toBeVisible();

    // Confirmar el pedido
    const btnConfirmar = modal.getByRole("button", { name: /confirmar/i });
    await expect(btnConfirmar).toBeEnabled({ timeout: 5_000 });
    await btnConfirmar.click();

    // Paso 6 (Éxito): pantalla de confirmación con el ID del pedido
    const pantallaExito = page
      .getByText(/pedido confirmado/i)
      .or(modal.getByText(/pedido confirmado/i))
      .or(page.getByText(ORDER_MOCK_ID));
    await expect(pantallaExito.first()).toBeVisible({ timeout: 15_000 });
  });
});
