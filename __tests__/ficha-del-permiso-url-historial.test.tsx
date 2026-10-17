/**
 * __tests__/ficha-del-permiso-url-historial.test.tsx
 *
 * La ficha de un permiso vive en la URL (ADR-432). Dos cosas que no pueden
 * fallar sin que nadie lo note, porque el defecto sólo se ve al tocar «atrás»:
 *
 * 1. **El chip «Ver volumen y trazabilidad» deja entrada en el historial**,
 *    también cuando ya se está en el Libro CTP. `navigateTab` al tab en el que
 *    ya se está REEMPLAZA la entrada (pensado para el clic en el módulo
 *    abierto): el «atrás» ya no volvía a Saldos (medido por el revisor 25-09).
 * 2. **`?contrato=` es de la vista Contratos**: al pasar a otra vista del libro
 *    se borra (si no, volver a «Contratos» reabre la última ficha en vez de la
 *    lista), y Saldos conserva su `?seccion=` y sus filtros como siempre.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useAdminTabs } from "@/app/admin/_hooks/useAdminTabs";
import { useAdminNavigateEvent } from "@/app/admin/_hooks/useAdminNavigateEvent";
import { abrirFichaDelPermiso } from "@/components/admin/forestal/ficha-del-permiso-url";
import { useVistaModulo, type ParamsDeVista } from "@/hooks/use-vista-modulo";

const montarPanel = () =>
  renderHook(() => {
    const t = useAdminTabs(() => {});
    useAdminNavigateEvent(t.navigateTab);
    return t;
  });

afterEach(() => {
  window.history.replaceState(null, "", "/");
  localStorage.clear();
});

describe("chip «Ver volumen y trazabilidad» → historial", () => {
  it("desde Saldos del MISMO libro agrega una entrada: el atrás vuelve a Saldos", () => {
    window.history.replaceState(null, "", "/admin?tab=ctp-libro-operaciones&vista=ingresos");
    window.history.pushState(
      null,
      "",
      "/admin?tab=ctp-libro-operaciones&vista=saldos&seccion=patio",
    );
    const antes = window.history.length;
    montarPanel();

    act(() => abrirFichaDelPermiso("ctr_B", "volumen"));

    const q = new URLSearchParams(window.location.search);
    expect(q.get("vista")).toBe("contratos");
    expect(q.get("contrato")).toBe("ctr_B");
    expect(q.get("seccion")).toBe("volumen");
    expect(window.history.length).toBe(antes + 1);
  });

  it("CONTROL: desde otro módulo también hay una entrada nueva (la pone navigateTab)", () => {
    window.history.replaceState(null, "", "/admin?tab=loth-libro-operaciones&vista=secciones");
    const antes = window.history.length;
    const { result } = montarPanel();

    act(() => abrirFichaDelPermiso("ctr_B", "trazabilidad"));

    const q = new URLSearchParams(window.location.search);
    expect(result.current.tab).toBe("ctp-libro-operaciones");
    expect(q.get("contrato")).toBe("ctr_B");
    expect(q.get("seccion")).toBe("trazabilidad");
    expect(window.history.length).toBe(antes + 1);
  });

  it("repetir el salto a la misma ficha no llena el historial de entradas iguales", () => {
    window.history.replaceState(
      null,
      "",
      "/admin?tab=ctp-libro-operaciones&vista=contratos&contrato=ctr_B&seccion=volumen",
    );
    const antes = window.history.length;
    montarPanel();
    act(() => abrirFichaDelPermiso("ctr_B", "volumen"));
    expect(window.history.length).toBe(antes);
  });
});

type Vista = "ingresos" | "saldos" | "contratos";
const VISTAS: readonly Vista[] = ["ingresos", "saldos", "contratos"];
const PROPIOS: ParamsDeVista<Vista> = { contratos: ["contrato", "seccion"] };

describe("useVistaModulo · paramsDeVista", () => {
  it("al salir de Contratos se borran `contrato` y `seccion`: volver muestra la lista", () => {
    window.history.replaceState(
      null,
      "",
      "/admin?tab=ctp-libro-operaciones&vista=contratos&contrato=ctr_B&seccion=plata",
    );
    const { result } = renderHook(() =>
      useVistaModulo<Vista>("test-ctp", VISTAS, "ingresos", undefined, { paramsDeVista: PROPIOS }),
    );
    act(() => result.current.irA("ingresos"));
    const q = new URLSearchParams(window.location.search);
    expect(q.get("vista")).toBe("ingresos");
    expect(q.has("contrato")).toBe(false);
    expect(q.has("seccion")).toBe(false);

    act(() => result.current.irA("contratos"));
    expect(new URLSearchParams(window.location.search).has("contrato")).toBe(false);
  });

  it("CONTROL: Saldos no declara nada y conserva su `seccion` y sus filtros al ir y volver", () => {
    window.history.replaceState(
      null,
      "",
      "/admin?tab=ctp-libro-operaciones&vista=saldos&seccion=capacidad&permiso=CON-25-UCA-0207",
    );
    const { result } = renderHook(() =>
      useVistaModulo<Vista>("test-ctp", VISTAS, "ingresos", undefined, { paramsDeVista: PROPIOS }),
    );
    act(() => result.current.irA("ingresos"));
    const q = new URLSearchParams(window.location.search);
    expect(q.get("seccion")).toBe("capacidad");
    expect(q.get("permiso")).toBe("CON-25-UCA-0207");
  });

  it("CONTROL: sin la opción (el resto de los módulos) no se borra nada", () => {
    window.history.replaceState(null, "", "/admin?tab=x&vista=contratos&contrato=ctr_B");
    const { result } = renderHook(() => useVistaModulo<Vista>("test-otro", VISTAS, "ingresos"));
    act(() => result.current.irA("saldos"));
    expect(new URLSearchParams(window.location.search).get("contrato")).toBe("ctr_B");
  });
});
