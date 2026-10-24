/**
 * Armar escaneando: el lote se abre (POST) y después se le meten las piezas
 * (PATCH). Si el PATCH falla, el lote YA existe. Antes (revisión 26-09,
 * reproducido) el reintento abría OTRO lote y el primero quedaba vacío. Ahora
 * el reintento suma a ése.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import CtpArmarLoteEscaneando from "@/components/admin/forestal/CtpArmarLoteEscaneando";
import { useLotesAserrio } from "@/components/admin/forestal/hooks/use-lotes-aserrio";

const T1 = {
  id: "trz_aaaaaaaaaaaaaa01",
  woodEntryId: "we1",
  codigoPlanta: "118",
  codificacion: "13/A",
  especieComun: "Tornillo",
  volumenM3: 1.2,
  gtfNumber: "001-0000013",
  permiso: "19-SEC/REG-PLT-2021-017",
  guiaRecepcionada: true,
  consumidaEnId: null,
  despachadaEnId: null,
  noRecepcionada: false,
  descarte: false,
  retrozos: 0,
  loteAserrioId: null,
};

function Arnes() {
  const estado = useLotesAserrio();
  return <CtpArmarLoteEscaneando estado={estado} onArmado={() => {}} />;
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("Armar escaneando · el PATCH falla después del POST", () => {
  it("el reintento suma al lote ya abierto, no abre otro", async () => {
    window.localStorage.setItem("active-tenant-slug", "qa");
    window.localStorage.setItem("ctp-pila-escaneada:qa", JSON.stringify([T1.id]));
    let posts = 0;
    const patchA: string[] = [];
    const lotes: unknown[] = [];
    vi.stubGlobal("fetch", async (u: string, init?: RequestInit) => {
      const url = String(u);
      const m = init?.method ?? "GET";
      if (m === "POST") {
        posts += 1;
        lotes.push({ id: `L${posts}`, code: `LA-2026-00${posts}`, speciesCommon: "Tornillo", permiso: T1.permiso, status: "abierto", trozas: [], volumenM3: 0 });
        return new Response(JSON.stringify({ lote: { id: `L${posts}`, code: `LA-2026-00${posts}` } }), { status: 201 });
      }
      if (m === "PATCH") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { loteId?: string };
        patchA.push(body.loteId ?? "");
        if (patchA.length === 1) return new Response(JSON.stringify({ error: "Failed to fetch" }), { status: 503 });
        return new Response(JSON.stringify({ agregadas: 1, rechazadas: [] }), { status: 200 });
      }
      if (url.includes("/trozas/patio")) return new Response(JSON.stringify({ trozas: [T1] }), { status: 200 });
      return new Response(JSON.stringify({ lotes }), { status: 200 });
    });
    render(<Arnes />);
    fireEvent.click(await screen.findByRole("button", { name: /Crear el lote con 1 troza/ }));
    expect(await screen.findByText(/Se abrió el lote LA-2026-001 pero las trozas no entraron/)).toBeTruthy();
    expect(posts).toBe(1);

    fireEvent.click(await screen.findByRole("button", { name: /Sumar 1 .*LA-2026-001/ }));
    await waitFor(() => expect(patchA).toHaveLength(2));
    expect(patchA[1]).toBe("L1");
    expect(posts).toBe(1);
  });
});
