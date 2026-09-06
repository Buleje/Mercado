/**
 * Piloto de regresión visual (Vitest 4 Browser Mode + toMatchScreenshot).
 *
 * Cubre 2 single-sources del marketplace (ver memoria marketplace-ux-single-sources):
 *   - PaymentMethodIcon: arte custom de métodos de pago
 *   - ProductPhotoFallback: tile "sin foto" por categoría
 *
 * Primera corrida crea baselines en __tests__/vrt/__screenshots__/;
 * corridas siguientes comparan pixel-a-pixel. Correr con `npm run test:vrt`.
 * Solo métodos SIN logo oficial (efectivo/transfer/card): yape/plin hacen
 * fallback vía onError de <img> y el timing haría flaky el screenshot.
 */
import "@/app/globals.css";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { PaymentMethodIcon, PaymentMethodChip } from "@/components/marketplace/PaymentIcons";
import { ProductPhotoFallback } from "@/components/marketplace/ProductPhotoFallback";
import { StoreAvatar } from "@/components/marketplace/StoreAvatar";

test("PaymentMethodIcon — efectivo/transfer/card matchean baseline", async () => {
  const screen = await render(
    <div
      data-testid="payment-icons"
      style={{ display: "flex", gap: 16, padding: 24, width: "fit-content", background: "#ffffff" }}
    >
      <PaymentMethodIcon method="efectivo" size="lg" />
      <PaymentMethodIcon method="transferencia" size="lg" />
      <PaymentMethodIcon method="tarjeta" size="lg" />
    </div>,
  );
  await expect(screen.getByTestId("payment-icons")).toMatchScreenshot("payment-icons-custom");
});

test("ProductPhotoFallback — tile abarrotes matchea baseline", async () => {
  const screen = await render(
    <div data-testid="photo-fallback" style={{ position: "relative", width: 240, height: 240 }}>
      <ProductPhotoFallback name="Arroz Costeño 5kg" category="abarrotes" />
    </div>,
  );
  await expect(screen.getByTestId("photo-fallback")).toMatchScreenshot("product-photo-fallback-abarrotes");
});

test("StoreAvatar — fallback de inicial matchea baseline", async () => {
  // Solo la variante SIN logo: con logo usa next/image, que necesita runtime Next.
  const screen = await render(
    <div data-testid="store-avatars" style={{ display: "flex", gap: 12, padding: 16, width: "fit-content", background: "#ffffff" }}>
      <StoreAvatar name="Bodega San Martín" size={48} />
      <StoreAvatar name="Ferretería El Tornillo" size={48} rounded="rounded-full" />
    </div>,
  );
  await expect(screen.getByTestId("store-avatars")).toMatchScreenshot("store-avatar-initials");
});

test("PaymentMethodChip — chips efectivo/transfer matchean baseline", async () => {
  const screen = await render(
    <div data-testid="payment-chips" style={{ display: "flex", gap: 8, padding: 16, width: "fit-content", background: "#ffffff" }}>
      <PaymentMethodChip method="efectivo" />
      <PaymentMethodChip method="transferencia" />
    </div>,
  );
  await expect(screen.getByTestId("payment-chips")).toMatchScreenshot("payment-chips-custom");
});
