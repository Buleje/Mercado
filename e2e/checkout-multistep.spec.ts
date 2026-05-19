import { test, expect } from "@playwright/test";

/**
 * Checkout multi-step flow — verifica el camino completo del usuario:
 *   /marketplace -> agregar producto -> modal central -> /marketplace/carrito ->
 *   /checkout/datos -> /checkout/entrega -> /checkout/confirmar.
 *
 * No envia el pedido al servidor (no clickea "Confirmar pedido") para evitar
 * pedidos basura en la DB de desarrollo. Verifica que el stepper se actualice,
 * los items persistan entre paginas y los totales se calculen.
 */

test.describe("Checkout multi-step (Amazon-style)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.removeItem("marketplace-cart");
        localStorage.removeItem("marketplace-checkout-customer");
        localStorage.removeItem("marketplace-checkout-address");
        localStorage.removeItem("marketplace-checkout-payment");
        localStorage.removeItem("marketplace-checkout-coupons");
        localStorage.removeItem("marketplace-checkout-loyalty");
      } catch {
        /* silent */
      }
    });
  });

  test("Camino completo: agregar producto -> /carrito -> /datos -> /entrega -> /confirmar", async ({
    page,
  }) => {
    // 1. Marketplace home
    await page.goto("/marketplace");
    await expect(page).toHaveTitle(/Marketplace Buleje/);

    // 2. Agregar primer producto (modal central debe abrir)
    const firstAdd = page.getByRole("button", { name: /agregar al carrito/i }).first();
    await firstAdd.scrollIntoViewIfNeeded();
    await firstAdd.click();
    await expect(page.getByText(/agregado al carrito/i)).toBeVisible({ timeout: 5_000 });

    // Click "Ver mi carrito" del modal -> navega a /marketplace/carrito
    await page.getByRole("button", { name: /ver mi carrito/i }).click();
    await page.waitForURL("**/marketplace/carrito");

    // 3. Pagina /marketplace/carrito
    await expect(page.getByRole("heading", { name: /tu carrito/i })).toBeVisible();
    await expect(page.getByText(/resumen del pedido/i)).toBeVisible();
    // Stepper presente con "Carrito" como current
    await expect(page.getByRole("navigation", { name: /progreso del checkout/i })).toBeVisible();

    // 4. Continuar al checkout (Step 2: Datos)
    await page.getByRole("link", { name: /continuar al checkout/i }).click();
    await page.waitForURL("**/checkout/datos");
    await expect(page.getByRole("heading", { name: /quien recibe/i })).toBeVisible();

    // 5. Llenar datos personales
    await page.getByLabel(/nombre completo/i).fill("Brandon Buleje");
    await page.getByLabel(/telefono.*whatsapp/i).fill("929340532");
    await page.getByLabel(/email/i).fill("brandon@buleje.pe");

    // CTA habilitado y avanza a /entrega
    const ctaContinuar = page.getByRole("button", { name: /continuar a entrega/i });
    await expect(ctaContinuar).toBeEnabled();
    await ctaContinuar.click();
    await page.waitForURL("**/checkout/entrega");

    // 6. Pagina entrega y pago
    await expect(page.getByRole("heading", { name: /entrega y pago/i })).toBeVisible();
    await page.getByLabel(/^direccion/i).fill("Jr. Las Magnolias 254");

    // Verificar que el resumen de datos del comprador muestra lo que llenamos antes
    await expect(page.getByText("Brandon Buleje").first()).toBeVisible();

    // CTA "Revisar pedido" habilitado
    const ctaRevisar = page.getByRole("button", { name: /revisar pedido/i });
    await expect(ctaRevisar).toBeEnabled();
    await ctaRevisar.click();
    await page.waitForURL("**/checkout/confirmar");

    // 7. Pagina confirmar - todo read-only
    await expect(page.getByRole("heading", { name: /revisa tu pedido/i })).toBeVisible();
    await expect(page.getByText("Brandon Buleje").first()).toBeVisible();
    await expect(page.getByText("Jr. Las Magnolias 254")).toBeVisible();
    // Boton final visible (no lo clickeamos para no enviar pedido real)
    await expect(page.getByRole("button", { name: /confirmar pedido/i })).toBeVisible();
  });

  test("Carrito vacio: /checkout/datos redirige a /marketplace/carrito", async ({ page }) => {
    await page.goto("/checkout/datos");
    await page.waitForURL("**/marketplace/carrito");
    await expect(page.getByText(/tu carrito esta vacio/i)).toBeVisible();
  });

  test("Sin datos cliente: /checkout/entrega redirige a /checkout/datos", async ({ page }) => {
    // Hidratamos un item en el carrito sin pasar por /datos
    await page.goto("/marketplace");
    await page.evaluate(() => {
      localStorage.setItem(
        "marketplace-cart",
        JSON.stringify({
          items: [
            {
              storeId: "test",
              storeName: "Tienda Test",
              storeSlug: "test",
              storeProductId: "1",
              productId: 1,
              name: "Producto Test",
              price: 10,
              quantity: 1,
              image: null,
              unit: "unidad",
            },
          ],
        }),
      );
    });
    await page.goto("/checkout/entrega");
    await page.waitForURL("**/checkout/datos");
    await expect(page.getByRole("heading", { name: /quien recibe/i })).toBeVisible();
  });
});
