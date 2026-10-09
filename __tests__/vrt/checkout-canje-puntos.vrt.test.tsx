/**
 * «Canjear puntos» del checkout (vuelve 2026-10-08), renderizado de verdad
 * (Vitest 4 Browser Mode): con sesión verificada el deslizador (saldo, valor
 * en soles, tope) y la línea «Puntos canjeados» en el resumen; sin sesión,
 * el enlace «Inicia sesión para usar tus puntos».
 *
 * La 1ª corrida crea las baselines en `__screenshots__/` (falla by design).
 * Correr con `npm run test:vrt`.
 */
import "@/app/globals.css";
import { beforeEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { LazyMotion, domAnimation } from "framer-motion";
import { CheckoutPaymentSection } from "@/components/checkout/CheckoutPaymentSection";
import type { CanjePuntosProps } from "@/components/checkout/parts/CanjePuntos";

beforeEach(async () => {
  // La sección de pago mide ~1 400 px: con el alto por defecto (700) lo de
  // abajo (canje y resumen) no se pinta en la captura.
  await page.viewport(900, 1600);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } })),
  );
});

function montar(tema: "light" | "dark", canje: CanjePuntosProps, descuentoPuntos: number) {
  document.documentElement.classList.toggle("dark", tema === "dark");
  return render(
    <LazyMotion features={domAnimation}>
      <div data-testid="pago" className="w-[380px] bg-[var(--color-card)] p-4">
        <CheckoutPaymentSection
          tip={0}
          onTipChange={() => {}}
          couponCode=""
          onCouponCodeChange={() => {}}
          couponApplied={false}
          couponDiscount={0}
          couponMsg=""
          validatingCoupon={false}
          onValidateCoupon={async () => {}}
          onRemoveCoupon={() => {}}
          total={23.8}
          finalTotal={Math.round((23.8 - 1.19 - descuentoPuntos) * 100) / 100}
          discount={0}
          promo={null}
          descuentoAutomatico={{ monto: 1.19, porcentaje: 5, etiqueta: "Descuento de primera compra" }}
          loyaltyPoints={canje.saldo}
          canje={canje}
          descuentoPuntos={descuentoPuntos}
          paymentMethod="efectivo"
          onPaymentMethodChange={() => {}}
          yapeEnabled={false}
          cashEnabled
          yape={{ enabled: false }}
          yapeOpNumber=""
          onYapeOpNumberChange={() => {}}
          showPaymentHint={false}
          submitting={false}
          submitError=""
          onBack={() => {}}
        />
      </div>
    </LazyMotion>,
  );
}

for (const tema of ["light", "dark"] as const) {
  test(`Canjear puntos — ${tema}: sesión verificada con saldo y tope`, async () => {
    const screen = await montar(
      tema,
      { sesionVerificada: true, saldo: 1250, maxSoles: 11, soles: 5, onSolesChange: () => {}, onIniciarSesion: () => {} },
      5,
    );
    await expect.element(screen.getByTestId("canje-puntos")).toBeVisible();
    await expect.element(screen.getByTestId("linea-puntos-canjeados")).toHaveTextContent("Puntos canjeados");
    await expect(screen.getByTestId("pago")).toMatchScreenshot(`checkout-canje-puntos-${tema}`);
  });
}

test("Canjear puntos — light: sin sesión verificada, enlace para iniciar sesión", async () => {
  const screen = await montar(
    "light",
    { sesionVerificada: false, saldo: null, maxSoles: 0, soles: 0, onSolesChange: () => {}, onIniciarSesion: () => {} },
    0,
  );
  await expect.element(screen.getByTestId("canje-iniciar-sesion")).toHaveTextContent("Inicia sesión para usar tus puntos");
  await expect(screen.getByTestId("pago")).toMatchScreenshot("checkout-canje-puntos-invitado-light");
});
