// @vitest-environment jsdom
/**
 * useCroquisDibujo — mover los límites de una zona del croquis (ADR-465).
 *
 * Bug del recorrido 03-10-2026: en «Editar», tocar ADENTRO de la zona que ya
 * se estaba moviendo (errarle al tirador por unos px) volvía a cargar sus
 * vértices guardados y se perdía lo arrastrado: «Moviendo QA-99 · 76 m²» →
 * «53 m²», y «Guardar» mandaba el polígono viejo.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCroquisDibujo } from "@/components/admin/forestal/hooks/use-croquis-dibujo";
import { normalizeZona, type PlantaCroquis } from "@/lib/forestal/planta-zona-types";

interface MarcaFalsa {
  ll: { lat: number; lng: number };
  h: Record<string, () => void>;
}

/** Leaflet mínimo: lo que el hook usa para dibujar los tiradores. */
function leafletFalso() {
  const marcas: MarcaFalsa[] = [];
  const L = {
    layerGroup: () => {
      const g = { addTo: () => g, clearLayers: () => { marcas.length = 0; } };
      return g;
    },
    polygon: () => {
      const p = { addTo: () => p, setLatLngs: () => p };
      return p;
    },
    circleMarker: () => {
      const c = { addTo: () => c, bindTooltip: () => c };
      return c;
    },
    divIcon: () => ({}),
    marker: (pt: [number, number]) => {
      const m: MarcaFalsa & Record<string, unknown> = { ll: { lat: pt[0], lng: pt[1] }, h: {} };
      Object.assign(m, {
        addTo: () => m,
        on: (ev: string, fn: () => void) => { m.h[ev] = fn; return m; },
        getLatLng: () => m.ll,
        setLatLng: (p: [number, number]) => { m.ll = { lat: p[0], lng: p[1] }; return m; },
      });
      marcas.push(m);
      return m;
    },
  };
  return { L, marcas };
}

const croquis: PlantaCroquis = { version: 9, anchoM: 54, altoM: 48, imagenUrl: null, maquinas: [], actualizadoEn: "2026-10-03T00:00:00.000Z" };
// Rectángulo de 8 × 5 m = 40 m².
const zona = normalizeZona({ id: "z-qa", codigo: "QA-99", nombre: "Zona QA", tipo: "patio_trozas", poligono: JSON.stringify([[21, 42], [21, 50], [26, 50], [26, 42]]), plano: "croquis" });

function montar() {
  const { L, marcas } = leafletFalso();
  const onChanged = vi.fn();
  const hook = renderHook(() => useCroquisDibujo({ LRef: { current: L }, mapRef: { current: {} }, croquis, zonas: [zona], onChanged }));
  return { hook, marcas, onChanged };
}

/** Arrastrar el tirador i a [y, x] como lo hace Leaflet: drag… y dragend. */
function arrastrar(m: MarcaFalsa, y: number, x: number) {
  m.ll = { lat: y, lng: x };
  m.h.drag?.();
  m.h.dragend?.();
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("useCroquisDibujo · mover los límites de una zona", () => {
  it("tocar adentro de la zona que ya se está moviendo no descarta los vértices arrastrados", () => {
    const { hook, marcas } = montar();
    act(() => { hook.result.current.iniciarEdicion(); });
    act(() => { hook.result.current.editarZona("z-qa"); });
    expect(Math.round(hook.result.current.area)).toBe(40);

    // El vértice [26, 50] se lleva a [28, 52]: el área crece.
    act(() => { arrastrar(marcas[2], 28, 52); });
    const movida = hook.result.current.area;
    expect(movida).toBeGreaterThan(50);

    // Toque dentro de la misma zona (el polígono está debajo de los tiradores).
    act(() => { hook.result.current.editarZona("z-qa"); });
    expect(hook.result.current.area).toBe(movida);
    expect(hook.result.current.editSel?.id).toBe("z-qa");
  });

  it("«Guardar» manda el polígono movido aunque se haya tocado adentro de la zona", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { hook, marcas, onChanged } = montar();
    act(() => { hook.result.current.iniciarEdicion(); });
    act(() => { hook.result.current.editarZona("z-qa"); });
    act(() => { arrastrar(marcas[2], 28, 52); });
    act(() => { hook.result.current.editarZona("z-qa"); });

    await act(async () => { await hook.result.current.guardarEdicion(); });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    const body = JSON.parse(String(init.body)) as { poligono: string; areaM2: number; plano: string };
    expect(JSON.parse(body.poligono)).toEqual([[21, 42], [21, 50], [28, 52], [26, 42]]);
    expect(body.plano).toBe("croquis");
    expect(body.areaM2).toBeGreaterThan(50);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("un vértice soltado fuera del terreno se ajusta al borde (54 × 48 m)", () => {
    const { hook, marcas } = montar();
    act(() => { hook.result.current.iniciarEdicion(); });
    act(() => { hook.result.current.editarZona("z-qa"); });
    act(() => { arrastrar(marcas[1], 19, 58); });
    expect(marcas[1].ll).toEqual({ lat: 19, lng: 54 });
  });

  it("tocar OTRA zona sí cambia la zona que se mueve", () => {
    const otra = normalizeZona({ id: "z-otra", codigo: "PT-08", tipo: "patio_trozas", poligono: JSON.stringify([[31, 0], [31, 9], [41, 9], [41, 0]]), plano: "croquis" });
    const { L } = leafletFalso();
    const hook = renderHook(() => useCroquisDibujo({ LRef: { current: L }, mapRef: { current: {} }, croquis, zonas: [zona, otra], onChanged: vi.fn() }));
    act(() => { hook.result.current.iniciarEdicion(); });
    act(() => { hook.result.current.editarZona("z-qa"); });
    act(() => { hook.result.current.editarZona("z-otra"); });
    expect(hook.result.current.editSel).toEqual({ id: "z-otra", codigo: "PT-08" });
    expect(Math.round(hook.result.current.area)).toBe(90);
  });
});
