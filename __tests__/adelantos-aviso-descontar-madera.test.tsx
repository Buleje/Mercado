/**
 * «¿Descontar esta madera del adelanto?» en «Plata de la guía» (Brandon 25-10:
 * «adelanto de madera que baja solo»). Lo que se prueba es el cableado de la
 * plata, no el cálculo (ese vive en `adelantos-madera-adelanto.test.ts`):
 *
 *  - El botón manda UNA liquidación de sólo cruce: monto 0, sin caja, y el
 *    cruce = lo que falta de la guía hasta lo que te debe.
 *  - Ya descontada no se ofrece de nuevo (lo dice, sin botón).
 *  - Sin precio se pide el precio; nunca una cifra inventada.
 *  - El encargado ve el aviso pero no descuenta (como liquidar: admin o dueño).
 *  - Sin unir: «¿es la misma?» une con el PATCH de siempre y relee.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlataDeGuiaDTO } from "@/lib/forestal/plata-de-guia";
import type { usePagoDeGuia } from "@/hooks/use-plata-de-guia";

const m = vi.hoisted(() => ({
  rol: "admin" as string,
  personas: [] as unknown[],
  unir: vi.fn(),
  avisar: vi.fn(),
}));

vi.mock("@/hooks/use-mi-rol", () => ({ useMiRol: () => m.rol }));
vi.mock("@/lib/adelantos/unir-con-ficha", () => ({ unirConFicha: m.unir }));
vi.mock("@/components/admin/forestal/hooks/use-cubicaciones-trozas", () => ({
  usePersonasDeLaCuenta: () => ({ personas: m.personas, cargando: false }),
  avisarPersonasCambiaron: m.avisar,
}));

import AvisoDescontarAdelanto from "@/components/admin/forestal/costo-guia/AvisoDescontarAdelanto";

type Pago = ReturnType<typeof usePagoDeGuia>;

const linea = {
  id: "l1",
  speciesCommonName: "Tornillo",
  productType: "aserrada",
  volumeM3: 2.3,
  pieces: 10,
  status: "validado",
  entryDate: "2026-10-20",
  costoTotal: 2442.5,
  costoDetalle: { unidad: "pt", precio: 2.5, cantidadFactura: 977, ptUsado: 977 },
  ptDerivado: 975,
  congelado: false,
  periodoCerrado: false,
};

function dto(over: { pendiente?: number; cruzado?: number; totalMadera?: number | null; deAdelantos?: number; sinCuenta?: boolean } = {}): PlataDeGuiaDTO {
  const total = over.totalMadera === undefined ? 2442.5 : over.totalMadera;
  const pendiente = over.pendiente ?? 2442.5;
  const cruzado = over.cruzado ?? 0;
  return {
    gtfNumber: "QA-SEM-003",
    tipo: "compra",
    lineas: total == null ? [{ ...linea, costoTotal: null, costoDetalle: null }] : [linea],
    totalMadera: total,
    cuenta: over.sinCuenta || total == null ? null : { movimientoId: "mov1", parteId: "parte1", parteNombre: "MAMA DE ALEX", monto: total, fecha: "2026-10-20" },
    pago:
      total == null
        ? null
        : {
            gtfNumber: "QA-SEM-003",
            parteId: "parte1",
            fecha: "2026-10-20",
            monto: total,
            cubiertoDirecto: cruzado,
            cubiertoPorAntiguedad: 0,
            pagado: cruzado,
            pendiente,
            excedente: 0,
            estado: pendiente > 0 ? "pendiente" : "pagado",
            desglose: { pagado: 0, cruzado, otros: 0 },
          },
    persona: { parteId: "parte1", nombre: "Mamá de Alex", porGuias: pendiente, deAdelantos: over.deAdelantos ?? 2442, neto: 0 },
  } as unknown as PlataDeGuiaDTO;
}

function pago(over: Partial<Pago> = {}): Pago {
  return {
    cargando: false,
    cruzable: true,
    adelantosTeDebe: 2442,
    liquidaciones: [],
    registrar: vi.fn(async () => ({ ok: true as const, codigo: "LIQ-0042" })),
    recargar: vi.fn(async () => undefined),
    ...over,
  } as Pago;
}

beforeEach(() => {
  m.rol = "admin";
  m.personas = [];
  m.unir.mockReset();
  m.avisar.mockReset();
});
afterEach(cleanup);

describe("AvisoDescontarAdelanto", () => {
  it("ofrece bajar lo que falta de la guía hasta lo que te debe y manda un cruce sin caja", async () => {
    const p = pago();
    const onPagado = vi.fn();
    const { container } = render(<AvisoDescontarAdelanto dto={dto()} pago={p} onPagado={onPagado} onRecargar={vi.fn()} />);

    expect(container.querySelector('[data-aviso-adelanto="ofrecer"]')).not.toBeNull();
    expect(container.querySelector("[data-cuenta-madera]")?.textContent).toMatch(/Tornillo 977 pt × S\/\s?2\.50/);
    expect(screen.getByText(/le debes S\/\s?0\.50 por la guía/)).toBeTruthy();

    fireEvent.click(container.querySelector("[data-descontar-adelanto]") as HTMLElement);
    await waitFor(() => expect(onPagado).toHaveBeenCalledTimes(1));
    expect(p.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ monto: 0, compensar: 2442, moverCaja: false, comprobantes: [] }),
    );
    expect(onPagado.mock.calls[0][0]).toBe("LIQ-0042");
    expect(onPagado.mock.calls[0][1]).toMatch(/Bajó S\/\s?2,442\.00 del adelanto de Mamá de Alex · LIQ-0042 · guía QA-SEM-003/);
  });

  it("ya descontada: lo dice y no vuelve a ofrecer el botón", () => {
    const { container } = render(
      <AvisoDescontarAdelanto dto={dto({ pendiente: 0.5, cruzado: 2442 })} pago={pago({ adelantosTeDebe: 0 })} onPagado={vi.fn()} onRecargar={vi.fn()} />,
    );
    expect(container.querySelector('[data-aviso-adelanto="ya_descontado"]')?.textContent).toMatch(/Ya bajó S\/\s?2,442\.00/);
    expect(container.querySelector("[data-descontar-adelanto]")).toBeNull();
  });

  it("si el servidor rechaza (guía ya cubierta), muestra el motivo y no avisa «pagado»", async () => {
    const p = pago({ registrar: vi.fn(async () => ({ ok: false as const, mensaje: "La guía QA-SEM-003 ya está cubierta." })) });
    const onPagado = vi.fn();
    const { container } = render(<AvisoDescontarAdelanto dto={dto()} pago={p} onPagado={onPagado} onRecargar={vi.fn()} />);
    fireEvent.click(container.querySelector("[data-descontar-adelanto]") as HTMLElement);
    expect((await screen.findByRole("alert")).textContent).toMatch(/ya está cubierta/);
    expect(onPagado).not.toHaveBeenCalled();
  });

  it("sin precio pide el precio y no muestra ninguna cifra de madera", () => {
    const { container } = render(
      <AvisoDescontarAdelanto dto={dto({ totalMadera: null })} pago={pago()} onPagado={vi.fn()} onRecargar={vi.fn()} />,
    );
    const aviso = container.querySelector('[data-aviso-adelanto="sin_costo"]');
    expect(aviso?.textContent).toMatch(/Anota arriba el precio de esta madera/);
    expect(container.querySelector("[data-cuenta-madera]")).toBeNull();
    expect(container.querySelector("[data-descontar-adelanto]")).toBeNull();
  });

  it("el encargado ve el aviso pero no descuenta", () => {
    m.rol = "manager";
    const { container } = render(<AvisoDescontarAdelanto dto={dto()} pago={pago()} onPagado={vi.fn()} onRecargar={vi.fn()} />);
    expect(container.querySelector('[data-aviso-adelanto="ofrecer"]')).not.toBeNull();
    expect(container.querySelector("[data-descontar-adelanto]")).toBeNull();
    expect(screen.getByText(/Lo descuenta el administrador o el dueño/)).toBeTruthy();
  });

  it("sin unir: propone a la persona del mismo nombre, une con el PATCH de siempre y relee", async () => {
    m.personas = [
      { clave: "benef:b1", nombre: "Mama de Alex", beneficiarioId: "b1", parteId: null, adelantos: { abiertos: 1, teDebe: 2442 } },
      { clave: "benef:b2", nombre: "Otra persona", beneficiarioId: "b2", parteId: null, adelantos: { abiertos: 1, teDebe: 100 } },
    ];
    m.unir.mockResolvedValue({ ok: true });
    const p = pago({ cruzable: false });
    const onRecargar = vi.fn();
    const { container } = render(<AvisoDescontarAdelanto dto={dto()} pago={p} onPagado={vi.fn()} onRecargar={onRecargar} />);

    const caja = container.querySelector("[data-unir-para-descontar]");
    expect(caja?.textContent).toMatch(/MAMA DE ALEX.*es.*Mama de Alex.*mismo nombre/);
    fireEvent.click(screen.getByRole("button", { name: /Sí, únelas/ }));
    await waitFor(() => expect(onRecargar).toHaveBeenCalledTimes(1));
    expect(m.unir).toHaveBeenCalledWith("b1", "parte1");
    expect(m.avisar).toHaveBeenCalledTimes(1);
    expect(p.recargar).toHaveBeenCalledTimes(1);
  });

  it("recién anotado el precio trae la pregunta a la vista; al abrir una guía con precio, no", () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const p = pago();
    const { rerender } = render(<AvisoDescontarAdelanto dto={dto({ totalMadera: null })} pago={p} onPagado={vi.fn()} onRecargar={vi.fn()} />);
    expect(scroll).not.toHaveBeenCalled();
    /* Guardó el costo: mientras relee la cuenta no hay caja que mover. */
    rerender(<AvisoDescontarAdelanto dto={dto()} pago={{ ...p, cargando: true }} onPagado={vi.fn()} onRecargar={vi.fn()} />);
    expect(scroll).not.toHaveBeenCalled();
    rerender(<AvisoDescontarAdelanto dto={dto()} pago={p} onPagado={vi.fn()} onRecargar={vi.fn()} />);
    expect(scroll).toHaveBeenCalledTimes(1);
    rerender(<AvisoDescontarAdelanto dto={dto({ pendiente: 2000 })} pago={p} onPagado={vi.fn()} onRecargar={vi.fn()} />);
    expect(scroll).toHaveBeenCalledTimes(1);
    cleanup();
    render(<AvisoDescontarAdelanto dto={dto()} pago={pago()} onPagado={vi.fn()} onRecargar={vi.fn()} />);
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it("sin unir y sin nadie que calce: no inventa una unión", () => {
    m.personas = [{ clave: "benef:b2", nombre: "Otra persona", beneficiarioId: "b2", parteId: null, adelantos: { abiertos: 1, teDebe: 100 } }];
    const { container } = render(<AvisoDescontarAdelanto dto={dto()} pago={pago({ cruzable: false })} onPagado={vi.fn()} onRecargar={vi.fn()} />);
    expect(container.querySelector("[data-unir-para-descontar]")).toBeNull();
    expect(container.querySelector("[data-descontar-adelanto]")).toBeNull();
  });
});
