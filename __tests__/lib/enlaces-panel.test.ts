/**
 * __tests__/lib/enlaces-panel.test.ts
 *
 * La base de los hipervínculos del panel (09-10):
 *  1. `hrefDe` da la URL REAL de cada cosa (la misma que arma su pantalla) y
 *     `null` para la que todavía no abre: un enlace a la nada es peor que texto.
 *  2. Cada parámetro de ficha está en `PARAMS_DE_VISTA`: si no, queda pegado al
 *     cambiar de módulo y volver reabre la ficha vieja (bug del `?persona=`).
 *  3. `irAEnlace` distingue mismo módulo (pushState propio) de otro módulo
 *     (`admin:navigate` + los parámetros escritos después), sin recargar.
 *  4. `useFichaEnUrl`: abrir deja entrada; cerrar saca el parámetro.
 */
import { createElement } from "react";
import { act, fireEvent, render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useSearchParams: () => null }));

import { useAdminTabs } from "@/app/admin/_hooks/useAdminTabs";
import { useAdminNavigateEvent } from "@/app/admin/_hooks/useAdminNavigateEvent";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { enlaceAlDrive } from "@/components/admin/forestal/plan-documentos/plan-documentos-api";
import { COSAS_DEL_PANEL, abreLaFicha, destinoDe, hrefDe, type CosaDelPanel } from "@/lib/admin/enlaces-panel";
import { rutaFichaDeTroza } from "@/lib/forestal/ctp-troza-url";
import { urlDelArbolEnElMapa } from "@/lib/forestal/tarjeta-troza";
import { useFichaEnUrl } from "@/hooks/use-ficha-en-url";
import { PARAMS_DE_VISTA } from "@/hooks/use-vista-modulo";

afterEach(() => {
  window.history.replaceState(null, "", "/");
  localStorage.clear();
});

describe("hrefDe — a dónde lleva cada cosa", () => {
  const casos: [CosaDelPanel, string, string][] = [
    ["permiso", "c1", "/admin?tab=ctp-libro-operaciones&vista=contratos&contrato=c1"],
    ["troza", "t1", rutaFichaDeTroza("t1")],
    ["arbol", "A-012", urlDelArbolEnElMapa("A-012")],
    ["colaborador", "k1", "/admin?tab=rrhh&vista=personal&persona=k1"],
    ["cuenta-adelantos", "benef:9", "/admin?tab=plata&vista=adelantos&accion=liquidar&persona=benef%3A9"],
    ["turno", "u1", "/admin?tab=ventas-caja&vista=arqueo&turno=u1"],
    ["carpeta", "f1", enlaceAlDrive("f1")],
  ];

  it.each(casos)("%s → su ficha", (cosa, id, url) => {
    expect(hrefDe(cosa, id)).toBe(url);
    expect(abreLaFicha(cosa)).toBe(true);
  });

  it("la galería de personas no pide id", () => {
    expect(hrefDe("personas-camaras")).toBe("/admin?tab=camaras&vista=personas");
  });

  it("sin destino o sin id → null (queda como texto)", () => {
    for (const cosa of ["gasto", "tarea", "activo", "adelanto"] as const) {
      expect(abreLaFicha(cosa)).toBe(false);
      expect(hrefDe(cosa, "id1")).toBeNull();
    }
    expect(hrefDe("troza", null)).toBeNull();
    expect(hrefDe("troza", "  ")).toBeNull();
  });

  it("las que H2/H3 abren por URL ya llevan a su ficha (09-10: lector verificado)", () => {
    /* Prendidas junto con su lector: cada `?<param>=` lo lee la pantalla de destino. */
    const casos = [
      ["ingreso", "ctp-libro-operaciones", "ingreso"],
      ["parte", "ctp-libro-operaciones", "parte"],
      ["lote", "forestal-lotes", "lote"],
      ["pedido", "pedidos", "pedido"],
      ["cliente", "clientes", "cliente"],
      ["producto", "inventario", "producto"],
      ["proveedor", "compras", "proveedor"],
      ["oc", "compras", "oc"],
    ] as const;
    for (const [cosa, tab, param] of casos) {
      expect(abreLaFicha(cosa), cosa).toBe(true);
      const href = hrefDe(cosa, "id1");
      expect(href, cosa).not.toBeNull();
      const u = new URL(href!, "http://x");
      expect(u.searchParams.get("tab"), cosa).toBe(tab);
      expect(u.searchParams.get(param), cosa).toBe("id1");
    }
  });

  it("cada parámetro de ficha se limpia al cambiar de módulo", () => {
    /* `arbol` y `accion` los borra quien los lee, al consumirlos. */
    const seConsumen = new Set(["vista", "sub", "arbol", "accion"]);
    const limpiados = new Set<string>(PARAMS_DE_VISTA);
    for (const cosa of Object.keys(COSAS_DEL_PANEL) as CosaDelPanel[]) {
      /* También los destinos planeados (abre: false): cuando se prendan, ya limpian. */
      const destino = COSAS_DEL_PANEL[cosa].destino?.("x");
      if (!destino) continue;
      for (const p of Object.keys(destino.params)) {
        if (!seConsumen.has(p)) expect(limpiados.has(p), `${cosa}: ?${p}=`).toBe(true);
      }
    }
  });
});

describe("irAEnlace — navegar sin recargar", () => {
  const montarPanel = () =>
    renderHook(() => {
      const t = useAdminTabs(() => {});
      useAdminNavigateEvent(t.navigateTab);
      return t;
    });

  it("mismo módulo: pushState, sin admin:navigate, fuera los params de la vista que se deja", () => {
    window.history.replaceState(null, "", "/admin?tab=rrhh&vista=asistencia&seccion=x&filtro=hoy");
    const oido = vi.fn();
    window.addEventListener("admin:navigate", oido);
    const pop = vi.fn();
    window.addEventListener("popstate", pop);
    const largo = window.history.length;

    expect(irAEnlace("/admin?tab=rrhh&vista=personal&persona=k1")).toBe("mismo-modulo");

    const u = new URL(window.location.href);
    expect(u.searchParams.get("vista")).toBe("personal");
    expect(u.searchParams.get("persona")).toBe("k1");
    expect(u.searchParams.get("seccion")).toBeNull();
    expect(u.searchParams.get("filtro")).toBe("hoy");
    expect(window.history.length).toBe(largo + 1);
    expect(oido).not.toHaveBeenCalled();
    expect(pop).toHaveBeenCalledTimes(1);
    window.removeEventListener("admin:navigate", oido);
    window.removeEventListener("popstate", pop);
  });

  it("otro módulo: admin:navigate cambia la pestaña y los params del destino quedan escritos", () => {
    window.history.replaceState(null, "", "/admin?tab=documentos&sub=folder&carpeta=f1");
    const { result } = montarPanel();
    const largo = window.history.length;

    act(() => {
      expect(irAEnlace("/admin?tab=pedidos&pedido=o1")).toBe("otro-modulo");
    });

    expect(result.current.tab).toBe("pedidos");
    const u = new URL(window.location.href);
    expect(u.searchParams.get("tab")).toBe("pedidos");
    expect(u.searchParams.get("pedido")).toBe("o1");
    expect(u.searchParams.get("carpeta")).toBeNull();
    expect(u.searchParams.get("sub")).toBeNull();
    expect(window.history.length).toBe(largo + 1);
  });

  it("ya estabas ahí: no deja entrada", () => {
    window.history.replaceState(null, "", "/admin?tab=pedidos&pedido=o1");
    const largo = window.history.length;
    expect(irAEnlace("/admin?tab=pedidos&pedido=o1")).toBe("ya-estabas");
    expect(window.history.length).toBe(largo);
  });
});

describe("useFichaEnUrl", () => {
  it("lee el parámetro, abrir deja entrada y cerrar lo saca", () => {
    window.history.replaceState(null, "", "/admin?tab=rrhh&vista=personal&persona=k1");
    const { result } = renderHook(() => useFichaEnUrl("persona"));
    expect(result.current.id).toBe("k1");

    /* Llegó con el link: cerrar lo borra en la misma entrada. */
    act(() => result.current.cerrar());
    expect(result.current.id).toBeNull();
    expect(new URL(window.location.href).searchParams.get("persona")).toBeNull();

    const largo = window.history.length;
    act(() => result.current.abrir("k2"));
    expect(result.current.id).toBe("k2");
    expect(window.history.length).toBe(largo + 1);
  });

  it("abierta con el enlace del nombre (mismo módulo): cerrar es «atrás», no deja dos entradas iguales", () => {
    /* `vista` sale y vuelve a entrar al final de la query: la comparación no depende del orden. */
    window.history.replaceState(null, "", "/admin?tab=rrhh&vista=personal&filtro=hoy");
    const { result } = renderHook(() => useFichaEnUrl("persona"));
    act(() => {
      expect(irAEnlace("/admin?tab=rrhh&vista=personal&persona=k1")).toBe("mismo-modulo");
    });
    expect(result.current.id).toBe("k1");

    const atras = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const reemplazo = vi.spyOn(window.history, "replaceState");
    act(() => result.current.cerrar());
    expect(atras).toHaveBeenCalledTimes(1);
    expect(reemplazo).not.toHaveBeenCalled();
    atras.mockRestore();
    reemplazo.mockRestore();
  });

  it("enlace desde OTRA vista: cerrar se queda en la vista de la ficha (replaceState)", () => {
    window.history.replaceState(null, "", "/admin?tab=rrhh&vista=asistencia&seccion=x");
    const { result } = renderHook(() => useFichaEnUrl("persona"));
    act(() => {
      irAEnlace("/admin?tab=rrhh&vista=personal&persona=k1");
    });
    const atras = vi.spyOn(window.history, "back").mockImplementation(() => {});
    act(() => result.current.cerrar());
    expect(atras).not.toHaveBeenCalled();
    expect(result.current.id).toBeNull();
    expect(new URL(window.location.href).searchParams.get("vista")).toBe("personal");
    atras.mockRestore();
  });
});

describe("EnlacePanel", () => {
  it("clic normal navega sin recargar; ctrl/cmd + clic queda para el navegador", () => {
    window.history.replaceState(null, "", "/admin?tab=rrhh&vista=personal");
    const fila = vi.fn();
    const { getByText, container } = render(
      createElement("div", { onClick: fila }, createElement(EnlacePanel, { cosa: "colaborador", id: "k1", children: "Elena" })),
    );
    /* Mismo nodo que el oyente de React y registrado después: ve lo que React
       decidió y frena la navegación de jsdom (que no la implementa). */
    const decididos: boolean[] = [];
    container.addEventListener("click", (e) => {
      decididos.push(e.defaultPrevented);
      e.preventDefault();
    });
    const a = getByText("Elena");
    expect(a.tagName).toBe("A");
    expect(a.getAttribute("href")).toBe("/admin?tab=rrhh&vista=personal&persona=k1");

    fireEvent.click(a, { ctrlKey: true });
    expect(new URL(window.location.href).searchParams.get("persona")).toBeNull();

    fireEvent.click(a);
    expect(decididos).toEqual([false, true]);
    expect(new URL(window.location.href).searchParams.get("persona")).toBe("k1");
    /* El clic no abre además la ficha de la fila que lo contiene. */
    expect(fila).not.toHaveBeenCalled();
  });

  it("cosa sin destino: texto, sin enlace", () => {
    const { container } = render(createElement(EnlacePanel, { cosa: "gasto", id: "g1", children: "Luz de octubre" }));
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toBe("Luz de octubre");
  });
});
