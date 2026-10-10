/**
 * Un enlace a otra vista del MISMO hub (ola 2 del panel unificado, 10-10).
 *
 * Estando en Configuración › Sistema › Actividad, un enlace a `?tab=rendimiento`
 * cambiaba la URL a `sub=velocidad` y la pantalla seguía en Preferencias: la
 * vista pedida se leía una sola vez, al montar. Igual en Tienda online › Redes
 * con un enlace a Apariencia. Pedirla por URL sólo muestra lo que la PLANTILLA
 * escondía: el plan y el rol se siguen mirando.
 *
 * Ejecutar: npx vitest run __tests__/vista-pedida-por-enlace.test.tsx
 */
import { act, renderHook } from "@testing-library/react";
import { useMemo } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { useVistaModulo } from "@/hooks/use-vista-modulo";
import { useParamPedido } from "@/hooks/use-vistas-permitidas";
import { subvistasVisibles } from "@/components/admin/sistema/subvistas-sistema";
import { SIN_FILTRO, idsDelPlan, type ContextoPermiso } from "@/lib/admin/permiso-vista";

/** Lo que hace `irAEnlace` con el módulo montado: URL nueva + `popstate`. */
function seguirEnlace(query: string) {
  act(() => {
    window.history.replaceState(null, "", `/admin?${query}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
}

afterEach(() => {
  window.history.replaceState(null, "", "/");
  localStorage.clear();
});

describe("useParamPedido", () => {
  it("relee la URL en cada popstate, no sólo al montar", () => {
    window.history.replaceState(null, "", "/admin?tab=config&vista=sistema&sub=actividad");
    const { result } = renderHook(() => useParamPedido("sub"));
    expect(result.current).toBe("actividad");
    seguirEnlace("tab=config&vista=sistema&sub=velocidad");
    expect(result.current).toBe("velocidad");
  });

  it("lo que se elige adentro (pushState, sin popstate) no cambia lo pedido", () => {
    window.history.replaceState(null, "", "/admin?tab=pagina-inicio&vista=apariencia");
    const { result } = renderHook(() => useParamPedido("vista"));
    act(() => window.history.pushState(null, "", "/admin?tab=pagina-inicio&vista=redes"));
    expect(result.current).toBe("apariencia");
  });
});

type V = "apariencia" | "contenido" | "redes";
const VISIBLES: readonly V[] = ["redes"];

/** El hub como lo arma Tienda online: la barra = lo visible + la pedida; la vista valida contra la barra. */
function useHub() {
  const pedida = useParamPedido("vista");
  const validas = useMemo<readonly V[]>(
    () => (pedida && !VISIBLES.includes(pedida as V) ? [...VISIBLES, pedida as V] : VISIBLES),
    [pedida],
  );
  return useVistaModulo<V>("hub-test", validas, "redes");
}

describe("hub cuya barra crece con el enlace", () => {
  it("desde Redes, un enlace a Apariencia (escondida por la plantilla) cambia la pantalla", () => {
    window.history.replaceState(null, "", "/admin?tab=pagina-inicio&vista=redes");
    const { result } = renderHook(() => useHub());
    expect(result.current.vista).toBe("redes");
    seguirEnlace("tab=pagina-inicio&vista=apariencia");
    expect(result.current.vista).toBe("apariencia");
    // Y el siguiente enlace, en fila, también.
    seguirEnlace("tab=pagina-inicio&vista=contenido");
    expect(result.current.vista).toBe("contenido");
  });

  it("una vista que no existe en el hub no se inventa", () => {
    window.history.replaceState(null, "", "/admin?tab=pagina-inicio&vista=redes");
    const { result } = renderHook(() => useVistaModulo<V>("hub-test", VISIBLES, "redes"));
    seguirEnlace("tab=pagina-inicio&vista=apariencia");
    expect(result.current.vista).toBe("redes");
  });
});

describe("subvistasVisibles con la pedida", () => {
  const max: ContextoPermiso = { ...SIN_FILTRO, plan: idsDelPlan("max") };
  const escondeRendimiento: ContextoPermiso = { ...max, plantilla: (id) => id === "rendimiento" || id === "colas" };

  it("la plantilla la escondía y el enlace la pide: aparece", () => {
    const ids = (pedida: string | null) => subvistasVisibles(escondeRendimiento, true, pedida).map((s) => s.id);
    expect(ids("actividad")).not.toContain("velocidad");
    expect(ids("velocidad")).toContain("velocidad");
    expect(ids("colas")).toContain("colas");
  });

  it("pedirla por URL no se salta el plan: Básico no ve Velocidad", () => {
    const basico: ContextoPermiso = { ...SIN_FILTRO, plan: idsDelPlan("basico") };
    expect(subvistasVisibles(basico, true, "velocidad").map((s) => s.id)).toEqual(["preferencias"]);
  });
});
