/**
 * __tests__/selector-contrato-sin-contrato-a-mano.test.tsx
 *
 * Bug medido en el navegador (2026-09-24): con un permiso activo en la banda,
 * elegir «Sin contrato» en el `SelectorContrato` volvía solo al permiso activo
 * en menos de 1,5 s. El efecto que llena el hueco veía `value == null` y no
 * distinguía «nunca se tocó» de «el usuario eligió no imputarlo». Resultado:
 * imposible registrar un ingreso sin contrato con un permiso fijado.
 *
 * Lo mismo pasaba con el código del documento (`codigoSugerido`): elegir «Sin
 * contrato» lo re-sugería. Los dos casos quedan cubiertos acá.
 *
 * El wrapper guarda el valor en estado, como los formularios reales: así el
 * `null` elegido vuelve al selector y el efecto tiene la chance de pisarlo.
 */
import { StrictMode, useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

function fijarActivoEnStorage(c: Contrato) {
  localStorage.setItem(
    `contrato-activo-${TENANT}`,
    JSON.stringify({ id: c.id, codigo: c.codigo, titular: c.titularNombre }),
  );
}

/** Registra cada valor que el selector intentó escribir. */
function Formulario({
  codigoSugerido,
  registro,
}: {
  codigoSugerido?: string | null;
  registro: (v: string | null) => void;
}) {
  const [value, setValue] = useState<string | null>(null);
  return (
    <ContratoActivoProvider tenant={TENANT}>
      <SelectorContrato
        value={value}
        onChange={(v) => {
          registro(v);
          setValue(v);
        }}
        codigoSugerido={codigoSugerido}
      />
    </ContratoActivoProvider>
  );
}

/** Más de lo que tardaba el bug (<1,5 s) en devolver el permiso. */
async function esperarQueNoVuelva() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 1_600));
  });
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

describe("SelectorContrato — «Sin contrato» elegido a mano no vuelve al permiso", () => {
  it("con permiso activo: elegir «Sin contrato» se queda en «Sin contrato»", async () => {
    fijarActivoEnStorage(ACTIVO);
    const registro = vi.fn();
    render(
      <StrictMode>
        <Formulario registro={registro} />
      </StrictMode>,
    );

    const select = (await screen.findByRole("combobox")) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe(ACTIVO.id));

    registro.mockClear();
    fireEvent.change(select, { target: { value: "" } });
    await esperarQueNoVuelva();

    expect(select.value).toBe("");
    expect(registro).toHaveBeenCalledTimes(1);
    expect(registro).toHaveBeenCalledWith(null);
    expect(screen.queryByText(/Propuesto por el permiso activo/)).toBeNull();
  });

  it("con código del documento: elegir «Sin contrato» tampoco lo re-sugiere", async () => {
    const registro = vi.fn();
    render(<Formulario registro={registro} codigoSugerido={SUGERIDO.codigo} />);

    const select = (await screen.findByRole("combobox")) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe(SUGERIDO.id));

    registro.mockClear();
    fireEvent.change(select, { target: { value: "" } });
    await esperarQueNoVuelva();

    expect(select.value).toBe("");
    expect(registro).toHaveBeenCalledTimes(1);
    expect(registro).toHaveBeenCalledWith(null);
  });

  it("sin tocar nada, el permiso activo sigue proponiéndose (lo de antes no se rompe)", async () => {
    fijarActivoEnStorage(ACTIVO);
    const registro = vi.fn();
    render(<Formulario registro={registro} />);

    const select = (await screen.findByRole("combobox")) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe(ACTIVO.id));
    expect(registro).toHaveBeenCalledWith(ACTIVO.id);
    expect(screen.getByText(/Propuesto por el permiso activo/)).toBeTruthy();
  });
});
