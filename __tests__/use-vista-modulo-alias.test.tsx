/**
 * Una vista que se fusionó con otra (Libro TH: «Analítica» → «Rentabilidad y
 * rendimiento», 2026-09-29) no puede dejar rotos los links viejos: la URL, la
 * memoria del navegador y un `irA` de otra pantalla tienen que llegar a la
 * vista que hoy la cubre, y la URL se reescribe con el nombre de hoy.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useVistaModulo } from "@/hooks/use-vista-modulo";

type V = "secciones" | "extraccion" | "rentabilidad";
const VALIDAS: readonly V[] = ["secciones", "extraccion", "rentabilidad"];
const ALIAS = { analitica: "rentabilidad" } as const;
const montar = () => renderHook(() => useVistaModulo<V>("loth-test", VALIDAS, "secciones", undefined, { alias: ALIAS }));

afterEach(() => {
  window.history.replaceState(null, "", "/");
  localStorage.clear();
});

describe("useVistaModulo con alias de vistas fusionadas", () => {
  it("?vista=analitica abre la nueva y reescribe la URL sin sumar historial", () => {
    window.history.replaceState(null, "", "/admin?tab=loth&vista=analitica");
    const antes = window.history.length;
    const { result } = montar();
    expect(result.current.vista).toBe("rentabilidad");
    expect(new URLSearchParams(window.location.search).get("vista")).toBe("rentabilidad");
    expect(window.history.length).toBe(antes);
  });

  it("?vista=rentabilidad (el nombre que se conserva) sigue igual", () => {
    window.history.replaceState(null, "", "/admin?tab=loth&vista=rentabilidad");
    const { result } = montar();
    expect(result.current.vista).toBe("rentabilidad");
  });

  it("la memoria del navegador con el nombre viejo también cae en la nueva", () => {
    localStorage.setItem("admin-last-tab-loth-test", "analitica");
    const { result } = montar();
    expect(result.current.vista).toBe("rentabilidad");
    expect(new URLSearchParams(window.location.search).get("vista")).toBe("rentabilidad");
  });

  it("irA('analitica') desde otra pantalla navega a la nueva", () => {
    const { result } = montar();
    act(() => result.current.irA("analitica"));
    expect(result.current.vista).toBe("rentabilidad");
    expect(new URLSearchParams(window.location.search).get("vista")).toBe("rentabilidad");
  });

  it("una vista desconocida sin alias sigue ignorándose", () => {
    window.history.replaceState(null, "", "/admin?vista=inventada");
    const { result } = montar();
    expect(result.current.vista).toBe("secciones");
    act(() => result.current.irA("inventada"));
    expect(result.current.vista).toBe("secciones");
  });
});
