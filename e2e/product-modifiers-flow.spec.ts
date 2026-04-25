/**
 * product-modifiers-flow.spec.ts — flow end-to-end del sistema de variaciones.
 *
 * Cubre los casos universales del feature ProductModifierGroup/Option:
 *   1. Modal abre cuando producto tiene modifiers.
 *   2. Required + minSelect → CTA disabled hasta validar.
 *   3. Multi maxSelect → tope respetado, no se puede pasar.
 *   4. priceDelta → total se calcula sumando deltas.
 *   5. Cart unicidad por modifierHash → mismo producto con modifiers
 *      distintos = lineas distintas.
 *
 * Asume seed activo (scripts/seed-modifier-demo.mjs).
 */

import { test, expect, type Page } from "@playwright/test";

const STORE_PATH = "/marketplace/main";
const PRODUCT_NAME = "1/4 de pollo a la brasa";
const VIEWPORT = { width: 1440, height: 900 };

test.use({ viewport: VIEWPORT });
// Sin paralelismo dentro del file: comparten el mismo modal/seed y queremos
// asegurar deterministic state antes de cada test.
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem("marketplace-cart");
    sessionStorage.removeItem("buleje:sticky-cart:dismissed-subtotal");
    localStorage.setItem("buleje-tour-marketplace-2026-04", "1");
    localStorage.setItem("onboarding-completed-main", "1");
  });
});

async function openProductModal(page: Page, productName: string) {
  await page.goto(STORE_PATH);
  await page.locator("#catalogo").scrollIntoViewIfNeeded();
  await page.waitForLoadState("networkidle");
  const ariaLabel = `Agregar ${productName} al carrito`;
  const btn = page.getByRole("button", { name: ariaLabel });
  await btn.waitFor({ state: "attached", timeout: 15000 });
  await btn.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await btn.click();
  // Espera a que el modal se monte y la animacion termine.
  // El modal de modifiers usa aria-label "Personalizar <name>" — distinguible
  // del AddedToCartDrawer que tambien es role=dialog.
  const dialog = page.getByRole("dialog", { name: /^Personalizar/i });
  await dialog.waitFor({ state: "visible", timeout: 5000 });
  await page.waitForTimeout(600);
  return dialog;
}

test("modal abre cuando el producto tiene modifierGroups", async ({ page }) => {
  const dialog = await openProductModal(page, PRODUCT_NAME);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Obligatorio").first()).toBeVisible();
});

test("CTA disabled mientras required no esta resuelto", async ({ page }) => {
  const dialog = await openProductModal(page, PRODUCT_NAME);
  await expect(dialog.getByRole("button", { name: /Completá las opciones/i })).toBeDisabled();
  await expect(dialog.getByText(/Eleg.* presa/i)).toBeVisible();
});

test("CTA habilita y muestra total cuando required satisfecho", async ({ page }) => {
  const dialog = await openProductModal(page, PRODUCT_NAME);
  await dialog.getByRole("option", { name: /Pierna/i }).click();
  await expect(dialog.getByRole("button", { name: /Agregar.*S\/.*18\.00/i })).toBeEnabled();
});

test("priceDelta de extra se suma al total final", async ({ page }) => {
  const dialog = await openProductModal(page, PRODUCT_NAME);
  await dialog.getByRole("option", { name: /Pierna/i }).click();
  await dialog.getByRole("option", { name: /Papas extra/i }).click();
  await expect(dialog.getByRole("button", { name: /Agregar.*S\/.*21\.00/i })).toBeEnabled();
});

test("multi-select respeta maxSelect (cremas máx 3)", async ({ page }) => {
  const dialog = await openProductModal(page, PRODUCT_NAME);
  await dialog.getByRole("option", { name: /Pierna/i }).click();
  await dialog.getByRole("option", { name: /Mayonesa/i }).click();
  await dialog.getByRole("option", { name: /Ketchup/i }).click();
  await dialog.getByRole("option", { name: /Mostaza/i }).click();
  // Counter debe leer 3/3
  await expect(dialog.getByText("3/3")).toBeVisible();
  // El boton de Aji deberia estar disabled (no se agrega)
  await expect(dialog.getByRole("option", { name: /^Aji$/i })).toBeDisabled();
});

test("cart unicidad: mismo producto con presas distintas → 2 lineas", async ({ page }) => {
  // Primera adicion: Pierna
  let dialog = await openProductModal(page, PRODUCT_NAME);
  await dialog.getByRole("option", { name: /Pierna/i }).click();
  await dialog.getByRole("button", { name: /Agregar.*S\/.*18\.00/i }).click();
  await page.waitForTimeout(800);
  // Cierra el AddedToCartDrawer (segundo dialog) sin navegar
  try {
    await page.keyboard.press("Escape");
  } catch {
    /* drawer may not be open — ignore */
  }
  await page.waitForTimeout(400);

  // Segunda adicion: re-abrir el modal sin navegar (preserva cart).
  // El aria-label cambia post-add a "Agregar OTRO ... (N en carrito)".
  const addBtn = page
    .locator(`button[aria-label*="${PRODUCT_NAME}"][aria-label*="al carrito"]`)
    .first();
  await addBtn.waitFor({ state: "attached", timeout: 5000 });
  await addBtn.scrollIntoViewIfNeeded();
  await addBtn.click();
  dialog = page.getByRole("dialog", { name: /^Personalizar/i });
  await dialog.waitFor({ state: "visible", timeout: 5000 });
  await page.waitForTimeout(600);
  await dialog.getByRole("option", { name: /Pecho/i }).click();
  await dialog.getByRole("button", { name: /Agregar.*S\/.*18\.00/i }).click();
  await page.waitForTimeout(800);

  const cart = await page.evaluate(() => {
    const raw = localStorage.getItem("marketplace-cart");
    return raw ? (JSON.parse(raw) as { items: Array<{ name: string; modifierHash?: string }> }) : { items: [] };
  });
  const polloLines = cart.items.filter((i) => i.name === PRODUCT_NAME);
  expect(polloLines.length).toBe(2);
  expect(polloLines[0].modifierHash).not.toBe(polloLines[1].modifierHash);
});
