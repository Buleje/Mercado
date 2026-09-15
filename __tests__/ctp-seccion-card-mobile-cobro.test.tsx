/**
 * CtpSeccionCardMobile — la casilla de "cobrar en tanda" sólo en `registrado`.
 *
 * MEDIO (revisión 2026-09-14): la fila de escritorio ya sólo ofrece la casilla
 * si `e.status === "registrado"` (ADR-412 no cobra corridas anuladas), pero
 * `CtpEntriesTabla` se la pasaba a la card mobile SIN ese filtro — en celular
 * se podía marcar una corrida anulada para la tanda. El contrato de la card es
 * `marcadaCobro == null` ⇒ "esta corrida no puede marcarse" (ver el doc del
 * prop); esto prueba que una anulada llega con esa marca ausente y una
 * registrada, no.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import CtpSeccionCardMobile from "@/components/admin/forestal/CtpSeccionCardMobile";
import { puedeMarcarseParaCobro, type CtpEntry } from "@/components/admin/forestal/ctp-section-shared";

afterEach(() => {
  cleanup();
});

const entry = (o: Partial<CtpEntry> = {}): CtpEntry => ({
  id: "a",
  section: "produccion",
  lineNo: 7,
  entryDate: "2026-09-10",
  gtfIngreso: null,
  materiaPrimaRef: null,
  speciesCommon: "Tornillo",
  speciesScientific: null,
  cites: false,
  productType: "MADERA ASERRADA (COMERCIAL)",
  volumeInputM3: null,
  rendimientoPct: null,
  quantity: "1",
  unit: "m3",
  pieces: null,
  gtfNumber: null,
  destino: null,
  observations: null,
  status: "registrado",
  annulledReason: null,
  ...o,
});

/** Lo mismo que ahora arma `CtpEntriesTabla` (desktop y mobile comparten esta
 *  función): `undefined` para todo lo que no admita marcarse, sin importar
 *  qué diga la selección. */
function propsDeLaTabla(e: CtpEntry, seleccion: Set<string>) {
  const mostrarCheckboxCobro = true;
  return {
    marcadaCobro: mostrarCheckboxCobro && puedeMarcarseParaCobro(e) ? seleccion.has(e.id) : undefined,
    onMarcarCobro: mostrarCheckboxCobro && puedeMarcarseParaCobro(e) ? vi.fn() : undefined,
  };
}

describe("puedeMarcarseParaCobro", () => {
  it("sólo `registrado` puede marcarse — ADR-412 no cobra anuladas", () => {
    expect(puedeMarcarseParaCobro({ status: "registrado" })).toBe(true);
    expect(puedeMarcarseParaCobro({ status: "anulado" })).toBe(false);
  });
});

describe("CtpSeccionCardMobile — casilla de cobro sólo en corridas registradas", () => {
  it("una corrida registrada SÍ ofrece la casilla", () => {
    const e = entry({ status: "registrado" });
    render(
      <CtpSeccionCardMobile
        entry={e}
        section="produccion"
        toProductId={null}
        onChain={() => {}}
        onSendInventory={() => {}}
        onAnnul={() => {}}
        {...propsDeLaTabla(e, new Set())}
      />,
    );
    expect(screen.getByRole("checkbox", { name: /Marcar la corrida N° 7 para cobrar aserrío/i })).toBeInTheDocument();
  });

  it("una corrida ANULADA no ofrece la casilla, aunque la selección la tenga marcada", () => {
    const e = entry({ status: "anulado" });
    render(
      <CtpSeccionCardMobile
        entry={e}
        section="produccion"
        toProductId={null}
        onChain={() => {}}
        onSendInventory={() => {}}
        onAnnul={() => {}}
        {...propsDeLaTabla(e, new Set(["a"]))}
      />,
    );
    expect(screen.queryByRole("checkbox", { name: /para cobrar aserrío/i })).not.toBeInTheDocument();
  });
});
