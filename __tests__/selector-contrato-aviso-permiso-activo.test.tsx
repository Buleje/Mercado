/**
 * __tests__/selector-contrato-aviso-permiso-activo.test.tsx
 *
 * Radar 2026-09-19: cuando el `SelectorContrato` lo llena el permiso activo de
 * la banda, no se distinguía de una elección propia. Ahora lo dice
 * («Propuesto por el permiso activo: …») y el aviso se va apenas el usuario
 * elige a mano. El aviso del documento (`codigoSugerido`) conserva el suyo.
 *
 * El wrapper guarda el valor en estado, como los formularios reales: así el
 * id que propone el activo vuelve al selector y el aviso se ve de verdad.
 */
import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SelectorContrato from "@/components/admin/forestal/SelectorContrato";
import { ContratoActivoProvider } from "@/contexts/contrato-activo-context";
import type { Contrato } from "@/lib/forestal/contratos";

const BASE = "/api/admin/forestal/contratos";
const LISTA = `${BASE}?balances=1`;
const CANDIDATOS = `${BASE}?candidatos=1`;

const TENANT = "test-tenant";

const contrato = (id: string, codigo: string): Contrato => ({
  id,
  codigo,
  codigoNorm: codigo,
  alias: null,
  titularNombre: "Maderera El Aguajal SAC",
  titularId: null,
  titularDoc: null,
  titularDocTipo: null,
  resolucionNumero: null,
  resolucionFecha: null,
  tipo: "CONCESION",
  arffs: null,
  region: null,
  provincia: null,
  distrito: null,
  areaHa: null,
  vigenciaDesde: null,
  vigenciaHasta: null,
  estado: "vigente",
  planId: null,
  notas: null,
  isActive: true,
  createdAt: "2026-09-18T10:00:00.000Z",
});

const ACTIVO = contrato("ctr-activo", "CON-25-UCA-0207");
const SUGERIDO = contrato("ctr-sugerido", "CON-25-PAS-0033");

/** Fija el permiso activo en localStorage ANTES de montar — así el provider
 *  lo lee ya `listo` en el primer efecto, sin depender de un segundo render. */
function fijarActivoEnStorage(c: Contrato) {
  localStorage.setItem(
    `contrato-activo-${TENANT}`,
    JSON.stringify({ id: c.id, codigo: c.codigo, titular: c.titularNombre }),
  );
}

const AVISO_ACTIVO = /Propuesto por el permiso activo/;

function Formulario({
  inicial = null,
  codigoSugerido,
  sugerirActivo,
}: {
  inicial?: string | null;
  codigoSugerido?: string | null;
  sugerirActivo?: boolean;
}) {
  const [value, setValue] = useState<string | null>(inicial);
  return (
    <ContratoActivoProvider tenant={TENANT}>
      <SelectorContrato
        value={value}
        onChange={setValue}
        codigoSugerido={codigoSugerido}
        sugerirActivo={sugerirActivo}
      />
    </ContratoActivoProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url === LISTA) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ contratos: [ACTIVO, SUGERIDO] }),
        });
      }
      if (url === CANDIDATOS) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ candidatos: [] }) });
      }
      throw new Error(`fetch inesperado: ${url}`);
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("SelectorContrato — avisa cuando lo llenó el permiso activo", () => {
  it("contrato activo → aviso visible con su código", async () => {
    fijarActivoEnStorage(ACTIVO);
    render(<Formulario />);

    const aviso = await screen.findByText(AVISO_ACTIVO);
    expect(aviso.textContent).toContain(ACTIVO.codigo);
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe(ACTIVO.id);
  });

  it("elección manual → el aviso desaparece", async () => {
    fijarActivoEnStorage(ACTIVO);
    render(<Formulario />);
    await screen.findByText(AVISO_ACTIVO);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: SUGERIDO.id } });

    await waitFor(() => expect(screen.queryByText(AVISO_ACTIVO)).toBeNull());
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe(SUGERIDO.id);
  });

  it("volver a elegir a mano el mismo activo tampoco muestra el aviso: ya es elección propia", async () => {
    fijarActivoEnStorage(ACTIVO);
    render(<Formulario />);
    await screen.findByText(AVISO_ACTIVO);

    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: SUGERIDO.id } });
    fireEvent.change(select, { target: { value: ACTIVO.id } });

    await waitFor(() => expect((select as HTMLSelectElement).value).toBe(ACTIVO.id));
    expect(screen.queryByText(AVISO_ACTIVO)).toBeNull();
  });

  it("codigoSugerido conserva su aviso propio, sin el del activo", async () => {
    fijarActivoEnStorage(ACTIVO);
    render(<Formulario codigoSugerido={SUGERIDO.codigo} />);

    const aviso = await screen.findByText(/Sugerido por el documento/);
    expect(aviso.textContent).toContain(SUGERIDO.codigo);
    expect(screen.queryByText(AVISO_ACTIVO)).toBeNull();
  });

  it("un registro que ya traía el contrato activo no lo presenta como propuesto", async () => {
    fijarActivoEnStorage(ACTIVO);
    render(<Formulario inicial={ACTIVO.id} sugerirActivo={false} />);

    await waitFor(() =>
      expect((screen.getByRole("combobox") as HTMLSelectElement).disabled).toBe(false),
    );
    expect(screen.queryByText(AVISO_ACTIVO)).toBeNull();
  });
});
