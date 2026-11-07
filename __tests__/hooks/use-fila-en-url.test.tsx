/**
 * useFilaEnUrl — ⌘K ubica un registro de una lista: se resalta (y se
 * desplaza), o se avisa que no está; el parámetro se consume.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useFilaEnUrl, selectorDeFila } from "@/hooks/use-fila-en-url";
import { useGuiaSalidaBuscada } from "@/components/admin/forestal/hooks/use-guia-salida-buscada";
import type { GuiaEmitida } from "@/lib/forestal/guias-emitidas";
import { useGtfBuscadaEnUrl } from "@/components/admin/forestal/hooks/use-gtf-buscada-en-url";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }));

const BASE = "/admin?tab=rrhh&vista=asistencia";
const param = (p: string) => new URLSearchParams(window.location.search).get(p);

describe("useFilaEnUrl", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", BASE);
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => vi.useRealTimers());

  it("el id está: se resalta, se desplaza a su fila y el parámetro sale de la URL", async () => {
    const fila = document.createElement("div");
    fila.setAttribute("data-fila-url", "persona:w1");
    document.body.append(fila);
    window.history.replaceState(null, "", `${BASE}&persona=w1`);
    const { result } = renderHook(() => useFilaEnUrl("persona", { listo: true, existe: (id) => id === "w1" }));
    await waitFor(() => expect(result.current.resaltada).toBe("w1"));
    expect(result.current.noEncontrada).toBe(false);
    expect(param("persona")).toBeNull();
    await waitFor(() => expect(fila.scrollIntoView).toHaveBeenCalled());
    expect(document.querySelector(selectorDeFila("persona", "w1"))).toBe(fila);
    fila.remove();
  });

  it("el id no está: noEncontrada, nada resaltado, y también se consume", async () => {
    window.history.replaceState(null, "", `${BASE}&persona=borrado`);
    const { result } = renderHook(() => useFilaEnUrl("persona", { listo: true, existe: () => false }));
    await waitFor(() => expect(result.current.noEncontrada).toBe(true));
    expect(result.current.resaltada).toBeNull();
    expect(param("persona")).toBeNull();
  });

  it("con la lista sin cargar no decide nada ni toca la URL", () => {
    window.history.replaceState(null, "", `${BASE}&persona=w1`);
    const { result } = renderHook(() => useFilaEnUrl("persona", { listo: false, existe: () => true }));
    expect(result.current).toEqual({ resaltada: null, noEncontrada: false });
    expect(param("persona")).toBe("w1");
  });

  it("el resalte se apaga solo a los 5 s", async () => {
    window.history.replaceState(null, "", `${BASE}&persona=w1`);
    const { result } = renderHook(() => useFilaEnUrl("persona", { listo: true, existe: () => true }));
    await waitFor(() => expect(result.current.resaltada).toBe("w1"));
    await waitFor(() => expect(result.current.resaltada).toBeNull(), { timeout: 6500 });
  }, 8000);
});

describe("useGtfBuscadaEnUrl", () => {
  beforeEach(() => window.history.replaceState(null, "", "/admin?tab=loth-libro-operaciones&vista=gtf&sub=guias"));

  it("?gtf= se vuelve el foco de la lista, se consume, y se apaga al atenderlo", async () => {
    window.history.replaceState(null, "", "/admin?tab=loth-libro-operaciones&vista=gtf&sub=guias&gtf=19-001-0000771");
    const alAtender = vi.fn();
    const { result } = renderHook(() => useGtfBuscadaEnUrl(null, alAtender));
    await waitFor(() => expect(result.current.focusGtf).toBe("19-001-0000771"));
    /* Vino de ⌘K: si no existe, se dice «ya no existe» y no el aviso de «Por árbol». */
    expect(result.current.focoDeBusqueda).toBe(true);
    expect(param("gtf")).toBeNull();
    act(() => result.current.onFocusHandled());
    expect(alAtender).toHaveBeenCalledTimes(1);
    expect(result.current.focusGtf).toBeNull();
  });

  it("el foco que pide la pantalla («Por árbol») gana sobre el de la URL", async () => {
    window.history.replaceState(null, "", "/admin?tab=loth-libro-operaciones&vista=gtf&gtf=URL");
    const { result } = renderHook(() => useGtfBuscadaEnUrl("DE-LA-PANTALLA", undefined));
    expect(result.current.focusGtf).toBe("DE-LA-PANTALLA");
    expect(result.current.focoDeBusqueda).toBe(false);
  });
});

describe("useGuiaSalidaBuscada", () => {
  const BASE_CTP = "/admin?tab=ctp-libro-operaciones&vista=despacho&sub=guias";
  const g = (n: string) => ({ despachoId: `d-${n}`, gtfNumber: n }) as GuiaEmitida;
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => vi.unstubAllGlobals());

  it("la guía está en el período: se resalta sin pedir el histórico", async () => {
    window.history.replaceState(null, "", `${BASE_CTP}&gtfSalida=001-0001`);
    const { result } = renderHook(() => useGuiaSalidaBuscada([g("001-0001")], false, vi.fn()));
    await waitFor(() => expect(result.current.resaltada).toBe("001-0001"));
    expect(fetch).not.toHaveBeenCalled();
    expect(param("gtfSalida")).toBeNull();
  });

  it("es de otro período: trae sólo sus líneas del histórico", async () => {
    window.history.replaceState(null, "", `${BASE_CTP}&gtfSalida=001-0002`);
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ guias: [g("001-0002"), g("001-0003")] }) } as Response);
    const sumar = vi.fn();
    renderHook(() => useGuiaSalidaBuscada([g("001-0001")], false, sumar));
    await waitFor(() => expect(sumar).toHaveBeenCalledWith([g("001-0002")]));
  });

  it("no existe ni en el histórico: noEncontrada", async () => {
    window.history.replaceState(null, "", `${BASE_CTP}&gtfSalida=NADA`);
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ guias: [g("001-0001")] }) } as Response);
    const { result } = renderHook(() => useGuiaSalidaBuscada([g("001-0001")], false, vi.fn()));
    await waitFor(() => expect(result.current.noEncontrada).toBe(true));
    expect(param("gtfSalida")).toBeNull();
  });

  it("con la lista cargando no decide ni pide nada", () => {
    window.history.replaceState(null, "", `${BASE_CTP}&gtfSalida=001-0001`);
    const { result } = renderHook(() => useGuiaSalidaBuscada([], true, vi.fn()));
    expect(result.current).toEqual({ resaltada: null, noEncontrada: false });
    expect(fetch).not.toHaveBeenCalled();
  });
});
