// @vitest-environment jsdom
/**
 * useLothMapaRutas — dos arreglos del review del 29-09:
 *
 *   1. El relieve se marcaba como «ya pedido» ANTES del fetch y el cleanup
 *      descartaba la respuesta: con StrictMode (montar, desmontar, montar) la
 *      segunda pasada veía la marca y no pedía nada, y la pendiente se quedaba
 *      en «Leyendo el relieve…» para siempre.
 *   2. Ocultar la propuesta punteada en un plan la dejaba oculta en el
 *      siguiente plan de la sesión.
 */

import { StrictMode, type ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyCartografia, type LothCartografia } from "@/lib/forestal/loth-cartografia";
import { planificarExtraccion } from "@/lib/forestal/loth-planificador";
import { useLothMapaRutas } from "@/components/admin/forestal/hooks/use-loth-mapa-rutas";

const strict = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;

const propuesta = planificarExtraccion({
  arboles: [
    { id: "a1", codigo: "1", lat: -9.8, lng: -74.8, m3: 4, etapa: "en_pie" },
    { id: "a2", codigo: "2", lat: -9.801, lng: -74.801, m3: 3, etapa: "en_pie" },
  ],
  predio: [],
  rios: [],
  caminos: [],
  elevacion: null,
});

const grilla = { nx: 2, ny: 2, bbox: { sur: -9.81, oeste: -74.81, norte: -9.79, este: -74.79 }, valores: [200, 201, 202, 203] };

/** Responde después de un tick, y respeta el `signal` (como el fetch de verdad). */
function fetchLento() {
  return vi.fn((url: string, init?: RequestInit) => {
    const cuerpo = String(url).includes("/loth/geografia")
      ? { elevacion: grilla }
      : { planId: "p", propuesta, msCalculo: 1, puedeGuardar: true, arboles: { considerados: 2, sinCoordenadas: 0, excluidos: [] }, geografia: { fuentes: { osm: "2026-09-29", elevacion: null }, desdeCache: true, rios: 0, caminos: 0 } };
    return new Promise<Response>((resolve, reject) => {
      const t = setTimeout(() => resolve(new Response(JSON.stringify(cuerpo), { status: 200, headers: { "Content-Type": "application/json" } })), 5);
      init?.signal?.addEventListener("abort", () => {
        clearTimeout(t);
        reject(new DOMException("aborted", "AbortError"));
      });
    });
  });
}

const conTrocha = (): LothCartografia => ({
  ...emptyCartografia(),
  vias: [{ id: "v1", nombre: "Trocha 1", tipo: "trocha" as LothCartografia["vias"][number]["tipo"], puntos: [[-9.8, -74.8], [-9.801, -74.801]] }],
  updatedAt: "2026-09-29T10:00:00.000Z",
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useLothMapaRutas — relieve pedido a mitad de vuelo", () => {
  it("si el efecto se re-ejecuta con la misma clave (el mapa re-encuadra), la pendiente no queda en «cargando»", async () => {
    const f = fetchLento();
    vi.stubGlobal("fetch", f);
    const carto = conTrocha();
    const { result, rerender } = renderHook(
      ({ fitKey }: { fitKey: number }) => useLothMapaRutas({ planId: "p1", carto, fitKey, censoCount: 0, onEncuadrar: () => {}, onCentrar: () => {} }),
      { initialProps: { fitKey: 1 } },
    );
    expect(result.current.relieve).toBe("cargando");
    // Antes de que responda: re-encuadre (mismo plan, mismo plano).
    rerender({ fitKey: 2 });
    await waitFor(() => expect(result.current.relieve).toBe("listo"));
    expect(f.mock.calls.filter(([u]) => String(u).includes("/loth/geografia")).length).toBe(2);
  });

  it("en StrictMode también termina", async () => {
    vi.stubGlobal("fetch", fetchLento());
    const carto = conTrocha();
    const { result } = renderHook(() => useLothMapaRutas({ planId: "p1", carto, fitKey: 1, censoCount: 0, onEncuadrar: () => {}, onCentrar: () => {} }), { wrapper: strict });
    await waitFor(() => expect(result.current.relieve).toBe("listo"));
  });
});

describe("useLothMapaRutas — la propuesta oculta no pasa al plan siguiente", () => {
  it("ocultar en el plan 1 y cambiar al plan 2: la propuesta vuelve a verse", async () => {
    vi.stubGlobal("fetch", fetchLento());
    const carto = emptyCartografia();
    const { result, rerender } = renderHook(
      ({ planId }: { planId: string }) => useLothMapaRutas({ planId, carto, fitKey: 1, censoCount: 2, onEncuadrar: () => {}, onCentrar: () => {} }),
      { initialProps: { planId: "p1" } },
    );
    await waitFor(() => expect(result.current.estadoPrevia).toBe("lista"));
    expect(result.current.previa).not.toBeNull();
    act(() => result.current.ocultarPrevia());
    expect(result.current.previa).toBeNull();

    rerender({ planId: "p2" });
    await waitFor(() => expect(result.current.estadoPrevia).toBe("lista"));
    expect(result.current.previa).not.toBeNull();
  });
});
