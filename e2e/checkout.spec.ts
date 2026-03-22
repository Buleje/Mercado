import { test, expect } from '@playwright/test';

test.describe('Checkout Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000', { timeout: 30000 });
  });

  test('can add product to cart and open checkout', async ({ page }) => {
    // Wait for products to load
    const productCard = page.locator('[data-testid="product-card"]').first();
    await productCard.waitFor({ state: 'visible', timeout: 30000 });

    // Click "Agregar" on the first available product
    const addButton = productCard.getByRole('button', { name: /agregar/i });
    await addButton.click();

    // Verify cart sidebar opens or cart count increases
    const cartCount = page.locator('[data-testid="cart-count"]');
    const cartSidebar = page.locator('[data-testid="cart-sidebar"]');
    await expect(
      cartCount.or(cartSidebar)
    ).toBeVisible({ timeout: 10000 });

    // If cart sidebar didn't open automatically, click cart button to open it
    if (!(await cartSidebar.isVisible().catch(() => false))) {
      const cartButton = page.locator('[data-testid="cart-button"]').or(
        page.getByRole('button', { name: /carrito|cart/i })
      );
      await cartButton.click();
      await expect(cartSidebar).toBeVisible({ timeout: 10000 });
    }

    // Click checkout button to open checkout modal
    const checkoutButton = page.locator('[data-testid="checkout-button"]').or(
      page.getByRole('button', { name: /pagar|checkout|finalizar|comprar|completar pedido/i })
    );
    await expect(checkoutButton).toBeVisible({ timeout: 10000 });
    await checkoutButton.click();

    // Verify checkout modal is visible
    const checkoutModal = page.locator('[data-testid="checkout-modal"]').or(
      page.getByRole('dialog')
    );
    await expect(checkoutModal).toBeVisible({ timeout: 10000 });
  });

  test('checkout flow - step 1 (customer)', async ({ page }) => {
    // Add a product first to enable checkout
    const productCard = page.locator('[data-testid="product-card"]').first();
    await productCard.waitFor({ state: 'visible', timeout: 30000 });
    const addButton = productCard.getByRole('button', { name: /agregar/i });
    await addButton.click();

    // Open cart sidebar if needed
    const cartSidebar = page.locator('[data-testid="cart-sidebar"]');
    if (!(await cartSidebar.isVisible().catch(() => false))) {
      const cartButton = page.locator('[data-testid="cart-button"]').or(
        page.getByRole('button', { name: /carrito|cart/i })
      );
      await cartButton.click();
    }

    // Open checkout modal
    const checkoutButton = page.locator('[data-testid="checkout-button"]').or(
      page.getByRole('button', { name: /pagar|checkout|finalizar|comprar|completar pedido/i })
    );
    await checkoutButton.click();

    const checkoutModal = page.locator('[data-testid="checkout-modal"]').or(
      page.getByRole('dialog')
    );
    await expect(checkoutModal).toBeVisible({ timeout: 10000 });

    // Fill phone number field
    const phoneInput = checkoutModal.locator('[data-testid="phone-input"]').or(
      checkoutModal.getByPlaceholder(/tel[eé]fono|celular|phone|961234567/i)
    ).or(
      checkoutModal.locator('input[type="tel"]')
    );
    await phoneInput.fill('999999999');

    // Verify "Continuar" or next step button is available
    const continueButton = checkoutModal.getByRole('button', { name: /continuar|siguiente|next/i });
    await expect(continueButton).toBeVisible({ timeout: 10000 });
  });

  test('checkout flow - step 3 (payment method selection)', async ({ page }) => {
    // Add a product first
    const productCard = page.locator('[data-testid="product-card"]').first();
    await productCard.waitFor({ state: 'visible', timeout: 30000 });
    const addButton = productCard.getByRole('button', { name: /agregar/i });
    await addButton.click();

    // Open cart sidebar if needed
    const cartSidebar = page.locator('[data-testid="cart-sidebar"]');
    if (!(await cartSidebar.isVisible().catch(() => false))) {
      const cartButton = page.locator('[data-testid="cart-button"]').or(
        page.getByRole('button', { name: /carrito|cart/i })
      );
      await cartButton.click();
    }

    // Open checkout modal
    const checkoutButton = page.locator('[data-testid="checkout-button"]').or(
      page.getByRole('button', { name: /pagar|checkout|finalizar|comprar|completar pedido/i })
    );
    await checkoutButton.click();

    const checkoutModal = page.locator('[data-testid="checkout-modal"]').or(
      page.getByRole('dialog')
    );
    await expect(checkoutModal).toBeVisible({ timeout: 10000 });

    // Navigate through steps to reach payment method (step 3)
    // Step 1: Fill customer info
    const phoneInput = checkoutModal.locator('[data-testid="phone-input"]').or(
      checkoutModal.getByPlaceholder(/tel[eé]fono|celular|phone|961234567/i)
    ).or(
      checkoutModal.locator('input[type="tel"]')
    );
    await phoneInput.fill('999999999');

    const continueButton = checkoutModal.getByRole('button', { name: /continuar|siguiente|next/i });
    await continueButton.click();

    // Step 2: Skip or continue through delivery/address step
    const continueButton2 = checkoutModal.getByRole('button', { name: /continuar|siguiente|next/i });
    if (await continueButton2.isVisible({ timeout: 5000 }).catch(() => false)) {
      await continueButton2.click();
    }

    // Step 3: Select "Efectivo" payment method
    const efectivoOption = checkoutModal.getByText(/efectivo/i).or(
      checkoutModal.locator('[data-testid="payment-cash"]')
    );
    await expect(efectivoOption).toBeVisible({ timeout: 10000 });
    await efectivoOption.click();

    // Verify total is displayed
    const total = checkoutModal.getByText(/total/i);
    await expect(total).toBeVisible({ timeout: 10000 });

    // Verify a monetary amount is shown (S/ or a number)
    const amount = checkoutModal.getByText(/S\/\s*\d+|total.*\d+/i);
    await expect(amount).toBeVisible({ timeout: 10000 });
  });

  test('cart sidebar shows correct total', async ({ page }) => {
    // Wait for products to load
    const productCard = page.locator('[data-testid="product-card"]').first();
    await productCard.waitFor({ state: 'visible', timeout: 30000 });

    // Add a product
    const addButton = productCard.getByRole('button', { name: /agregar/i });
    await addButton.click();

    // Open cart sidebar if not already open
    const cartSidebar = page.locator('[data-testid="cart-sidebar"]');
    if (!(await cartSidebar.isVisible().catch(() => false))) {
      const cartButton = page.locator('[data-testid="cart-button"]').or(
        page.getByRole('button', { name: /carrito|cart/i })
      );
      await cartButton.click();
      await expect(cartSidebar).toBeVisible({ timeout: 10000 });
    }

    // Verify cart total > 0 (look for S/ followed by a non-zero amount)
    const cartTotal = cartSidebar.getByText(/S\/\s*[1-9]\d*(\.\d{2})?/);
    await expect(cartTotal.first()).toBeVisible({ timeout: 10000 });

    // Verify cart item count shows correctly (at least 1 item)
    const itemCount = page.locator('[data-testid="cart-count"]').or(
      cartSidebar.getByText(/\(\d+\)|1\s*(producto|item|artículo)/i)
    );
    await expect(itemCount.first()).toBeVisible({ timeout: 10000 });
  });

  test('empty cart shows appropriate message', async ({ page }) => {
    // Open cart sidebar without adding any products
    const cartButton = page.locator('[data-testid="cart-button"]').or(
      page.getByRole('button', { name: /carrito|cart/i })
    );
    await cartButton.click();

    // Verify cart sidebar is visible
    const cartSidebar = page.locator('[data-testid="cart-sidebar"]');
    await expect(cartSidebar).toBeVisible({ timeout: 10000 });

    // Verify empty cart message is shown
    const emptyMessage = cartSidebar.getByText(/carrito.*vac[ií]o|no.*productos|empty.*cart|sin.*productos|a[ñn]ade.*productos/i).or(
      cartSidebar.locator('[data-testid="empty-cart-message"]')
    );
    await expect(emptyMessage).toBeVisible({ timeout: 10000 });
  });
});
