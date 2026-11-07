/**
 * useGuiaDeIngresoEnUrl — `?ingreso=<asiento>` abre la ficha de SU guía en
 * Libro CTP → Ingresos, y la ficha cerrada saca el parámetro de la URL.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }));

import { useGuiaDeIngresoEnUrl } from "@/components/admin/forestal/hooks/use-guia-de-ingreso-en-url";
import type { GuiaIngreso } from "@/lib/forestal/ingresos-por-guia";
import type { WoodEntry } from "@/components/admin/forestal/ctp-shared";

type Guia = GuiaIngreso<WoodEntry>;
const guia = (gtf: string, ...ids: string[]) => ({ gtfNumber: gtf, lineas: ids.map((id) => ({ id })) }) as unknown as Guia;

const G1 = guia("G1", "a1", "a2");
const G2 = guia("G2", "b1");

interface Props {
  guias: Guia[];
  cargando: boolean;
  abierta: Guia | null;
}

function preparar(inicial: Partial<Props> = {}) {
  const abrir = vi.fn();
  const cerrar = vi.fn();
  const noEncontrada = vi.fn();
  const props: Props = { guias: [G1, G2], cargando: false, abierta: null, ...inicial };
  const hook = renderHook((p: Props) => useGuiaDeIngresoEnUrl({ ...p, abrir, cerrar, noEncontrada }), { initialProps: props });
  return { ...hook, props, abrir, cerrar, noEncontrada };
}

const ingresoEnUrl = () => new URLSearchParams(window.location.search).get("ingreso");

describe("useGuiaDeIngresoEnUrl", () => {
  beforeEach(() => window.history.replaceState(null, "", "/admin?tab=ctp-libro-operaciones&vista=ingresos"));
  afterEach(() => vi.unstubAllGlobals());

  it("llegar con el id de una línea abre la ficha de SU guía, recién cuando la lista llegó", () => {
    window.history.replaceState(null, "", "/admin?tab=ctp-libro-operaciones&vista=ingresos&ingreso=a2");
    const { rerender, props, abrir } = preparar({ cargando: true, guias: [] });
    expect(abrir).not.toHaveBeenCalled();
    rerender({ ...props, cargando: false, guias: [G1, G2] });
    expect(abrir).toHaveBeenCalledTimes(1);
    expect(abrir).toHaveBeenCalledWith(G1);
  });

  it("la ficha que llegó por enlace se cierra → el parámetro sale de la URL y no se reabre", () => {
    window.history.replaceState(null, "", "/admin?tab=ctp-libro-operaciones&vista=ingresos&ingreso=b1");
    const { rerender, props, abrir } = preparar();
    rerender({ ...props, abierta: G2 });
    rerender({ ...props, abierta: null });
    expect(ingresoEnUrl()).toBeNull();
    expect(abrir).toHaveBeenCalledTimes(1);
  });

  it("«Ver ficha» abre y deja el enlace copiable con la primera línea", () => {
    const { result, abrir } = preparar();
    act(() => result.current.abrirFicha(G1));
    expect(abrir).toHaveBeenCalledWith(G1);
    expect(ingresoEnUrl()).toBe("a1");
  });

  it("fuera de la página: busca la guía por la GTF del asiento", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ entry: { id: "z1", gtfNumber: "G9" } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ guias: [guia("G9", "z1")] }) });
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState(null, "", "/admin?tab=ctp-libro-operaciones&vista=ingresos&ingreso=z1");
    const { abrir, noEncontrada } = preparar();
    await waitFor(() => expect(abrir).toHaveBeenCalledTimes(1));
    expect(abrir.mock.calls[0]![0].gtfNumber).toBe("G9");
    expect(String(fetchMock.mock.calls[1]![0])).toContain("gtf=G9");
    expect(noEncontrada).not.toHaveBeenCalled();
  });

  it("un asiento que no existe: avisa y saca el parámetro", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    window.history.replaceState(null, "", "/admin?tab=ctp-libro-operaciones&vista=ingresos&ingreso=nada");
    const { abrir, noEncontrada } = preparar();
    await waitFor(() => expect(noEncontrada).toHaveBeenCalledTimes(1));
    expect(abrir).not.toHaveBeenCalled();
    expect(ingresoEnUrl()).toBeNull();
  });
});
