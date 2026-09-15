/**
 * El modal de vincular materia prima ABIERTO con la propuesta ya cargada.
 *
 * Es el camino entero, no la función pura: la libreta de códigos del cubicado →
 * el patio de `/trozas/patio` → la propuesta en pantalla → el lote elegido y
 * las trozas tildadas. Los números son los del tenant real de Blas
 * (2026-09-15): guía 010-001-0000005, permiso 10-HUA-PUE/PER-FMP-2026-007.
 *
 * Lo que se afirma acá es que la propuesta **no vincula sola**: deja todo a la
 * vista y el botón sigue esperando la confirmación.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/csrf-client", () => ({ csrfHeaders: (h: Record<string, string> = {}) => h }));

import CtpVincularMateriaPrimaModal from "@/components/admin/forestal/CtpVincularMateriaPrimaModal";
import { recordarCodigosDeCorrida } from "@/lib/forestal/codigos-de-corrida";
import type { LoteAserrio } from "@/lib/forestal/lotes-aserrio";

const GUIA = "010-001-0000005";
const PERMISO = "10-HUA-PUE/PER-FMP-2026-007";
const CORRIDA_ID = "corrida-18";

const trozaPatio = (id: string, codificacion: string, volumenM3: number, loteId: string | null) => ({
  id,
  woodEntryId: "we-1",
  codificacion,
  codigoPlanta: null,
  especieComun: "Tornillo",
  volumenM3,
  largoM: 8.5,
  gtfNumber: GUIA,
  permiso: PERMISO,
  guiaRecepcionada: true,
  fechaIngreso: "2026-08-20",
  noRecepcionada: false,
  descarte: false,
  retrozos: 0,
  consumidaEnId: null,
  despachadaEnId: null,
  loteAserrioId: loteId,
  loteAserrioCode: loteId ? "LA-2026-010" : null,
});

const LOTE: LoteAserrio = {
  id: "L1",
  code: "LA-2026-010",
  speciesCommon: "Tornillo",
  speciesScientific: null,
  status: "abierto",
  notes: null,
  fechaApertura: "2026-08-25",
  fechaConsumo: null,
  produccionEntryId: null,
  piezas: 3,
  volumenM3: 6.917,
  trozas: [
    { id: "t1", codificacion: "115-A", codigoPlanta: null, volumenM3: 2.808, largoM: 8.5, gtfNumber: GUIA, consumidaEnId: null },
    { id: "t2", codificacion: "115-B", codigoPlanta: null, volumenM3: 2.153, largoM: 8.5, gtfNumber: GUIA, consumidaEnId: null },
    /* Ésta NO la nombra ningún código: tiene que quedar destildada. */
    { id: "t3", codificacion: "999-X", codigoPlanta: null, volumenM3: 1.956, largoM: 8.5, gtfNumber: GUIA, consumidaEnId: null },
  ],
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("active-tenant-slug", "inversiones-agroforestales-blas-sociedad-anonima");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).includes("/trozas/patio")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            trozas: [
              trozaPatio("t1", "115-A", 2.808, "L1"),
              trozaPatio("t2", "115-B", 2.153, "L1"),
              trozaPatio("t3", "999-X", 1.956, "L1"),
              /* Las 49 de codificación «-» del patio real: no se proponen. */
              ...Array.from({ length: 49 }, (_, i) => trozaPatio(`g${i}`, "-", 1.2, null)),
            ],
          }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ entry: { paquetes: [] } }) };
    }),
  );
});

const abrir = (tieneMateriaPrima = false) =>
  render(
    <CtpVincularMateriaPrimaModal
      corrida={{
        id: CORRIDA_ID,
        lineNo: 18,
        especie: "Tornillo",
        producidoM3: 2.5,
        largoMaxPiezaM: null,
        fecha: "2026-08-01",
        tieneMateriaPrima,
      }}
      lotes={[LOTE]}
      onCerrar={() => {}}
      onListo={() => {}}
    />,
  );

describe("vincular con la propuesta pre-armada", () => {
  it("con códigos anotados: propone las trozas, dice guía y permiso y elige el lote", async () => {
    recordarCodigosDeCorrida(CORRIDA_ID, [{ codigo: "115-A" }, { codigo: "115-B" }, { codigo: "777-Z" }]);
    abrir();

    await waitFor(() => expect(screen.getByText(/Lo que proponen los códigos/i)).toBeInTheDocument());
    /* El origen legal, a la vista y sin tener que abrir nada. */
    const panel = within(screen.getByRole("region", { name: /Propuesta a partir de los códigos/i }));
    expect(panel.getByText(GUIA)).toBeInTheDocument();
    expect(panel.getByText(new RegExp(`permiso ${PERMISO.replace(/[/]/g, ".")}`))).toBeInTheDocument();
    expect(panel.getByText(/2 trozas/)).toBeInTheDocument();
    /* El lote de las trozas propuestas queda elegido. */
    await waitFor(() =>
      expect((screen.getByRole("combobox", { name: /Lote de aserrío/i }) as HTMLSelectElement).value).toBe("L1"),
    );
    /* Y SÓLO las trozas que los códigos nombran quedan tildadas. */
    const tildada = (codigo: string) =>
      (screen.getByLabelText(new RegExp(`Elegir la troza ${codigo}`, "i")) as HTMLInputElement).checked;
    await waitFor(() => expect(tildada("115-A")).toBe(true));
    expect(tildada("115-B")).toBe(true);
    expect(tildada("999-X")).toBe(false);
  });

  it("el código que no se encontró SE DICE, no se ignora", async () => {
    recordarCodigosDeCorrida(CORRIDA_ID, [{ codigo: "115-A" }, { codigo: "777-Z" }]);
    abrir();
    await waitFor(() => expect(screen.getByText(/1 código sin resolver/i)).toBeInTheDocument());
    expect(screen.getByText("777-Z")).toBeInTheDocument();
    expect(screen.getByText(/Ninguna troza del patio lleva ese código/i)).toBeInTheDocument();
  });

  it("el volumen que no alcanza para el 56 % se ve ANTES de confirmar", async () => {
    recordarCodigosDeCorrida(CORRIDA_ID, [{ codigo: "115-A" }]);
    abrir();
    /* 2,5 m³ declarados sobre 2,808 de troza = 89 %: entra, pero pasa el tope. */
    await waitFor(() => expect(screen.getByText(/por encima del 56 %/i)).toBeInTheDocument());
    expect(screen.getByText(/Faltan 1[.,]6[0-9]* m³ de troza/i)).toBeInTheDocument();
    /* Y nada se escribió: vincular sigue siendo un acto aparte. */
    expect(vi.mocked(fetch).mock.calls.every(([, init]) => (init as RequestInit)?.method !== "PATCH")).toBe(true);
  });

  it("a una corrida que YA tiene materia prima no se le propone un origen (ADR-364)", async () => {
    recordarCodigosDeCorrida(CORRIDA_ID, [{ codigo: "115-A" }, { codigo: "115-B" }]);
    abrir(true);
    await waitFor(() => expect(screen.getByRole("dialog", { name: /Vincular materia prima/i })).toBeInTheDocument());
    expect(screen.queryByText(/Lo que proponen los códigos/i)).not.toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/trozas/patio"))).toBe(false);
  });

  it("sin códigos anotados la pantalla queda como estaba: ni propuesta ni pedido del patio", async () => {
    abrir();
    await waitFor(() => expect(screen.getByRole("dialog", { name: /Vincular materia prima/i })).toBeInTheDocument());
    expect(screen.queryByText(/Lo que proponen los códigos/i)).not.toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/trozas/patio"))).toBe(false);
  });
});
