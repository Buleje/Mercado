/**
 * useFilaEnUrl — ⌘K ubica un registro de una lista: se resalta (y se
 * desplaza), o se avisa que no está; el parámetro se consume.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useFilaEnUrl, selectorDeFila } from "@/hooks/use-fila-en-url";
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
    expect(param("gtf")).toBeNull();
    act(() => result.current.onFocusHandled());
    expect(alAtender).toHaveBeenCalledTimes(1);
    expect(result.current.focusGtf).toBeNull();
  });

  it("el foco que pide la pantalla («Por árbol») gana sobre el de la URL", async () => {
    window.history.replaceState(null, "", "/admin?tab=loth-libro-operaciones&vista=gtf&gtf=URL");
    const { result } = renderHook(() => useGtfBuscadaEnUrl("DE-LA-PANTALLA", undefined));
    expect(result.current.focusGtf).toBe("DE-LA-PANTALLA");
  });
});
