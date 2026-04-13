import { test, expect, type Page } from "@playwright/test";

/**
 * Checkout Wizard E2E — data-testid
 *
 * Cubre el flujo completo del wizard de compra usando los data-testid
 * expuestos en los nuevos componentes StepDatos y StepPago:
 *
 *   datos-form      — formulario de datos del cliente (paso 2)
 *   datos-back      — botón "Volver" en paso 2
 *   datos-submit    — botón "Continuar al pago" en paso 2
 *   pago-form       — formulario de pago (paso 3)
 *   pago-back       — botón "Volver" en paso 3
 *   pago-submit     — botón "Finalizar pedido" en paso 3
 *   payment-yape    — opción de pago Yape
 *   payment-efectivo — opción de pago Efectivo
 *
 * Flujo de pasos: cuenta → datos → pago → éxito
 * Modo serial: cada test depende del estado de navegación anterior.
 */

// ── Helpers reutilizables ──────────────────────────────────────────────────────

/**
 * Agrega el primer producto disponible al carrito y abre el modal de checkout.
 * Retorna el locator del modal para assertions posteriores.
 */
async function agregarProductoYAbrirCheckout(page: Page) {
  await page.goto("/tienda");
  await page.waitForLoadState("networkidle");

  // Esperar al menos un botón "Agregar" visible en el catálogo
  const btnAgregar = page.locator('button[aria-label^="Agregar"]').first();
  await btnAgregar.waitFor({ state: "visible", timeout: 20_000 });
  await btnAgregar.click();

  // Verificar que el contador del carrito refleje 1 ítem
  const btnCarrito = page.locator('button[aria-label="Abrir carrito"]');
  await expect(btnCarrito).toContainText("1", { timeout: 8_000 });

  // Abrir el sidebar del carrito
  await btnCarrito.click();
  const sidebar = page.getByRole("dialog", { name: "Carrito de compras" });
  await expect(sidebar).toBeVisible({ timeout: 5_000 });

  // Hacer click en el botón de checkout dentro del sidebar
  const btnCheckout = sidebar
    .locator('[data-testid="checkout-button"]')
    .or(
      sidebar.getByRole("button", {
        name: /pagar|checkout|finalizar|comprar|completar pedido/i,
      })
    );
  await expect(btnCheckout).toBeVisible({ timeout: 5_000 });
  await btnCheckout.click();

  // Esperar que el modal de checkout sea visible
  const modal = page
    .locator('[data-testid="checkout-modal"]')
    .or(page.getByRole("dialog").filter({ hasText: /cuenta|pago|datos/i }));
  await expect(modal).toBeVisible({ timeout: 10_000 });
  return modal;
}

/**
 * Salta el paso de cuenta (invitado / continuar) si está presente.
 */
async function saltarPasoCuenta(modal: ReturnType<Page["locator"]>) {
  const btnSaltar = modal
    .locator('[data-testid="checkout-skip-account"]')
    .or(
      modal.getByRole("button", {
        name: /continuar|soy nuevo|invitado/i,
      })
    );
  const visible = await btnSaltar.isVisible({ timeout: 5_000 }).catch(() => false);
  if (visible) {
    await btnSaltar.first().click();
  }
}

// ── Suite principal ────────────────────────────────────────────────────────────

test.describe("Checkout Wizard — flujo completo con data-testid", () => {
  test.describe.configure({ mode: "serial" });

  // ── 1. Se abre el modal y muestra el paso de cuenta ───────────────────────

  test("1 — el modal de checkout se abre desde el carrito", async ({ page }) => {
    const modal = await agregarProductoYAbrirCheckout(page);

    // El modal debe estar visible con contenido del paso inicial
    await expect(modal).toBeVisible();

    // El paso "cuenta" muestra teléfono o botón continuar
    const contenidoCuenta = modal
      .locator('input[type="tel"]')
      .or(modal.getByRole("button", { name: /continuar|soy nuevo/i }))
      .or(modal.getByText(/ya tienes cuenta/i));
    await expect(contenidoCuenta.first()).toBeVisible({ timeout: 8_000 });
  });

  // ── 2. El formulario de datos tiene su data-testid ────────────────────────

  test("2 — datos-form es visible después de saltar el paso de cuenta", async ({
    page,
  }) => {
    const modal = await agregarProductoYAbrirCheckout(page);
    await saltarPasoCuenta(modal);

    // El formulario con data-testid="datos-form" debe aparecer
    const datosForm = modal.locator('[data-testid="datos-form"]');
    await expect(datosForm).toBeVisible({ timeout: 10_000 });
  });

  // ── 3. El botón datos-back navega de vuelta al paso anterior ──────────────

  test("3 — datos-back regresa al paso de cuenta", async ({ page }) => {
    const modal = await agregarProductoYAbrirCheckout(page);
    await saltarPasoCuenta(modal);

    // Verificar que estamos en el paso datos
    const datosForm = modal.locator('[data-testid="datos-form"]');
    await expect(datosForm).toBeVisible({ timeout: 10_000 });

    // Hacer click en el botón "Volver" del paso datos
    const btnVolver = modal.locator('[data-testid="datos-back"]');
    await expect(btnVolver).toBeVisible();
    await btnVolver.click();

    // El formulario de datos ya no debe ser visible (regresamos a cuenta)
    await expect(datosForm).toBeHidden({ timeout: 5_000 });

    // Debe aparecer algo del paso cuenta nuevamente
    const contenidoCuenta = modal
      .locator('input[type="tel"]')
      .or(modal.getByRole("button", { name: /continuar|soy nuevo/i }))
      .or(modal.getByText(/ya tienes cuenta/i));
    await expect(contenidoCuenta.first()).toBeVisible({ timeout: 5_000 });
  });

  // ── 4. Completar datos del cliente y avanzar con datos-submit ─────────────

  test("4 — llenar nombre, teléfono y dirección, luego datos-submit avanza al pago", async ({
    page,
  }) => {
    const modal = await agregarProductoYAbrirCheckout(page);
    await saltarPasoCuenta(modal);

    const datosForm = modal.locator('[data-testid="datos-form"]');
    await expect(datosForm).toBeVisible({ timeout: 10_000 });

    // Llenar nombre del cliente
    const inputNombre = datosForm
      .getByPlaceholder(/nombre/i)
      .or(datosForm.locator('input[name="name"]'))
      .or(datosForm.locator('input[name="customerName"]'));
    if (await inputNombre.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
      await inputNombre.first().fill("Ana García");
    }

    // Llenar teléfono
    const inputTelefono = datosForm
      .locator('input[type="tel"]')
      .or(datosForm.getByPlaceholder(/cel[uú]lar|tel[eé]fono|9\d{8}/i));
    if (await inputTelefono.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
      await inputTelefono.first().fill("987654321");
    }

    // Llenar dirección si hay campo visible
    const inputDireccion = datosForm
      .getByPlaceholder(/direcci[oó]n|ubicaci[oó]n|calle/i)
      .or(datosForm.locator('input[name="location"]'))
      .or(datosForm.locator('textarea[name="location"]'));
    if (await inputDireccion.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
      await inputDireccion.first().fill("Jr. Ucayali 450, Pucallpa");
    }

    // Hacer click en "Continuar al pago" (datos-submit)
    const btnDatosSubmit = modal.locator('[data-testid="datos-submit"]');
    await expect(btnDatosSubmit).toBeVisible({ timeout: 5_000 });
    await btnDatosSubmit.click();

    // Si aparece tip de GPS, hacer click nuevamente
    const tipGps = modal.getByText(/GPS|ubicaci[oó]n/i);
    if (await tipGps.isVisible({ timeout: 1_500 }).catch(() => false)) {
      await btnDatosSubmit.click();
    }

    // Debe aparecer el formulario de pago
    const pagoForm = modal.locator('[data-testid="pago-form"]');
    await expect(pagoForm).toBeVisible({ timeout: 10_000 });
  });

  // ── 5. pago-form y sus botones son visibles en el paso de pago ───────────

  test("5 — pago-form, pago-back y pago-submit son visibles en el paso de pago", async ({
    page,
  }) => {
    // Mockear APIs de soporte para llegar al paso de pago rápido
    await page.route("**/api/coupons/**", (route) =>
      route.fulfill({ status: 404, body: '{"error":"not found"}' })
    );

    const modal = await agregarProductoYAbrirCheckout(page);
    await saltarPasoCuenta(modal);

    // Saltar paso datos con submit directo (sin llenar campos obligatorios primero
    // intentar, si falla validación quedamos en datos)
    const datosForm = modal.locator('[data-testid="datos-form"]');
    await expect(datosForm).toBeVisible({ timeout: 10_000 });

    // Llenar datos mínimos para poder avanzar
    const inputNombre = datosForm.getByPlaceholder(/nombre/i).or(datosForm.locator('input[name="name"]'));
    if (await inputNombre.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
      await inputNombre.first().fill("Test QA");
    }
    const inputTelefono = datosForm.locator('input[type="tel"]');
    if (await inputTelefono.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
      await inputTelefono.first().fill("999111222");
    }

    await modal.locator('[data-testid="datos-submit"]').click();

    // Si hubo tip GPS, reintentar
    if (await modal.getByText(/GPS/i).isVisible({ timeout: 1_000 }).catch(() => false)) {
      await modal.locator('[data-testid="datos-submit"]').click();
    }

    // Verificar que pago-form está visible
    const pagoForm = modal.locator('[data-testid="pago-form"]');
    await expect(pagoForm).toBeVisible({ timeout: 10_000 });

    // Los botones pago-back y pago-submit deben estar presentes
    await expect(modal.locator('[data-testid="pago-back"]')).toBeVisible();
    await expect(modal.locator('[data-testid="pago-submit"]')).toBeVisible();
  });

  // ── 6. payment-efectivo selecciona correctamente efectivo ────────────────

  test("6 — payment-efectivo selecciona el método de pago en efectivo", async ({
    page,
  }) => {
    const modal = await agregarProductoYAbrirCheckout(page);
    await saltarPasoCuenta(modal);

    // Avanzar al paso de pago
    const datosForm = modal.locator('[data-testid="datos-form"]');
    await expect(datosForm).toBeVisible({ timeout: 10_000 });
    const inputNombre = datosForm.getByPlaceholder(/nombre/i).or(datosForm.locator('input[name="name"]'));
    if (await inputNombre.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
      await inputNombre.first().fill("Carlos Mendoza");
    }
    const inputTelefono = datosForm.locator('input[type="tel"]');
    if (await inputTelefono.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
      await inputTelefono.first().fill("956123456");
    }
    await modal.locator('[data-testid="datos-submit"]').click();
    if (await modal.getByText(/GPS/i).isVisible({ timeout: 1_000 }).catch(() => false)) {
      await modal.locator('[data-testid="datos-submit"]').click();
    }

    // En el paso de pago, hacer click en payment-efectivo
    const pagoForm = modal.locator('[data-testid="pago-form"]');
    await expect(pagoForm).toBeVisible({ timeout: 10_000 });

    const btnEfectivo = modal.locator('[data-testid="payment-efectivo"]');
    await expect(btnEfectivo).toBeVisible({ timeout: 5_000 });
    await btnEfectivo.click();

    // El botón efectivo debe quedar marcado como seleccionado
    await expect(btnEfectivo).toHaveAttribute("aria-checked", "true", { timeout: 3_000 });

    // Debe aparecer la calculadora de cambio
    const calculadoraCambio = modal
      .getByText(/pago contra entrega/i)
      .or(modal.getByText(/cu[aá]nto vas a pagar/i));
    await expect(calculadoraCambio).toBeVisible({ timeout: 5_000 });
  });

  // ── 7. payment-yape selecciona Yape si está habilitado ──────────────────

  test("7 — payment-yape selecciona el método Yape cuando está habilitado", async ({
    page,
  }) => {
    const modal = await agregarProductoYAbrirCheckout(page);
    await saltarPasoCuenta(modal);

    const datosForm = modal.locator('[data-testid="datos-form"]');
    await expect(datosForm).toBeVisible({ timeout: 10_000 });
    const inputNombre = datosForm.getByPlaceholder(/nombre/i).or(datosForm.locator('input[name="name"]'));
    if (await inputNombre.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
      await inputNombre.first().fill("Rosa Pérez");
    }
    const inputTelefono = datosForm.locator('input[type="tel"]');
    if (await inputTelefono.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
      await inputTelefono.first().fill("941000111");
    }
    await modal.locator('[data-testid="datos-submit"]').click();
    if (await modal.getByText(/GPS/i).isVisible({ timeout: 1_000 }).catch(() => false)) {
      await modal.locator('[data-testid="datos-submit"]').click();
    }

    const pagoForm = modal.locator('[data-testid="pago-form"]');
    await expect(pagoForm).toBeVisible({ timeout: 10_000 });

    const btnYape = modal.locator('[data-testid="payment-yape"]');
    const yapeHabilitado = await btnYape.isVisible({ timeout: 3_000 }).catch(() => false);

    if (!yapeHabilitado) {
      // Yape deshabilitado en este entorno — test omitido intencionalmente
      test.skip(true, "Yape no habilitado en el entorno de prueba");
      return;
    }

    await btnYape.click();

    // El botón Yape debe quedar marcado como seleccionado
    await expect(btnYape).toHaveAttribute("aria-checked", "true", { timeout: 3_000 });

    // Debe aparecer el panel de Yape con el número de operación
    const panelYape = modal
      .getByText(/pago con yape/i)
      .or(modal.locator('input[inputmode="numeric"]'));
    await expect(panelYape.first()).toBeVisible({ timeout: 5_000 });
  });

  // ── 8. pago-back regresa desde pago a datos ──────────────────────────────

  test("8 — pago-back regresa al formulario de datos del cliente", async ({
    page,
  }) => {
    const modal = await agregarProductoYAbrirCheckout(page);
    await saltarPasoCuenta(modal);

    // Avanzar al paso de pago
    const datosForm = modal.locator('[data-testid="datos-form"]');
    await expect(datosForm).toBeVisible({ timeout: 10_000 });
    const inputNombre = datosForm.getByPlaceholder(/nombre/i).or(datosForm.locator('input[name="name"]'));
    if (await inputNombre.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
      await inputNombre.first().fill("Luis Torres");
    }
    const inputTelefono = datosForm.locator('input[type="tel"]');
    if (await inputTelefono.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
      await inputTelefono.first().fill("912345678");
    }
    await modal.locator('[data-testid="datos-submit"]').click();
    if (await modal.getByText(/GPS/i).isVisible({ timeout: 1_000 }).catch(() => false)) {
      await modal.locator('[data-testid="datos-submit"]').click();
    }

    const pagoForm = modal.locator('[data-testid="pago-form"]');
    await expect(pagoForm).toBeVisible({ timeout: 10_000 });

    // Hacer click en "Volver" del paso de pago
    const btnPagoBack = modal.locator('[data-testid="pago-back"]');
    await expect(btnPagoBack).toBeVisible();
    await btnPagoBack.click();

    // El paso de pago ya no debe ser visible — regresamos a datos
    await expect(pagoForm).toBeHidden({ timeout: 5_000 });
    await expect(modal.locator('[data-testid="datos-form"]')).toBeVisible({
      timeout: 5_000,
    });
  });

  // ── 9. Flujo completo: tienda → carrito → checkout → éxito (API mockeada) ─

  test("9 — flujo completo: agregar producto, llenar datos, efectivo y confirmar pedido", async ({
    page,
  }) => {
    // Mockear la API de creación de pedido para evitar dependencia de backend
    await page.route("**/api/orders**", (route) => {
      if (route.request().method() === "POST") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: { id: "E2E-TEST-001", status: "confirmed" },
            orderId: "E2E-TEST-001",
          }),
        });
      }
      return route.continue();
    });

    // Mockear búsqueda de clientes — devolver lista vacía
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

    // Paso 0: navegar a la tienda y agregar un producto
    const modal = await agregarProductoYAbrirCheckout(page);

    // Paso 1 (cuenta): saltar
    await saltarPasoCuenta(modal);

    // Paso 2 (datos): formulario con data-testid="datos-form"
    const datosForm = modal.locator('[data-testid="datos-form"]');
    await expect(datosForm).toBeVisible({ timeout: 10_000 });

    // Llenar nombre
    const inputNombre = datosForm
      .getByPlaceholder(/nombre/i)
      .or(datosForm.locator('input[name="name"]'))
      .or(datosForm.locator('input[name="customerName"]'));
    if (await inputNombre.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
      await inputNombre.first().fill("Brandon E2E");
    }

    // Llenar teléfono
    const inputTelefono = datosForm
      .locator('input[type="tel"]')
      .or(datosForm.getByPlaceholder(/cel[uú]lar|tel[eé]fono/i));
    if (await inputTelefono.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
      await inputTelefono.first().fill("999888777");
    }

    // Llenar dirección
    const inputDireccion = datosForm
      .getByPlaceholder(/direcci[oó]n|ubicaci[oó]n/i)
      .or(datosForm.locator('input[name="location"]'))
      .or(datosForm.locator('textarea[name="location"]'));
    if (await inputDireccion.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
      await inputDireccion.first().fill("Jr. Ucayali 450, Pucallpa");
    }

    // Avanzar al pago con datos-submit
    const btnDatosSubmit = modal.locator('[data-testid="datos-submit"]');
    await expect(btnDatosSubmit).toBeVisible({ timeout: 5_000 });
    await btnDatosSubmit.click();

    // Si tip de GPS, reintentar
    if (await modal.getByText(/GPS/i).isVisible({ timeout: 1_500 }).catch(() => false)) {
      await btnDatosSubmit.click();
    }

    // Paso 3 (pago): formulario con data-testid="pago-form"
    const pagoForm = modal.locator('[data-testid="pago-form"]');
    await expect(pagoForm).toBeVisible({ timeout: 10_000 });

    // Seleccionar efectivo con payment-efectivo
    const btnEfectivo = modal.locator('[data-testid="payment-efectivo"]');
    await expect(btnEfectivo).toBeVisible({ timeout: 5_000 });
    await btnEfectivo.click();
    await expect(btnEfectivo).toHaveAttribute("aria-checked", "true", { timeout: 3_000 });

    // Confirmar el pedido con pago-submit
    const btnPagoSubmit = modal.locator('[data-testid="pago-submit"]');
    await expect(btnPagoSubmit).toBeVisible({ timeout: 5_000 });
    await expect(btnPagoSubmit).toBeEnabled();
    await btnPagoSubmit.click();

    // Verificar pantalla de éxito — "Pedido confirmado!" o número de pedido
    const mensajeExito = page
      .getByText(/pedido confirmado/i)
      .or(page.getByText(/E2E-TEST-001/))
      .or(page.getByText(/seguir comprando/i));
    await expect(mensajeExito.first()).toBeVisible({ timeout: 15_000 });
  });
});
