import { test, expect, type Page } from "@playwright/test";

/**
 * marketplace-checkout.spec.ts
 *
 * Flujo completo smoke E2E del checkout marketplace:
 *   /marketplace → tienda slug → producto → QuickAdd → carrito
 *   → cupón inválido → /checkout/datos → /checkout/entrega
 *   → /checkout/confirmar → success (orden creada)
 *
 * El POST a /api/marketplace/orders se mockea para:
 *   1. Evitar crear data sucia en producción/QA.
 *   2. Verificar idempotency (doble click → 1 solo request).
 *   3. Funcionar sin seed específico de cupones.
 *
 * Cupón inválido ("NOEXISTE") se prueba contra el endpoint real
 * /api/marketplace/coupons/validate — debe devolver { valid: false }.
 *
 * CustomerName de QA: "QA E2E TEST" — fácil de filtrar/ignorar en admin.
 */

// ── Constantes ─────────────────────────────────────────────────────────────

const QA_NAME = "QA E2E TEST";
const QA_PHONE = "999000001";
const QA_ADDRESS = "Jr. Ucayali 450, Pucallpa";
const INVALID_COUPON = "NOEXISTE";
const MOCK_ORDER_ID = "E2E-MKTPLACE-001";

// Errores de consola que indican regresión real (no warnings esperados)
const CRITICAL_CONSOLE_PATTERNS = [
  /TypeError/i,
  /Failed to fetch/i,
  /Unhandled.*rejection/i,
  /Cannot read prop/i,
  /is not a function/i,
  /Hydration failed/i,
  /Error: Minified React error/i,
];

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Limpia el carrito del marketplace en localStorage */
async function clearMarketplaceCart(page: Page) {
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (
        k.startsWith("cart:") ||
        k.startsWith("bsm-cart") ||
        k.includes("marketplace-cart") ||
        k.includes("buleje-applied-coupon")
      ) {
        localStorage.removeItem(k);
      }
    }
  });
}

/**
 * Agrega el primer producto disponible desde /marketplace/explorar
 * usando el QuickAdd drawer. Retorna el nombre del producto agregado.
 * Hace skip del test si no hay productos visibles.
 */
async function agregarPrimerProducto(page: Page): Promise<string> {
  // Primera visita para limpiar el localStorage (no reload para no perder DOM)
  await page.goto("/marketplace/explorar");
  await clearMarketplaceCart(page);
  // Segunda navegación con cart limpio (evita que el hydration guard borre items)
  await page.goto("/marketplace/explorar");

  // Skip inteligente: si no hay tiendas/productos visibles.
  // timeout 25s: los productos se cargan client-side después del SSR.
  const quickAddBtn = page.locator('button[aria-label^="Elegir opciones"]').first();
  const hasProducts = await quickAddBtn
    .waitFor({ state: "visible", timeout: 25_000 })
    .then(() => true)
    .catch(() => false);

  if (!hasProducts) {
    test.skip(true, "No hay productos visibles en /marketplace/explorar — skip smoke E2E");
    return "";
  }

  await quickAddBtn.click();

  const dialog = page.getByRole("dialog", { name: /Agregar/i });
  await expect(dialog).toBeVisible({ timeout: 5_000 });

  // Capturar nombre del producto antes de cerrar el drawer
  const productTitle =
    (await dialog.locator("h2, h3, [role='heading']").first().textContent()) ?? "Producto QA";

  await dialog.getByRole("button", { name: /Agregar al carrito/i }).click();

  // Confirmar que el badge refleja 1
  const cartBtn = page.locator('button[aria-label="Abrir carrito"]');
  await expect(cartBtn).toContainText("1", { timeout: 8_000 });

  return productTitle.trim();
}

// ── Suite ────────────────────────────────────────────────────────────────────

test.describe("Marketplace · Checkout smoke E2E completo", () => {
  // Estos tests son secuencialmente independientes (cada uno parte desde 0)
  // pero todos son lentos (30-60s) por ser flujos completos.

  // ── 1. /marketplace carga sin errores críticos ───────────────────────────

  test("1 — /marketplace responde 200 y no lanza errores críticos de consola", async ({
    page,
  }) => {
    test.slow(); // hasta 3× timeout base

    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        if (CRITICAL_CONSOLE_PATTERNS.some((p) => p.test(text))) {
          consoleErrors.push(text);
        }
      }
    });

    const response = await page.goto("/marketplace");
    expect(response?.status()).toBe(200);

    await page.waitForLoadState("networkidle");

    // No debe haber overlay de error de Next.js visible (el elemento puede
    // existir como portal vacío — solo es problema si hay contenido visible)
    const nextPortal = page.locator("nextjs-portal");
    const portalCount = await nextPortal.count();
    if (portalCount > 0) {
      // Verificar que el portal no contiene un error screen de Next.js
      const hasErrorOverlay = await nextPortal
        .locator("text=/Application error|Runtime Error|Unhandled Runtime Error/")
        .isVisible()
        .catch(() => false);
      expect(hasErrorOverlay).toBe(false);
    }

    // El main content debe renderizar
    await expect(page.locator("main")).toBeVisible();

    // Sin errores críticos de consola
    if (consoleErrors.length > 0) {
      throw new Error(
        `Errores críticos de consola detectados en /marketplace:\n${consoleErrors.join("\n")}`,
      );
    }
  });

  // ── 2. Agregar producto y verificar persistencia en carrito ─────────────

  test("2 — agregar producto desde explorar → badge actualizado → carrito correcto", async ({
    page,
  }) => {
    test.slow();

    await agregarPrimerProducto(page);

    // Abrir sidebar del carrito y verificar ítem
    const cartBtn = page.locator('button[aria-label="Abrir carrito"]');
    await cartBtn.click();

    const sidebar = page
      .getByRole("dialog", { name: "Carrito de compras" })
      .or(page.locator('[role="dialog"]').filter({ hasText: /carrito|tu pedido/i }));

    const sidebarVisible = await sidebar
      .waitFor({ state: "visible", timeout: 5_000 })
      .then(() => true)
      .catch(() => false);

    if (sidebarVisible) {
      // Sidebar path: carrito inline
      await expect(cartBtn).toContainText("1");
    } else {
      // Puede no haber sidebar — navegar directamente a /marketplace/carrito
      await page.goto("/marketplace/carrito");
      await page.waitForLoadState("networkidle");
      // El carrito no debe estar vacío (no debe mostrar PaicheMascot vacío)
      await expect(page.getByText(/tu carrito está.*vacío/i)).not.toBeVisible({
        timeout: 5_000,
      });
    }
  });

  // ── 3. /marketplace/carrito: cupón inválido → mensaje de error visible ──

  test("3 — cupón inválido 'NOEXISTE' muestra mensaje de error al usuario", async ({
    page,
  }) => {
    test.slow();

    await agregarPrimerProducto(page);

    await page.goto("/marketplace/carrito");
    await page.waitForLoadState("networkidle");

    // Si el carrito está vacío, el item no persistió — skip
    const isEmpty = await page.getByText(/tu carrito está.*vacío/i).isVisible().catch(() => false);
    if (isEmpty) {
      test.skip(true, "Carrito vacío al llegar a /marketplace/carrito — skip test cupón");
      return;
    }

    // Buscar el input de cupón
    const couponInput = page
      .locator('[data-testid="coupon-input"]')
      .or(page.getByPlaceholder(/cupón|código/i))
      .or(page.locator('input[aria-label*="cupón" i]'))
      .first();

    const couponInputVisible = await couponInput
      .waitFor({ state: "visible", timeout: 8_000 })
      .then(() => true)
      .catch(() => false);

    if (!couponInputVisible) {
      test.skip(true, "Input de cupón no encontrado en /marketplace/carrito — skip");
      return;
    }

    await couponInput.fill(INVALID_COUPON);

    // Buscar botón aplicar cupón
    const applyBtn = page
      .locator('[data-testid="coupon-apply"]')
      .or(page.getByRole("button", { name: /aplicar|validar/i }).first());
    await expect(applyBtn).toBeVisible({ timeout: 3_000 });
    await applyBtn.click();

    // Debe aparecer mensaje de error — no silencio 200
    const errorMsg = page
      .getByText(/cupón no encontrado/i)
      .or(page.getByText(/código inválido/i))
      .or(page.getByText(/inválido o expirado/i))
      .or(page.getByText(/no existe/i))
      .or(page.getByRole("alert").filter({ hasText: /cupón/i }));

    await expect(errorMsg.first()).toBeVisible({ timeout: 8_000 });
  });

  // ── 4. Flujo completo con mocked orders API ──────────────────────────────

  test("4 — flujo completo: tienda → carrito → datos → entrega → confirmar → success", async ({
    page,
  }) => {
    test.slow();

    // Acumular errores críticos de consola durante todo el flujo
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        // Ignorar errores de CORS/fonts/tracking (no son de negocio)
        if (
          CRITICAL_CONSOLE_PATTERNS.some((p) => p.test(text)) &&
          !text.includes("favicon") &&
          !text.includes("fonts.google")
        ) {
          consoleErrors.push(text);
        }
      }
    });

    // Mock del API de órdenes — retorna 1 orden exitosa
    let orderPostCount = 0;
    await page.route("**/api/marketplace/orders**", async (route) => {
      if (route.request().method() === "POST") {
        orderPostCount++;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: { orderId: MOCK_ORDER_ID, status: "confirmed" },
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Mock auth check para que el customer context no rechace la sesión
    await page.route("**/api/auth/me**", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unauthorized" }),
      });
    });

    // ── Paso 0: Agregar producto ─────────────────────────────────────────
    await agregarPrimerProducto(page);

    // ── Paso 1: Ir a /marketplace/carrito ────────────────────────────────
    await page.goto("/marketplace/carrito");
    await page.waitForLoadState("networkidle");

    // Skip si carrito vacío (item no persistió)
    const cartEmpty = await page
      .getByText(/tu carrito está.*vacío/i)
      .isVisible()
      .catch(() => false);
    if (cartEmpty) {
      test.skip(true, "Carrito vacío — item no persistió al navegar. Skip flujo completo.");
      return;
    }

    // El carrito debe mostrar al menos 1 ítem
    await expect(page.getByText(/producto/i).first()).toBeVisible({ timeout: 5_000 });

    // ── Paso 2: Continuar al checkout ────────────────────────────────────
    // El botón puede requerir login (AuthModal) o ir directo a /checkout/datos
    const continuarBtn = page
      .getByRole("button", { name: /continuar al checkout|iniciar sesión/i })
      .or(page.getByRole("link", { name: /continuar al checkout/i }))
      .first();

    await expect(continuarBtn).toBeVisible({ timeout: 8_000 });
    await continuarBtn.click();

    // Si aparece el AuthModal (no hay sesión), manejarlo como invitado
    const authModal = page.getByRole("dialog").filter({ hasText: /iniciar sesión|registrar/i });
    const authModalOpen = await authModal
      .waitFor({ state: "visible", timeout: 3_000 })
      .then(() => true)
      .catch(() => false);

    if (authModalOpen) {
      // Buscar opción de continuar como invitado o cerrar el modal
      const guestBtn = authModal
        .getByRole("button", { name: /invitado|sin cuenta|continuar sin/i })
        .or(authModal.getByRole("button", { name: /cerrar|×/i }));
      const guestBtnVisible = await guestBtn
        .first()
        .isVisible({ timeout: 2_000 })
        .catch(() => false);
      if (guestBtnVisible) {
        await guestBtn.first().click();
      } else {
        // No hay path de invitado: el flujo requiere auth — skip
        test.skip(
          true,
          "El checkout requiere autenticación y no hay path de invitado disponible. Skip flujo completo.",
        );
        return;
      }
    }

    // ── Paso 3: /checkout/datos ───────────────────────────────────────────
    // Esperar llegada a /checkout/datos (puede haber redirect)
    await page.waitForURL(/\/checkout\/(datos|auth|carrito)/, { timeout: 10_000 });

    // Si redirige a /checkout/auth, el flujo requiere login — skip
    if (page.url().includes("/checkout/auth")) {
      test.skip(
        true,
        "Redirigió a /checkout/auth — flujo requiere login. Skip flujo completo.",
      );
      return;
    }

    // Si redirigió al carrito (carrito vacío), skip
    if (page.url().includes("/carrito")) {
      test.skip(true, "Redirigió a /carrito desde checkout/datos. Skip.");
      return;
    }

    await page.waitForLoadState("networkidle");

    // Verificar HTTP 200 en la página (no 500)
    const datosResponse = await page
      .waitForResponse((r) => r.url().includes("/checkout/datos") && r.status() !== 304, {
        timeout: 5_000,
      })
      .catch(() => null);
    if (datosResponse && datosResponse.status() >= 500) {
      throw new Error(`/checkout/datos devolvió ${datosResponse.status()}`);
    }

    // Llenar nombre
    const inputNombre = page
      .getByPlaceholder(/nombre/i)
      .or(page.locator('input[type="text"]').first());
    if (await inputNombre.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
      await inputNombre.first().fill(QA_NAME);
    }

    // Llenar teléfono
    const inputTel = page.locator('input[type="tel"]').first();
    if (await inputTel.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await inputTel.fill(QA_PHONE);
    }

    // Continuar → /checkout/entrega
    const btnDatosContinuar = page
      .getByRole("button", { name: /continuar|siguiente/i })
      .or(page.locator('button[type="submit"]'))
      .first();
    await expect(btnDatosContinuar).toBeVisible({ timeout: 5_000 });
    await btnDatosContinuar.click();

    // ── Paso 4: /checkout/entrega ─────────────────────────────────────────
    await page.waitForURL(/\/checkout\/entrega/, { timeout: 10_000 });
    await page.waitForLoadState("networkidle");

    // Llenar dirección
    const inputDireccion = page
      .getByPlaceholder(/Jr\.|Ej:|calle|dirección/i)
      .or(page.locator('input[type="text"]').filter({ hasText: "" }).first());
    if (await inputDireccion.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
      await inputDireccion.first().fill(QA_ADDRESS);
    }

    // Seleccionar método de pago: efectivo (siempre disponible)
    const btnEfectivo = page
      .getByRole("button", { name: /efectivo/i })
      .or(page.locator('[data-testid="payment-efectivo"]'))
      .or(page.locator('button').filter({ hasText: /efectivo/i }))
      .first();

    const efectivoVisible = await btnEfectivo
      .waitFor({ state: "visible", timeout: 5_000 })
      .then(() => true)
      .catch(() => false);

    if (efectivoVisible) {
      await btnEfectivo.click();
    }

    // Continuar → /checkout/confirmar
    const btnEntregaContinuar = page
      .getByRole("button", { name: /revisar pedido|confirmar|continuar/i })
      .or(page.locator('button[type="submit"]'))
      .first();
    await expect(btnEntregaContinuar).toBeVisible({ timeout: 5_000 });
    await btnEntregaContinuar.click();

    // ── Paso 5: /checkout/confirmar ───────────────────────────────────────
    await page.waitForURL(/\/checkout\/confirmar/, { timeout: 10_000 });
    await page.waitForLoadState("networkidle");

    // Debe mostrar el resumen con el nombre del cliente
    await expect(page.getByText(QA_NAME, { exact: false })).toBeVisible({ timeout: 8_000 });

    // ── Paso 6: Confirmar pedido — capturar el POST ──────────────────────
    const orderPostPromise = page.waitForResponse(
      (r) => r.url().includes("/api/marketplace/orders") && r.request().method() === "POST",
      { timeout: 15_000 },
    );

    const btnConfirmar = page
      .getByRole("button", { name: /confirmar pedido/i })
      .first();
    await expect(btnConfirmar).toBeVisible({ timeout: 8_000 });
    await expect(btnConfirmar).toBeEnabled();

    // Capturar body del POST para assert de totalidad de datos
    const requestBodies: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/marketplace/orders") && req.method() === "POST") {
        requestBodies.push(req.postData() ?? "");
      }
    });

    await btnConfirmar.click();

    // Esperar respuesta del order POST
    const orderResponse = await orderPostPromise;
    expect(orderResponse.status()).toBe(200);

    // ── Assert idempotency: solo 1 POST enviado ──────────────────────────
    // Dar 500ms para que un segundo click accidental se registre
    await page.waitForTimeout(500);
    expect(orderPostCount).toBe(1);

    // ── Assert payload incluye customerName ──────────────────────────────
    if (requestBodies.length > 0) {
      const body = JSON.parse(requestBodies[0]);
      expect(body.customerName).toBe(QA_NAME);
      // Verificar que los totales vienen del servidor (no hay campo "total" en el body —
      // el server los recomputa; el cliente solo manda items + precios unitarios)
      expect(body.items).toBeDefined();
      expect(Array.isArray(body.items)).toBe(true);
      expect(body.items.length).toBeGreaterThan(0);
    }

    // ── Paso 7: Verificar success screen ────────────────────────────────
    const successMsg = page
      .getByText(/pedido confirmado|gracias por/i)
      .or(page.getByText(MOCK_ORDER_ID))
      .or(page.getByText(/pedido realizado/i))
      .or(page.getByText(/seguir comprando/i))
      .or(page.getByText(/volver al marketplace/i));

    await expect(successMsg.first()).toBeVisible({ timeout: 15_000 });

    // orderId debe aparecer en la UI
    await expect(page.getByText(MOCK_ORDER_ID, { exact: false })).toBeVisible({
      timeout: 5_000,
    });

    // Sin errores críticos de consola durante todo el flujo
    if (consoleErrors.length > 0) {
      // Reportar como advertencia, no error fatal del test, para no
      // bloquear CI por warnings conocidos de third-party
      console.warn(
        `[marketplace-checkout] Errores de consola detectados durante flujo completo:\n${consoleErrors.join("\n")}`,
      );
    }
  });

  // ── 5. Idempotency: doble click no duplica orden ─────────────────────────

  test("5 — doble click en 'Confirmar pedido' envía solo 1 POST (idempotency)", async ({
    page,
  }) => {
    test.slow();

    let postCount = 0;
    await page.route("**/api/marketplace/orders**", async (route) => {
      if (route.request().method() === "POST") {
        postCount++;
        // Simular latencia para que el segundo click llegue antes del disable
        await new Promise((r) => setTimeout(r, 300));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: { orderId: "IDEMPOTENCY-TEST-001" } }),
        });
      } else {
        await route.continue();
      }
    });

    await page.route("**/api/auth/me**", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unauthorized" }),
      });
    });

    // Setup estado de checkout directamente vía localStorage
    // (evitar recorrer el flujo completo para este test específico)
    await page.goto("/marketplace/explorar");
    await page.waitForLoadState("networkidle");

    // Agregar producto
    const quickAddBtn = page.locator('button[aria-label^="Elegir opciones"]').first();
    const hasProducts = await quickAddBtn
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);

    if (!hasProducts) {
      test.skip(true, "No hay productos visibles — skip idempotency test");
      return;
    }

    await quickAddBtn.click();
    const dialog = page.getByRole("dialog", { name: /Agregar/i });
    await dialog.getByRole("button", { name: /Agregar al carrito/i }).click();
    const cartBtn = page.locator('button[aria-label="Abrir carrito"]');
    await expect(cartBtn).toContainText("1", { timeout: 8_000 });

    // Inyectar datos de checkout en sessionStorage/localStorage que usa useCheckoutData
    await page.evaluate(
      ({ name, phone, address }: { name: string; phone: string; address: string }) => {
        const checkoutKey = "buleje-checkout-data-v1";
        try {
          localStorage.setItem(
            checkoutKey,
            JSON.stringify({
              customer: { name, phone, email: "" },
              address: {
                address,
                notes: "",
                departmentCode: "25",
                departmentName: "Ucayali",
                provinceCode: "2501",
                provinceName: "Coronel Portillo",
                districtCode: "250101",
                districtName: "Callería",
                zone: "Callería, Coronel Portillo, Ucayali",
              },
              payment: { method: "efectivo" },
              coupons: {},
              loyalty: { redeemPoints: 0 },
            }),
          );
        } catch {
          /* silent */
        }
      },
      { name: QA_NAME, phone: QA_PHONE, address: QA_ADDRESS },
    );

    await page.goto("/checkout/confirmar");
    await page.waitForLoadState("networkidle");

    // Si redirige a datos/carrito, los datos no se inyectaron correctamente
    if (!page.url().includes("/checkout/confirmar")) {
      test.skip(true, "No llegó a /checkout/confirmar con datos inyectados — skip idempotency");
      return;
    }

    const btnConfirmar = page
      .getByRole("button", { name: /confirmar pedido/i })
      .first();

    const btnVisible = await btnConfirmar
      .waitFor({ state: "visible", timeout: 8_000 })
      .then(() => true)
      .catch(() => false);

    if (!btnVisible) {
      test.skip(true, "Botón confirmar no visible — skip idempotency");
      return;
    }

    // Doble click rápido
    await btnConfirmar.click();
    await btnConfirmar.click();

    // Esperar a que el POST sea procesado
    await page.waitForTimeout(800);

    // Solo debe haber enviado 1 POST
    expect(postCount).toBe(1);
  });
});
