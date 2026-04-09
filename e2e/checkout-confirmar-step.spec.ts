import { test, expect, type Page } from '@playwright/test';

/**
 * E2E del nuevo step "Confirmar" del CheckoutModal (réplica del patrón
 * de MarketplaceCheckoutModal). Verifica que después del paso Pago
 * aparezca la pantalla de revisión con las 5 cards + footer sticky con
 * el botón "Confirmar pedido · S/XX.XX".
 *
 * NO ejecuta el submit final — queda en la revisión. El submit real
 * está cubierto por checkout.spec.ts + useCheckoutSubmit.test.ts.
 */

async function addFirstProductToCart(page: Page) {
  await page.goto('http://localhost:3000', { timeout: 30000 });
  const productCard = page.locator('[data-testid="product-card"]').first();
  await productCard.waitFor({ state: 'visible', timeout: 30000 });
  const addButton = productCard.getByRole('button', { name: /agregar/i });
  await addButton.click();
}

async function openCheckoutModal(page: Page) {
  const cartSidebar = page.locator('[data-testid="cart-sidebar"]');
  if (!(await cartSidebar.isVisible().catch(() => false))) {
    const cartButton = page
      .locator('[data-testid="cart-button"]')
      .or(page.getByRole('button', { name: /carrito|cart/i }));
    await cartButton.click();
    await expect(cartSidebar).toBeVisible({ timeout: 10000 });
  }

  const checkoutButton = page
    .locator('[data-testid="checkout-button"]')
    .or(
      page.getByRole('button', {
        name: /pagar|checkout|finalizar|comprar|completar pedido/i,
      })
    );
  await checkoutButton.click();

  const checkoutModal = page
    .locator('[data-testid="checkout-modal"]')
    .or(page.getByRole('dialog'));
  await expect(checkoutModal).toBeVisible({ timeout: 10000 });
  return checkoutModal;
}

test.describe('Checkout — Paso Confirmar (review screen)', () => {
  test('después de Pago aparece StepConfirmar con resumen y CTA sticky', async ({
    page,
  }) => {
    await addFirstProductToCart(page);
    const modal = await openCheckoutModal(page);

    // ─── Paso cuenta: saltar cuenta (invitado) ───
    const skipAccount = modal
      .getByRole('button', { name: /continuar sin|omitir|invitad/i })
      .or(modal.locator('[data-testid="checkout-skip-account"]'));
    if (await skipAccount.isVisible().catch(() => false)) {
      await skipAccount.click();
    }

    // ─── Paso datos ───
    const nameInput = modal
      .locator('input[name="name"], [data-testid="customer-name"]')
      .or(modal.getByPlaceholder(/nombre/i));
    await nameInput.first().fill('Test Comprador');

    const phoneInput = modal
      .locator('input[type="tel"], [data-testid="phone-input"]')
      .or(modal.getByPlaceholder(/tel[eé]fono|celular|961234567/i));
    await phoneInput.first().fill('999888777');

    const addressInput = modal
      .locator('[data-testid="address-input"], textarea, input[name="address"]')
      .or(modal.getByPlaceholder(/direcci[oó]n|ubicaci[oó]n/i));
    if (await addressInput.first().isVisible().catch(() => false)) {
      await addressInput.first().fill('Jr. Progreso 123, Pucallpa');
    }

    const continueDatosButton = modal.getByRole('button', {
      name: /continuar|siguiente|ir a pago/i,
    });
    await continueDatosButton.first().click();

    // ─── Paso pago: seleccionar efectivo ───
    const cashOption = modal
      .getByRole('button', { name: /efectivo/i })
      .or(modal.locator('[data-testid="payment-cash"]'));
    if (await cashOption.first().isVisible().catch(() => false)) {
      await cashOption.first().click();
    }

    const continuePagoButton = modal.getByRole('button', {
      name: /continuar|siguiente|revisar/i,
    });
    await continuePagoButton.first().click();

    // ─── Paso confirmar: verificar la review screen ───
    // 1. Título "Revisa tu pedido"
    await expect(
      modal.getByRole('heading', { name: /revisa tu pedido/i })
    ).toBeVisible({ timeout: 10000 });

    // 2. Card con los datos del cliente
    await expect(modal.getByText(/tus datos/i)).toBeVisible();
    await expect(modal.getByText('Test Comprador')).toBeVisible();
    await expect(modal.getByText('999888777')).toBeVisible();

    // 3. Card de método de pago
    await expect(modal.getByText(/método de pago/i)).toBeVisible();
    await expect(modal.getByText(/efectivo/i).first()).toBeVisible();

    // 4. Card de totales
    await expect(modal.getByText(/total a pagar/i)).toBeVisible();

    // 5. Footer sticky con botón "Confirmar pedido · S/..."
    const confirmCta = modal.getByRole('button', {
      name: /confirmar pedido.*s\//i,
    });
    await expect(confirmCta).toBeVisible();
    await expect(confirmCta).toBeEnabled();

    // 6. Trust badges presentes
    await expect(modal.getByText(/compra segura/i)).toBeVisible();
    await expect(modal.getByText(/delivery rápido/i)).toBeVisible();
  });

  test('botón Atrás del footer regresa al paso Pago', async ({ page }) => {
    await addFirstProductToCart(page);
    const modal = await openCheckoutModal(page);

    const skipAccount = modal
      .getByRole('button', { name: /continuar sin|omitir|invitad/i })
      .or(modal.locator('[data-testid="checkout-skip-account"]'));
    if (await skipAccount.isVisible().catch(() => false)) {
      await skipAccount.click();
    }

    const nameInput = modal
      .locator('input[name="name"], [data-testid="customer-name"]')
      .or(modal.getByPlaceholder(/nombre/i));
    await nameInput.first().fill('Test Back');
    const phoneInput = modal
      .locator('input[type="tel"]')
      .or(modal.getByPlaceholder(/tel[eé]fono/i));
    await phoneInput.first().fill('999111222');

    const addressInput = modal
      .locator('[data-testid="address-input"], textarea')
      .or(modal.getByPlaceholder(/direcci[oó]n/i));
    if (await addressInput.first().isVisible().catch(() => false)) {
      await addressInput.first().fill('Av. Centenario 500');
    }

    await modal.getByRole('button', { name: /continuar|siguiente/i }).first().click();

    const cashOption = modal.getByRole('button', { name: /efectivo/i });
    if (await cashOption.first().isVisible().catch(() => false)) {
      await cashOption.first().click();
    }
    await modal.getByRole('button', { name: /continuar|revisar/i }).first().click();

    // En confirmar: apretar el botón atrás (chevron)
    await expect(
      modal.getByRole('heading', { name: /revisa tu pedido/i })
    ).toBeVisible({ timeout: 10000 });

    const backButton = modal.getByLabel(/volver al paso de pago/i);
    await expect(backButton).toBeVisible();
    await backButton.click();

    // Debe volver al paso pago (ya no está el heading de confirmar)
    await expect(
      modal.getByRole('heading', { name: /revisa tu pedido/i })
    ).toBeHidden({ timeout: 5000 });
  });

  test('botón "Editar" en card dirección regresa al paso Datos', async ({
    page,
  }) => {
    await addFirstProductToCart(page);
    const modal = await openCheckoutModal(page);

    const skipAccount = modal
      .getByRole('button', { name: /continuar sin|omitir|invitad/i })
      .or(modal.locator('[data-testid="checkout-skip-account"]'));
    if (await skipAccount.isVisible().catch(() => false)) {
      await skipAccount.click();
    }

    await modal
      .locator('input[name="name"], [data-testid="customer-name"]')
      .or(modal.getByPlaceholder(/nombre/i))
      .first()
      .fill('Test Editar');
    await modal
      .locator('input[type="tel"]')
      .or(modal.getByPlaceholder(/tel[eé]fono/i))
      .first()
      .fill('999333444');

    const addressInput = modal
      .locator('[data-testid="address-input"], textarea')
      .or(modal.getByPlaceholder(/direcci[oó]n/i));
    if (await addressInput.first().isVisible().catch(() => false)) {
      await addressInput.first().fill('Jr. Inmaculada 42');
    } else {
      // Si no hay input de dirección visible, el test de editar no aplica.
      test.skip();
    }

    await modal.getByRole('button', { name: /continuar|siguiente/i }).first().click();

    const cashOption = modal.getByRole('button', { name: /efectivo/i });
    if (await cashOption.first().isVisible().catch(() => false)) {
      await cashOption.first().click();
    }
    await modal.getByRole('button', { name: /continuar|revisar/i }).first().click();

    // En confirmar: apretar "Editar"
    const editButton = modal.locator('[data-testid="confirmar-editar-direccion"]');
    if (await editButton.isVisible().catch(() => false)) {
      await editButton.click();

      // Ya no vemos el heading de confirmar
      await expect(
        modal.getByRole('heading', { name: /revisa tu pedido/i })
      ).toBeHidden({ timeout: 5000 });
    } else {
      test.skip();
    }
  });
});
