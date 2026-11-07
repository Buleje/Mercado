/**
 * useFichaEnUrl — la ficha abierta en `?<param>=<id>`: cerrar saca el
 * parámetro con UN solo «atrás», y cambiar de ficha no apila entradas.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useFichaEnUrl } from "@/hooks/use-ficha-en-url";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }));

const BASE = "/admin?tab=compras&vista=ordenes-compra";
const param = () => new URLSearchParams(window.location.search).get("oc");

describe("useFichaEnUrl", () => {
  beforeEach(() => window.history.replaceState(null, "", BASE));
  afterEach(() => vi.restoreAllMocks());

  it("cerrar ×2 (onSaved + onClose) = un solo «atrás»", async () => {
    const { result } = renderHook(() => useFichaEnUrl("oc"));
    act(() => result.current.abrir("A"));
    expect(param()).toBe("A");
    const atras = vi.spyOn(window.history, "back");
    act(() => {
      result.current.cerrar();
      result.current.cerrar();
    });
    expect(atras).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(param()).toBeNull());
    expect(window.location.search).toBe("?tab=compras&vista=ordenes-compra");
  });

  it("abrir A, abrir B, cerrar → sin parámetro (B reemplaza a A)", async () => {
    const { result } = renderHook(() => useFichaEnUrl("oc"));
    act(() => result.current.abrir("A"));
    const largoConA = window.history.length;
    act(() => result.current.abrir("B"));
    expect(param()).toBe("B");
    expect(window.history.length).toBe(largoConA);
    act(() => result.current.cerrar());
    await waitFor(() => expect(param()).toBeNull());
    expect(result.current.id).toBeNull();
  });

  it("después del «atrás», el próximo cierre vuelve a funcionar", async () => {
    const { result } = renderHook(() => useFichaEnUrl("oc"));
    act(() => result.current.abrir("A"));
    act(() => result.current.cerrar());
    await waitFor(() => expect(param()).toBeNull());
    act(() => result.current.abrir("A"));
    expect(param()).toBe("A");
    act(() => result.current.cerrar());
    await waitFor(() => expect(param()).toBeNull());
  });

  it("llegar con el parámetro en el link y cerrar: lo borra sin salir de la página", () => {
    window.history.replaceState(null, "", `${BASE}&oc=Z`);
    const { result } = renderHook(() => useFichaEnUrl("oc"));
    const atras = vi.spyOn(window.history, "back");
    act(() => result.current.cerrar());
    expect(atras).not.toHaveBeenCalled();
    expect(param()).toBeNull();
  });
});
