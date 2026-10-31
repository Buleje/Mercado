/**
 * «Ligar con su compra» (ADR-485) — el «Listo» sobrevive a la recarga de la
 * ficha. Revisión 08-10: al completar, la ficha relee, la corrida ya no tiene
 * qué ligar (`pendiente` pasa a `false`) y el aviso se iba antes de verse.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CtpCorridaConSuCompra from "@/components/admin/forestal/CtpCorridaConSuCompra";
import type { PropuestaCompra } from "@/lib/forestal/corrida-compra";

vi.mock("@/lib/forestal/ctp-fetch", () => ({ invalidarCtp: vi.fn() }));

const propuesta = (o: Partial<PropuestaCompra> = {}): PropuestaCompra => ({
  corridaId: "c1",
  lineNo: 3,
  especie: "Cumala",
  fecha: "2026-10-02",
  declaradoM3: 0.5,
  atribuidoM3: 0,
  desdeReprocesoM3: 0,
  faltaM3: 0.5,
  filas: [{ woodEntryId: "a", gtf: "QA-SEM-002", llegada: "2026-09-29", m3: 0.5, libreM3: 3.278, costoUnitario: 300, moneda: "PEN" }],
  cubreM3: 0.5,
  quedaM3: 0,
  estado: "completa",
  motivo: null,
  guiasSinCosto: [],
  monedasMezcladas: false,
  firma: "c1|0.0000|a:0.5000",
  ...o,
});

const mockFetch = vi.fn();
beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockImplementation(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") return new Response(JSON.stringify({ propuesta: propuesta() }), { status: 200 });
    return new Response(JSON.stringify({ propuesta: propuesta() }), { status: 200 });
  });
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});
afterEach(() => vi.restoreAllMocks());

describe("CtpCorridaConSuCompra", () => {
  it("al completar, la ficha deja de estar pendiente y el «Listo» sigue a la vista", async () => {
    const { rerender } = render(<CtpCorridaConSuCompra corridaId="c1" pendiente onLigada={() => {}} />);
    await userEvent.click(await screen.findByRole("button", { name: /Ligar 0[.,]500 m³ a su compra/ }));
    await screen.findByText(/Listo: 0[.,]500 m³ quedaron ligados/);
    /* La ficha relee: ya no falta nada. */
    rerender(<CtpCorridaConSuCompra corridaId="c1" pendiente={false} onLigada={() => {}} />);
    expect(screen.getByText(/Listo: 0[.,]500 m³ quedaron ligados/)).toBeTruthy();
  });

  it("sin nada pendiente y sin haber ligado: no pide la propuesta ni dibuja nada", async () => {
    const { container } = render(<CtpCorridaConSuCompra corridaId="c1" pendiente={false} />);
    await waitFor(() => expect(container.innerHTML).toBe(""));
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
