/**
 * ADR-460 · «Finalizar compra» en la portada del salón (`ProveedorTienda`):
 * · Sin la portada montada, `finalizarAqui()` dice «no»: el enlace de siempre.
 * · En `/t/main` (el negocio por defecto) el checkout se abre ahí mismo y se baja;
 *   `useCheckoutAqui()` le dice al cajón que dibuje un botón (no el enlace).
 * · En `/t/<otro>` SIN barra final, no: `/api/*` resolvería `main` por el Referer
 *   (medido 08-10), así que sigue el enlace; con más ruta (`/t/<otro>/…`), sí.
 */
// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const montado = vi.fn();
vi.mock("@/extensiones/pagina-bodega-buleje-test/CheckoutEnPortada", () => ({
  CheckoutEnPortada: ({ pedido }: { pedido: boolean }) => {
    montado(pedido);
    return null;
  },
}));

import { ProveedorTienda, finalizarAqui, useCheckoutAqui } from "@/extensiones/pagina-bodega-buleje-test/ProveedorTienda";

/** Lo que lee el cajón para dibujar botón (checkout acá) o enlace. */
function Sonda() {
  return <span data-testid="aqui">{String(useCheckoutAqui())}</span>;
}

function enRuta(ruta: string) {
  window.history.replaceState(null, "", ruta);
}

afterEach(() => {
  cleanup();
  montado.mockClear();
});

describe("finalizarAqui", () => {
  it("sin la portada montada sigue el enlace", () => {
    expect(finalizarAqui()).toBe(false);
  });

  it("en /t/main abre el checkout ahí mismo y lo baja", async () => {
    enRuta("/t/main");
    const { getByTestId } = render(
      <>
        <Sonda />
        <ProveedorTienda slug="main" pagar="/t/main/tienda?carrito=abrir" />
      </>,
    );
    expect(getByTestId("aqui").textContent).toBe("true");
    let aqui = false;
    await act(async () => {
      aqui = finalizarAqui();
    });
    expect(aqui).toBe(true);
    await vi.waitFor(() => expect(montado).toHaveBeenCalledWith(true));
  });

  // Security 08-10: el Referer `/t/<negocio>` resuelve el negocio con o sin
  // barra final y sin leer la query → la portada abre el checkout en todos.
  it.each([
    ["/t/<otro> sin barra final", "/t/otro-salon"],
    ["/t/<otro> con query que trae «/»", "/t/otro-salon?utm_content=https://fb.com/x"],
    ["/t/main con query que trae «/»", "/t/main?utm_content=https://fb.com/x"],
  ])("%s: abre el checkout ahí mismo", (_nombre, ruta) => {
    enRuta(ruta);
    const slug = ruta.split(/[/?]/)[2];
    const { getByTestId } = render(
      <>
        <Sonda />
        <ProveedorTienda slug={slug} pagar={`/t/${slug}/tienda?carrito=abrir`} />
      </>,
    );
    expect(getByTestId("aqui").textContent).toBe("true");
  });

  it("con más ruta después del negocio, sí (el Referer lleva el negocio)", () => {
    enRuta("/t/otro-salon/inicio");
    render(<ProveedorTienda slug="otro-salon" pagar="/t/otro-salon/tienda?carrito=abrir" />);
    expect(finalizarAqui()).toBe(true);
  });
});
