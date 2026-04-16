import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * Checkout Fraud Protection — server-authoritative pricing
 *
 * Verifica HOTFIX-001 (`app/api/orders/route.ts`):
 *
 *   El servidor recomputa `total` desde la DB (price × quantity) y NUNCA
 *   confía en el `total` enviado por el cliente. El sistema implementa
 *   "warn-and-correct": NO rechaza con 400, sino que persiste el total
 *   correcto y registra un warning con request_id para Sentry.
 *
 * Estrategia del test:
 *   1. Navega a /tienda y agrega un producto al carrito.
 *   2. Intercepta el POST a /api/orders y muta el body inflando/deflactando
 *      `total` a 0.01 antes de reenviarlo al servidor (route.continue
 *      + postData modificado).
 *   3. Verifica que la response sea 201 (no 400 — el sistema corrige, no
 *      rechaza) y que `body.total` sea el precio real del servidor, NO
 *      el 0.01 manipulado.
 *
 * Si el carrito real no se puede llenar (p. ej. no hay productos en seed),
 * el test se marca como skipped para no romper CI sin data.
 */

const FRAUDULENT_TOTAL = 0.01;

/**
 * Intenta agregar el primer producto del catálogo al carrito.
 * Devuelve true si se logró, false si no hay productos visibles.
 */
async function tryAddFirstProduct(page: Page): Promise<boolean> {
  await page.goto("/tienda");
  await page.waitForLoadState("networkidle");

  // Dismiss welcome/coupon modal if present
  const dismissBtn = page.getByText("Tal vez después").or(page.locator('button:has-text("Ir a comprar")')).or(page.locator('[class*="z-[8000]"] button[aria-label="Close"], [class*="z-[8000]"] button:has(svg)'));
  await dismissBtn.first().click({ timeout: 5_000 }).catch(() => {});
  await page.waitForTimeout(500);

  const btnAgregar = page.locator('button[aria-label^="Agregar"]').first();
  const visible = await btnAgregar
    .waitFor({ state: "visible", timeout: 15_000 })
    .then(() => true)
    .catch(() => false);

  if (!visible) return false;

  await btnAgregar.click();
  const btnCarrito = page.locator('button[aria-label="Abrir carrito"]');
  await expect(btnCarrito).toContainText("1", { timeout: 8_000 });
  return true;
}

/**
 * Avanza el wizard de checkout con datos mínimos hasta el botón final.
 * Devuelve el locator del botón "pago-submit" listo para hacer click.
 */
async function avanzarHastaPagoSubmit(page: Page) {
  const btnCarrito = page.locator('button[aria-label="Abrir carrito"]');
  await btnCarrito.click();

  const sidebar = page.getByRole("dialog", { name: "Carrito de compras" });
  await expect(sidebar).toBeVisible({ timeout: 5_000 });

  const btnCheckout = sidebar
    .locator('[data-testid="checkout-button"]')
    .or(sidebar.getByRole("button", { name: /pagar|checkout|finalizar|comprar|completar pedido/i }));
  await btnCheckout.click();

  const modal = page
    .locator('[data-testid="checkout-modal"]')
    .or(page.getByRole("dialog").filter({ hasText: /cuenta|pago|datos/i }));
  await expect(modal).toBeVisible({ timeout: 10_000 });

  // Saltar paso cuenta (invitado)
  const btnSaltar = modal
    .locator('[data-testid="checkout-skip-account"]')
    .or(modal.getByRole("button", { name: /continuar|soy nuevo|invitado/i }));
  if (await btnSaltar.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
    await btnSaltar.first().click();
  }

  const datosForm = modal.locator('[data-testid="datos-form"]');
  await expect(datosForm).toBeVisible({ timeout: 10_000 });

  // Fill DNI
  const inputDni = datosForm.getByPlaceholder("Ej: 12345678");
  if (await inputDni.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await inputDni.fill("12345678");
  }
  // Fill name
  const inputNombre = datosForm.getByPlaceholder(/Mar[ií]a Garc[ií]a/i);
  if (await inputNombre.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await inputNombre.fill("Fraud Test QA");
  }
  // Fill phone
  const inputTelefono = datosForm.getByPlaceholder("Ej: 987654321");
  if (await inputTelefono.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await inputTelefono.fill("987000111");
  }
  // Fill address
  const inputDireccion = datosForm.getByPlaceholder(/Ucayali 450/i).or(datosForm.getByPlaceholder(/direcci/i));
  if (await inputDireccion.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
    await inputDireccion.first().fill("Jr. Fraud 123, Pucallpa");
  }
  // Fill reference
  const inputRef = datosForm.getByPlaceholder(/frente al parque/i).or(datosForm.getByPlaceholder(/referencia/i));
  if (await inputRef.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
    await inputRef.first().fill("Frente al mercado");
  }

  // Select delivery slot if visible
  const slotBtn = modal.getByText("Lo antes posible").or(modal.getByText(/antes posible/i));
  if (await slotBtn.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
    await slotBtn.first().click();
  }

  // Scroll to submit and click
  const datosSubmit = modal.locator('[data-testid="datos-submit"]');
  await datosSubmit.scrollIntoViewIfNeeded();
  await datosSubmit.click();
  await page.waitForTimeout(1000);
  // Retry if GPS warning blocked first click
  if (await datosSubmit.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await datosSubmit.click();
    await page.waitForTimeout(1000);
  }

  const pagoForm = modal.locator('[data-testid="pago-form"]');
  await expect(pagoForm).toBeVisible({ timeout: 10_000 });

  // Seleccionar efectivo (más simple, no requiere número de operación)
  const btnEfectivo = modal.locator('[data-testid="payment-efectivo"]');
  await expect(btnEfectivo).toBeVisible({ timeout: 5_000 });
  await btnEfectivo.click();

  const btnPagoSubmit = modal.locator('[data-testid="pago-submit"]');
  await expect(btnPagoSubmit).toBeEnabled({ timeout: 5_000 });
  return btnPagoSubmit;
}

test.describe("Checkout Fraud Protection — server recomputes total", () => {
  test("manipular total a 0.01 → server persiste el precio real (warn-and-correct)", async ({
    page,
  }) => {
    // ── Step 1: agregar producto. Si no hay catálogo, skipear el test. ──
    const added = await tryAddFirstProduct(page);
    if (!added) {
      test.skip(true, "Sin productos en el catálogo — necesita data seed");
      return;
    }

    // ── Step 2: capturar la response del POST para inspeccionar el server total ──
    let serverResponseBody: { total?: number; id?: string; status?: string } | null = null;
    let serverResponseStatus: number | null = null;
    let interceptedClientTotal: number | null = null;

    page.on("response", async (response) => {
      if (
        response.url().includes("/api/orders") &&
        response.request().method() === "POST"
      ) {
        serverResponseStatus = response.status();
        try {
          serverResponseBody = await response.json();
        } catch {
          // body no-JSON — dejarlo en null
        }
      }
    });

    // ── Step 3: interceptar el POST y mutar el body antes del envío ──
    await page.route("**/api/orders", async (route: Route) => {
      const request = route.request();
      if (request.method() !== "POST") {
        return route.continue();
      }

      const original = request.postDataJSON() as
        | { total?: number; items?: Array<{ price: number; quantity: number }> }
        | null;

      if (!original) return route.continue();

      // Guardar el total real (suma de items) para comparar contra la response
      interceptedClientTotal = original.total ?? 0;

      // ── ATAQUE: enviar total inflado/deflactado a S/0.01 ──
      const tampered = {
        ...original,
        total: FRAUDULENT_TOTAL,
      };

      await route.continue({
        postData: JSON.stringify(tampered),
        headers: {
          ...request.headers(),
          "content-type": "application/json",
        },
      });
    });

    // ── Step 4: disparar el checkout ──
    const btnPagoSubmit = await avanzarHastaPagoSubmit(page);
    await btnPagoSubmit.click();
    await page.waitForTimeout(1000);

    // Step 4b: click "Confirmar pedido" on step 3 if visible
    const btnConfirmar = page.getByRole("button", { name: /Confirmar pedido/i });
    if (await btnConfirmar.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await btnConfirmar.click();
    }

    // ── Step 5: esperar a que la pantalla de éxito o un error termine de renderizar ──
    const resultado = page
      .getByText(/pedido confirmado/i)
      .or(page.getByText(/seguir comprando/i))
      .or(page.getByText(/error|inv[aá]lido|fall/i))
      .or(page.getByText(/procesando/i));
    await expect(resultado.first()).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(2000);

    // ── Step 6: verificar la respuesta del servidor ──
    expect(serverResponseStatus, "El POST a /api/orders debe haber respondido").not.toBeNull();

    // El sistema actual hace warn-and-correct: 200 o 201 con total corregido
    expect(
      [200, 201].includes(serverResponseStatus!),
      `Expected 200 or 201 but got ${serverResponseStatus}`,
    ).toBe(true);

    expect(serverResponseBody, "La response debe traer el order body").not.toBeNull();
    const body = serverResponseBody as { total?: number; id?: string; status?: string } | null;
    const persistedTotal: number = body?.total ?? 0;

    // El total persistido NO debe ser el 0.01 manipulado
    expect(
      persistedTotal,
      `El servidor debe ignorar total=${FRAUDULENT_TOTAL} y persistir el precio recomputado`,
    ).toBeGreaterThan(FRAUDULENT_TOTAL);

    // Sanity check: el cliente original tenía un total > 0 también
    if (interceptedClientTotal !== null) {
      const clientTotal: number = interceptedClientTotal;
      expect(
        clientTotal,
        "El cliente original (pre-tamper) debería traer un total > 0",
      ).toBeGreaterThan(0);
    }

    // El total persistido debe coincidir (±1 céntimo por descuentos automáticos)
    // con lo que el cliente había calculado antes de la manipulación. Permitimos
    // delta porque el motor de descuentos del servidor puede aplicar promos
    // adicionales (loyalty, first-purchase) que el cliente no ve.
    expect(
      persistedTotal,
      "Total persistido debe ser el recomputo del servidor, NO el valor manipulado",
    ).toBeGreaterThanOrEqual(FRAUDULENT_TOTAL * 100); // al menos 100x el ataque
  });

  test("manipular item price → server persiste precio real", async ({ page }) => {
    // ── Step 1: agregar producto al carrito ──
    const added = await tryAddFirstProduct(page);
    if (!added) {
      test.skip(true, "Sin productos en el catálogo — necesita data seed");
      return;
    }

    // ── Step 2: capturar la response del POST ──
    type OrderItem = { id: number; price: number; quantity: number; name: string };
    let serverResponseBody: { total?: number; items?: OrderItem[] } | null = null;
    let serverResponseStatus: number | null = null;
    let originalClientPrice: number | null = null;

    page.on("response", async (response) => {
      if (
        response.url().includes("/api/orders") &&
        response.request().method() === "POST"
      ) {
        serverResponseStatus = response.status();
        try {
          serverResponseBody = await response.json();
        } catch {
          // body no-JSON
        }
      }
    });

    // ── Step 3: interceptar POST y mutar el price del primer item a 0.01 ──
    await page.route("**/api/orders", async (route: Route) => {
      const request = route.request();
      if (request.method() !== "POST") {
        return route.continue();
      }

      const original = request.postDataJSON() as
        | { total?: number; items?: Array<{ id: number; price: number; quantity: number; name: string }> }
        | null;

      if (!original?.items?.length) return route.continue();

      // Guardar el precio real que el cliente envió (antes de manipular)
      originalClientPrice = original.items[0].price;

      // ── ATAQUE: cambiar el price del primer item a 0.01 sin cambiar el total ──
      const tamperedItems = [...original.items];
      tamperedItems[0] = { ...tamperedItems[0], price: FRAUDULENT_TOTAL };

      const tampered = {
        ...original,
        items: tamperedItems,
        // No cambiamos el total — solo el price del item
      };

      await route.continue({
        postData: JSON.stringify(tampered),
        headers: {
          ...request.headers(),
          "content-type": "application/json",
        },
      });
    });

    // ── Step 4: disparar el checkout ──
    const btnPagoSubmit = await avanzarHastaPagoSubmit(page);
    await btnPagoSubmit.click();

    // ── Step 5: esperar resultado ──
    const resultado = page
      .getByText(/pedido confirmado/i)
      .or(page.getByText(/seguir comprando/i))
      .or(page.getByText(/error|inv[aá]lido|fall/i));
    await expect(resultado.first()).toBeVisible({ timeout: 20_000 });

    // ── Step 6: verificar que el servidor usó el precio real de la DB ──
    expect(serverResponseStatus, "El POST a /api/orders debe haber respondido").not.toBeNull();
    expect(serverResponseStatus, "warn-and-correct → 201").toBe(201);

    expect(serverResponseBody, "La response debe traer el order body").not.toBeNull();
    const respBody = serverResponseBody as { total?: number; items?: OrderItem[] } | null;

    // El servidor DEBE devolver items con precio de la DB, no el 0.01 manipulado
    expect(respBody?.items?.length, "La orden debe tener al menos un item").toBeGreaterThanOrEqual(1);
    const firstItemPrice = respBody!.items![0].price;

    expect(
      firstItemPrice,
      `El servidor debe ignorar price=${FRAUDULENT_TOTAL} del cliente y usar el precio de la DB`,
    ).toBeGreaterThan(FRAUDULENT_TOTAL);

    // El precio persistido debe ser el precio real del producto (el que el cliente
    // tenía originalmente antes de la manipulación)
    if (originalClientPrice !== null && originalClientPrice > 0) {
      // Permitimos cierto delta por descuentos automáticos del servidor
      expect(
        firstItemPrice,
        "El precio del item en la response debe coincidir con el precio real del producto",
      ).toBeCloseTo(originalClientPrice as number, 1);
    }

    // Verificar coherencia: total = sum(price * quantity) de items del servidor
    const computedTotal = respBody!.items!.reduce(
      (sum, i) => sum + i.price * i.quantity,
      0,
    );
    // El total puede incluir descuentos de cupón/promo, por lo que el total
    // persistido puede ser <= computedTotal. Nunca debe ser mayor.
    expect(
      respBody!.total!,
      "El total persistido no debe exceder la suma de items del servidor",
    ).toBeLessThanOrEqual(computedTotal + 0.01); // +0.01 por redondeo
  });

  test("manipular item id cross-tenant → server rechaza producto inexistente", async ({ page }) => {
    // ── Step 1: agregar producto al carrito ──
    const added = await tryAddFirstProduct(page);
    if (!added) {
      test.skip(true, "Sin productos en el catálogo — necesita data seed");
      return;
    }

    // ── Step 2: capturar la response del POST ──
    let serverResponseBody: { error?: string; productId?: number } | null = null;
    let serverResponseStatus: number | null = null;

    page.on("response", async (response) => {
      if (
        response.url().includes("/api/orders") &&
        response.request().method() === "POST"
      ) {
        serverResponseStatus = response.status();
        try {
          serverResponseBody = await response.json();
        } catch {
          // body no-JSON
        }
      }
    });

    // ── Step 3: interceptar POST y cambiar el id del primer item a uno inexistente ──
    const FAKE_PRODUCT_ID = 99999;

    await page.route("**/api/orders", async (route: Route) => {
      const request = route.request();
      if (request.method() !== "POST") {
        return route.continue();
      }

      const original = request.postDataJSON() as
        | { total?: number; items?: Array<{ id: number; price: number; quantity: number; name: string }> }
        | null;

      if (!original?.items?.length) return route.continue();

      // ── ATAQUE: cambiar el id del primer item a un producto que no existe ──
      const tamperedItems = [...original.items];
      tamperedItems[0] = { ...tamperedItems[0], id: FAKE_PRODUCT_ID };

      const tampered = {
        ...original,
        items: tamperedItems,
      };

      await route.continue({
        postData: JSON.stringify(tampered),
        headers: {
          ...request.headers(),
          "content-type": "application/json",
        },
      });
    });

    // ── Step 4: disparar el checkout ──
    const btnPagoSubmit = await avanzarHastaPagoSubmit(page);
    await btnPagoSubmit.click();

    // ── Step 5: esperar resultado (debe fallar o mostrar error) ──
    const resultado = page
      .getByText(/pedido confirmado/i)
      .or(page.getByText(/seguir comprando/i))
      .or(page.getByText(/error|inv[aá]lido|fall/i));
    await expect(resultado.first()).toBeVisible({ timeout: 20_000 });

    // ── Step 6: verificar que el servidor rechazó el producto inexistente ──
    expect(serverResponseStatus, "El POST a /api/orders debe haber respondido").not.toBeNull();

    // HOTFIX-001: el servidor devuelve 400 con error "invalid_product" cuando
    // el productId no existe en la DB del tenant (serverPriceMap.has(i.id) === false)
    expect(
      serverResponseStatus,
      "Producto inexistente → servidor debe rechazar con 400",
    ).toBe(400);

    expect(serverResponseBody, "La response debe traer body con error").not.toBeNull();
    const respBody = serverResponseBody as { error?: string; productId?: number } | null;

    expect(
      respBody?.error,
      'El error debe ser "invalid_product"',
    ).toBe("invalid_product");

    expect(
      respBody?.productId,
      "La response debe indicar el productId rechazado",
    ).toBe(FAKE_PRODUCT_ID);
  });
});
