/**
 * __tests__/selector-contrato-activo-llena-el-hueco.test.tsx
 *
 * Pedido de Brandon (2026-09-19): el permiso fijado en la banda del libro
 * (`useContratoActivo`) arranca el `SelectorContrato` de un formulario en
 * blanco. Tres cosas que este default NO puede romper (ADR-421):
 *
 * 1. El documento manda: si trae `codigoSugerido` (aunque ese código todavía
 *    no sea un contrato cargado), el activo no lo reemplaza.
 * 2. Una elección hecha a mano en la sesión del formulario no se pisa.
 * 3. Editando un registro existente (`sugerirActivo={false}`), el activo
 *    nunca entra — ni cuando el registro guardó `null` ("sin contrato").
 */
import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
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

function Wrapper({
  value,
  onChange,
  codigoSugerido,
  sugerirActivo,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  codigoSugerido?: string | null;
  sugerirActivo?: boolean;
}) {
  return (
    <ContratoActivoProvider tenant={TENANT}>
      <SelectorContrato
        value={value}
        onChange={onChange}
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

describe("SelectorContrato — el activo llena el hueco, sin pisar nada", () => {
  it("formulario en blanco, sin sugerido: toma el contrato activo de la banda", async () => {
    fijarActivoEnStorage(ACTIVO);
    const onChange = vi.fn();
    render(
      <StrictMode>
        <Wrapper value={null} onChange={onChange} />
      </StrictMode>,
    );

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(ACTIVO.id));
    expect(onChange).not.toHaveBeenCalledWith(SUGERIDO.id);
  });

  it("el documento manda: con codigoSugerido resuelto, el activo NO lo reemplaza", async () => {
    fijarActivoEnStorage(ACTIVO);
    const onChange = vi.fn();
    render(<Wrapper value={null} onChange={onChange} codigoSugerido={SUGERIDO.codigo} />);

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(SUGERIDO.id));
    expect(onChange).not.toHaveBeenCalledWith(ACTIVO.id);
  });

  it("codigoSugerido huérfano (no cargado como contrato): tampoco lo llena el activo", async () => {
    fijarActivoEnStorage(ACTIVO);
    const onChange = vi.fn();
    render(<Wrapper value={null} onChange={onChange} codigoSugerido="CON-99-NUEVO-0001" />);

    // Esperamos a que la lista termine de cargar (se ve en el select habilitado)
    // y confirmamos que en ningún momento se llamó a onChange.
    await screen.findByRole("combobox");
    await waitFor(() => expect(onChange).not.toHaveBeenCalled());
  });

  it("no pisa una elección hecha a mano en esta sesión del formulario", async () => {
    fijarActivoEnStorage(ACTIVO);
    const onChange = vi.fn();
    // El usuario ya eligió otro contrato (value !== null): el efecto no debe
    // intentar reemplazarlo por el activo.
    render(<Wrapper value={SUGERIDO.id} onChange={onChange} />);

    await screen.findByRole("combobox");
    await waitFor(() => expect(onChange).not.toHaveBeenCalled());
  });

  it("editando un registro existente (sugerirActivo=false): un contrato null guardado se respeta", async () => {
    fijarActivoEnStorage(ACTIVO);
    const onChange = vi.fn();
    // Simula CtpFleteModal editando un flete cuyo `contratoId` guardado es
    // `null` ("sin contrato" elegido a mano en su momento).
    render(<Wrapper value={null} onChange={onChange} sugerirActivo={false} />);

    await screen.findByRole("combobox");
    await waitFor(() => expect(onChange).not.toHaveBeenCalled());
  });
});
