// @vitest-environment jsdom
/**
 * Revisión 23-10: el recién dado (`ubicarId`) y la ficha abierta compartían el
 * registro de «ya ubicado». Como `ubicarId` no se borra, al CERRAR cualquier
 * ficha el recién dado volvía a «llegar»: borraba la búsqueda, ponía el filtro
 * en TODOS y saltaba de página. Cada uno tiene ahora su registro.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import type { DbAdelanto } from "@/lib/db/adelantos.db";

const H = vi.hoisted(() => ({ fichaId: null as string | null }));
vi.mock("@/hooks/use-ficha-en-url", () => ({
  useFichaEnUrl: () => ({ id: H.fichaId, abrir: vi.fn(), cerrar: vi.fn() }),
}));

import { useAdelantoEnUrl } from "@/components/admin/adelantos/hooks/use-adelanto-en-url";

/** 30 adelantos, del más nuevo (a0) al más viejo (a29): con 10 por página, aN cae en la página ⌊N/10⌋+1. */
const TODOS = Array.from({ length: 30 }, (_, i) => ({
  id: `a${i}`,
  codigoOperacion: `ADL-2026-${String(100 - i).padStart(4, "0")}`,
  fechaAdelanto: new Date(Date.UTC(2026, 9, 30) - i * 86_400_000).toISOString(),
  status: "PENDIENTE",
})) as unknown as DbAdelanto[];

function montar(inicial: { adelantos: DbAdelanto[]; filtrados: DbAdelanto[]; ubicarId: string | null }) {
  const setFiltro = vi.fn();
  const setQ = vi.fn();
  const setPagina = vi.fn();
  const r = renderHook(
    (p: typeof inicial) =>
      useAdelantoEnUrl({
        ...p,
        loading: false,
        orden: { columna: "fecha", direccion: "desc" },
        porPagina: 10,
        setFiltro,
        setQ,
        setPagina,
      }),
    { initialProps: inicial },
  );
  return { ...r, setFiltro, setQ, setPagina };
}

afterEach(() => {
  cleanup();
  H.fichaId = null;
});

describe("useAdelantoEnUrl: el recién dado y la ficha se ubican cada uno UNA vez", () => {
  it("cerrar una ficha no vuelve a ubicar al recién dado (no borra la búsqueda ni salta de página)", () => {
    const h = montar({ adelantos: TODOS, filtrados: TODOS, ubicarId: "a25" });
    expect(h.setPagina).toHaveBeenLastCalledWith(3);
    expect(h.result.current.resaltadoId).toBe("a25");

    // Busca algo que NO incluye al recién dado y abre su ficha.
    const buscados = [TODOS[2]];
    h.rerender({ adelantos: TODOS, filtrados: buscados, ubicarId: "a25" });
    H.fichaId = "a2";
    h.rerender({ adelantos: TODOS, filtrados: buscados, ubicarId: "a25" });
    expect(h.setPagina).toHaveBeenLastCalledWith(1);
    expect(h.result.current.resaltadoId).toBe("a2");

    h.setFiltro.mockClear();
    h.setQ.mockClear();
    h.setPagina.mockClear();
    H.fichaId = null;
    h.rerender({ adelantos: TODOS, filtrados: buscados, ubicarId: "a25" });
    h.rerender({ adelantos: TODOS, filtrados: buscados, ubicarId: "a25" });
    expect(h.setFiltro).not.toHaveBeenCalled();
    expect(h.setQ).not.toHaveBeenCalled();
    expect(h.setPagina).not.toHaveBeenCalled();
  });

  it("el recién dado se ubica cuando llega en la recarga, y filtrar después no lo vuelve a buscar", () => {
    const sinElNuevo = TODOS.slice(1);
    const h = montar({ adelantos: sinElNuevo, filtrados: sinElNuevo, ubicarId: "a0" });
    expect(h.setPagina).not.toHaveBeenCalled();

    h.rerender({ adelantos: TODOS, filtrados: TODOS, ubicarId: "a0" });
    expect(h.setPagina).toHaveBeenLastCalledWith(1);
    expect(h.result.current.resaltadoId).toBe("a0");

    h.setFiltro.mockClear();
    h.setQ.mockClear();
    h.rerender({ adelantos: TODOS, filtrados: TODOS.slice(10, 12), ubicarId: "a0" });
    expect(h.setFiltro).not.toHaveBeenCalled();
    expect(h.setQ).not.toHaveBeenCalled();
  });

  it("si la búsqueda escondía al recién dado, la limpia para mostrarlo", () => {
    const h = montar({ adelantos: TODOS, filtrados: [TODOS[3]], ubicarId: "a20" });
    expect(h.setFiltro).toHaveBeenCalledWith("TODOS");
    expect(h.setQ).toHaveBeenCalledWith("");
    h.rerender({ adelantos: TODOS, filtrados: TODOS, ubicarId: "a20" });
    expect(h.setPagina).toHaveBeenLastCalledWith(3);
  });

  it("una ficha cerrada y vuelta a abrir se ubica de nuevo", () => {
    H.fichaId = "a15";
    const h = montar({ adelantos: TODOS, filtrados: TODOS, ubicarId: null });
    expect(h.setPagina).toHaveBeenLastCalledWith(2);
    H.fichaId = null;
    h.rerender({ adelantos: TODOS, filtrados: TODOS, ubicarId: null });
    h.setPagina.mockClear();
    H.fichaId = "a15";
    h.rerender({ adelantos: TODOS, filtrados: TODOS, ubicarId: null });
    expect(h.setPagina).toHaveBeenLastCalledWith(2);
  });
});
