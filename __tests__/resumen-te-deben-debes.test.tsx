/**
 * F12 (2026-09-29) — «Te deben» y «Debes» en el Resumen de Mi Plata.
 *
 * Una sola regla: cada cifra es el total de su sección tal como lo manda su
 * ruta con `?resumen=1` (los mismos `totales` que dibuja la sección). Acá se
 * fija que el Resumen los lee sin re-sumar, soles arriba, cada moneda aparte,
 * y que una cifra que el rol no puede ver (403 → `null`) no se dibuja como un
 * cero. Las cifras de Blas son las del SELECT de sólo lectura del 29-09:
 * fiados 30 + adelantos dados 26 690 + madera WASACO 12 323,02.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { leerDeudasDelNegocio, SIN_DEUDAS } from "@/components/admin/unified/finanzas/resumen/deudas-del-negocio";
import TeDebenYDebes from "@/components/admin/unified/finanzas/resumen/TeDebenYDebes";

/** `GET /api/admin/por-cobrar?resumen=1` en Blas. */
const COBRAR_BLAS = { totales: [{ moneda: "PEN", total: 39043.02, count: 8 }], cuentas: 8 };
/** `GET /api/finanzas/por-pagar?resumen=1` en Blas: nada. */
const PAGAR_BLAS = { hoy: "2026-09-29", totales: [], porFuente: [], truncado: false, cuentas: 0 };

afterEach(cleanup);

describe("leerDeudasDelNegocio — el total de cada sección, sin re-sumar", () => {
  it("Blas: te deben S/ 39 043,02 en 8 cuentas; no debes nada", () => {
    const d = leerDeudasDelNegocio(COBRAR_BLAS, PAGAR_BLAS);
    expect(d.teDeben).toEqual({ montos: [{ moneda: "PEN", monto: 39043.02 }], cuentas: 8 });
    expect(d.debes).toEqual({ montos: [], cuentas: 0 });
    expect(d.cruzable).toEqual([]);
  });

  it("soles arriba aunque la respuesta venga en otro orden; cada moneda aparte; lo cruzable es el de «Lo que debo»", () => {
    const d = leerDeudasDelNegocio(
      { totales: [{ moneda: "USD", total: 100, count: 1 }, { moneda: "PEN", total: 500, count: 2 }], cuentas: 3 },
      { totales: [{ moneda: "PEN", total: 3031, cuentas: 1, partidas: 2, vencido: 0, cruzable: 500 }], cuentas: 1 },
    );
    expect(d.teDeben?.montos).toEqual([{ moneda: "PEN", monto: 500 }, { moneda: "USD", monto: 100 }]);
    expect(d.debes?.montos).toEqual([{ moneda: "PEN", monto: 3031 }]);
    expect(d.cruzable).toEqual([{ moneda: "PEN", monto: 500 }]);
  });

  it("un 403 o un fallo (null) no es un cero: esa cifra queda sin dibujar", () => {
    expect(leerDeudasDelNegocio(null, null)).toEqual(SIN_DEUDAS);
    expect(leerDeudasDelNegocio([], { error: "forbidden" })).toEqual(SIN_DEUDAS);
  });
});

describe("TeDebenYDebes — las dos cifras con su enlace", () => {
  it("dibuja las dos, en soles, con el enlace a cada sección", () => {
    render(<TeDebenYDebes deudas={leerDeudasDelNegocio(COBRAR_BLAS, PAGAR_BLAS)} />);
    const cobrar = screen.getByTestId("resumen-por-cobrar");
    const pagar = screen.getByTestId("resumen-por-pagar");
    expect(cobrar.textContent).toContain("Te deben");
    expect(cobrar.textContent).toContain("39,043.02");
    expect(cobrar.textContent).toContain("en 8 cuentas");
    expect(pagar.textContent).toContain("Debes");
    expect(pagar.textContent).toContain("No le debes a nadie");
    expect(screen.getByRole("button", { name: /^Te deben: S\/ 39,043\.02\. Ver Por cobrar$/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Debes: No le debes a nadie\. Ver Lo que debo$/ })).toBeTruthy();
    // Un botón, no un enlace: NavProgress tapa la pantalla con cualquier <a> interno
    // que no cambie el pathname (sólo cambia ?vista=).
    expect(cobrar.querySelector("a")).toBeNull();
  });

  it("otra moneda va en su propia línea, sin sumarse a los soles", () => {
    render(<TeDebenYDebes deudas={leerDeudasDelNegocio({ totales: [{ moneda: "PEN", total: 500, count: 2 }, { moneda: "USD", total: 100, count: 1 }], cuentas: 3 }, null)} />);
    const cobrar = screen.getByTestId("resumen-por-cobrar");
    expect(cobrar.textContent).toContain("S/ 500.00");
    expect(cobrar.textContent).toContain("USD 100.00");
    expect(cobrar.textContent).not.toContain("600");
    // «Debes» no se pudo leer: no hay tarjeta con un cero inventado.
    expect(screen.queryByTestId("resumen-por-pagar")).toBeNull();
  });

  it("sin ninguna de las dos (rol sin permiso), no dibuja nada", () => {
    const { container } = render(<TeDebenYDebes deudas={SIN_DEUDAS} />);
    expect(container.innerHTML).toBe("");
  });

  it("el clic cambia de vista dentro de Mi Plata (sin recargar)", () => {
    window.history.replaceState(null, "", "/admin?tab=plata&vista=resumen");
    render(<TeDebenYDebes deudas={leerDeudasDelNegocio(COBRAR_BLAS, PAGAR_BLAS)} />);
    fireEvent.click(screen.getByRole("button", { name: /Ver Lo que debo$/ }));
    expect(new URLSearchParams(window.location.search).get("vista")).toBe("por-pagar");
    expect(new URLSearchParams(window.location.search).get("tab")).toBe("plata");
  });

  it("cuando a las mismas personas les debes y te deben, lo dice sin restar", () => {
    render(
      <TeDebenYDebes
        deudas={leerDeudasDelNegocio(
          { totales: [{ moneda: "PEN", total: 12353.02, count: 2 }], cuentas: 2 },
          { totales: [{ moneda: "PEN", total: 3031, cuentas: 1, partidas: 2, vencido: 0, cruzable: 3031 }], cuentas: 1 },
        )}
      />,
    );
    expect(screen.getByTestId("resumen-por-cobrar").textContent).toContain("12,353.02");
    expect(screen.getByTestId("resumen-por-pagar").textContent).toContain("3,031.00");
    // Sin prometer que Liquidar lo cruza: con dos adelantos (dado y recibido) el
    // modal sólo ofrece «Me pagó» (medido 29-09 en `main`).
    expect(screen.getByText(/de esto es entre las mismas personas/).textContent).toContain("3,031.00");
  });
});
