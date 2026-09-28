/**
 * El acta de consumo con trozas en la fila de otra especie (Blas 27-09).
 *
 * Lo que fija, por el camino del operario:
 *  - el acta NO dice «la guía no cuadra»: un aviso para todas las guías, con
 *    «Acomodar trozas» (no «Cuadrar la guía») y «Consumir» apagado;
 *  - el acomodo se abre ENCIMA del acta, con esas guías y el lote;
 *  - al volver con el patio releído (cada troza en su fila), el acta recalcula
 *    sin cerrarse y deja consumir;
 *  - quien no es admin/dueño ve el botón apagado y a quién pedírselo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import type { LoteAserrio } from "@/lib/forestal/lotes-aserrio";

const H = vi.hoisted(() => ({
  rol: "admin" as string | null,
  alcance: null as unknown,
  opts: null as unknown,
  aplicar: vi.fn(async () => ({ movidas: 2, m3Movidos: 7.269, yaNoSePudieron: 0, guias: 1 })),
}));
vi.mock("@/hooks/use-mi-rol", () => ({ useMiRol: () => H.rol }));
vi.mock("@/components/admin/forestal/hooks/use-jornadas-produccion", () => ({
  useJornadasDeProduccion: () => ({ porDia: new Map(), cargando: false, error: null }),
}));
vi.mock("@/hooks/use-acomodar-trozas", () => ({
  useAcomodarTrozas: (alcance: unknown, opts: unknown) => {
    H.alcance = alcance;
    H.opts = opts;
    return {
      plan: {
        guias: [],
        totales: {
          guias: 1,
          guiasConCambios: 1,
          trozas: 2,
          mover: 2,
          m3Mover: 7.269,
          quietas: 0,
          sinFila: 0,
          bienPuestas: 0,
          filasQueCuadranAntes: 0,
          filasQueCuadranDespues: 2,
          filas: 2,
        },
      },
      cargando: false,
      aplicando: false,
      error: null,
      resultado: null,
      aplicar: H.aplicar,
    };
  },
}));

const { default: CtpConsumirLoteModal } = await import("@/components/admin/forestal/CtpConsumirLoteModal");

const lote = { id: "lote-011", code: "LA-2026-011", speciesCommon: "Cachimbo" } as LoteAserrio;

/** 0000009 de Blas: dos trozas de Cachimbo en la fila de Yacuchapana (8,309 m³). */
const enOtraFila = (): TrozaConsumible[] => [
  {
    id: "157A",
    woodEntryId: "yacuchapana-09",
    codificacion: "157A",
    especieComun: "Cachimbo",
    gtfNumber: "010-001-0000009",
    volumenM3: 4.469,
    guiaEspecie: "Yacuchapana",
    guiaVolumenM3: 8.309,
    guiaConsumidoM3: 0,
    filaDeSuEspecieId: "cachimbo-09",
    loteAserrioId: "lote-011",
  },
  {
    id: "157B",
    woodEntryId: "yacuchapana-09",
    codificacion: "157B",
    especieComun: "Cachimbo",
    gtfNumber: "010-001-0000009",
    volumenM3: 2.8,
    guiaEspecie: "Yacuchapana",
    guiaVolumenM3: 8.309,
    guiaConsumidoM3: 0,
    filaDeSuEspecieId: "cachimbo-09",
    loteAserrioId: "lote-011",
  },
];
/** Las mismas, ya en la fila de Cachimbo (10,677 m³). */
const acomodadas = (): TrozaConsumible[] =>
  enOtraFila().map((t) => ({ ...t, woodEntryId: "cachimbo-09", guiaEspecie: "Cachimbo", guiaVolumenM3: 10.677, filaDeSuEspecieId: null }));

const props = (trozas: TrozaConsumible[], onAcomodado = vi.fn()) => ({
  lote,
  trozas,
  fecha: "2026-09-26",
  yaEnElLote: new Set(trozas.map((t) => t.id)),
  guardando: false,
  error: null,
  onConfirmar: vi.fn(),
  onCuadrar: vi.fn(),
  onAcomodado,
  onClose: vi.fn(),
});

beforeEach(() => {
  H.rol = "admin";
  H.alcance = null;
  H.opts = null;
  H.aplicar.mockClear();
});
afterEach(cleanup);

const consumir = () => screen.getByRole("button", { name: /^Consumir$/ });

describe("acta con trozas en la fila de otra especie", () => {
  it("dice «acomodar», no «cuadrar», y no deja firmar", () => {
    render(<CtpConsumirLoteModal {...props(enOtraFila())} />);
    expect(screen.getByText("La guía 010-001-0000009 tiene sus trozas en otra fila")).toBeTruthy();
    expect(screen.getByText("La guía está bien: solo hay que acomodar sus trozas.")).toBeTruthy();
    expect(screen.queryByText(/no cuadra consigo misma/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Cuadrar la guía/ })).toBeNull();
    expect((consumir() as HTMLButtonElement).disabled).toBe(true);
  });

  it("«Acomodar trozas» abre el acomodo encima, con esas guías y el lote; al volver, el acta deja consumir", async () => {
    const onAcomodado = vi.fn();
    const { rerender } = render(<CtpConsumirLoteModal {...props(enOtraFila(), onAcomodado)} />);
    fireEvent.click(screen.getByRole("button", { name: /Acomodar trozas/ }));
    expect(H.alcance).toEqual({ woodEntryIds: ["yacuchapana-09"] });
    expect(H.opts).toEqual({ loteId: "lote-011" });
    expect(screen.getByText("Acomodar trozas en su especie")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Acomodar 2 trozas/ }));
    await vi.waitFor(() => expect(onAcomodado).toHaveBeenCalledTimes(1));

    /* Quien abrió el acta releyó el patio: llegan las mismas piezas en su fila. */
    rerender(<CtpConsumirLoteModal {...props(acomodadas(), onAcomodado)} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Cancelar" }).at(-1)!);
    expect(screen.queryByText(/tiene sus trozas en otra fila/)).toBeNull();
    expect((consumir() as HTMLButtonElement).disabled).toBe(false);
  });

  it("un almacenero ve el botón apagado y a quién pedírselo", () => {
    H.rol = "almacenero";
    render(<CtpConsumirLoteModal {...props(enOtraFila())} />);
    expect((screen.getByRole("button", { name: /Acomodar trozas/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Pídeselo al administrador/)).toBeTruthy();
  });
});
