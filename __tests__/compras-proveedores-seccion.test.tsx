/**
 * Compras (plan «panel unificado», ola 3): una ficha abierta por enlace abre la
 * sección que la lee, aunque la vista ya esté montada en otra.
 *
 * Revisión 10-10: en Proveedores › Comparar, tocar un proveedor de «Precio por
 * producto» borraba `?sub=`, agregaba `?proveedor=` y avisaba con `popstate`;
 * la sección sólo releía `?sub=` (que ya no estaba), la lista nunca se montaba y
 * la ficha no abría. Lo mismo con `?oc=` desde Órdenes y recepción › Recibir.
 *
 * El enlace es el de verdad (`irAEnlace`). Cada `dynamic()` dibuja el nombre de
 * lo que importa: alcanza para saber qué sección se montó.
 *
 * Ejecutar: npx vitest run __tests__/compras-proveedores-seccion.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

vi.mock("next/dynamic", () => ({
  default: (cargar: () => Promise<unknown>) => {
    const fuente = String(cargar);
    const nombre = fuente.includes("SuppliersTab")
      ? "lista"
      : fuente.includes("CompararProveedores")
        ? "comparar"
        : fuente.includes("PurchaseOrdersTab")
          ? "ordenes"
          : fuente.includes("ReceivingTab")
            ? "recibir"
            : "otro";
    return function Dinamico() {
      return <div data-testid={`seccion-${nombre}`} />;
    };
  },
}));

import ProveedoresVista from "@/components/admin/compras/ProveedoresVista";
import OrdenesYRecepcion from "@/components/admin/compras/OrdenesYRecepcion";
import { irAEnlace, MARCA_FICHA_DESDE } from "@/components/admin/shared/ir-a-enlace";

const montada = () => screen.getAllByTestId(/^seccion-/).map((n) => n.dataset.testid);
const param = (p: string) => new URLSearchParams(window.location.search).get(p);

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("Proveedores: un proveedor por enlace abre la lista", () => {
  it("desde Comparar, el enlace a un proveedor monta la lista sin apilar otra entrada", () => {
    window.history.replaceState(null, "", "/admin?tab=compras&vista=proveedores&sub=comparar");
    render(<ProveedoresVista onCrearOC={() => {}} />);
    expect(montada()).toEqual(["seccion-comparar"]);

    const largo = window.history.length;
    act(() => {
      irAEnlace("/admin?tab=compras&vista=proveedores&proveedor=prov-1");
    });

    expect(montada()).toEqual(["seccion-lista"]);
    expect(param("proveedor")).toBe("prov-1");
    expect(param("sub")).toBe("lista");
    // Una sola entrada nueva (la del enlace), con su marca: un «atrás» vuelve a Comparar.
    expect(window.history.length).toBe(largo + 1);
    expect((window.history.state as Record<string, unknown>)[MARCA_FICHA_DESDE]).toContain("sub=comparar");
  });

  it("abierta con ?proveedor= en la URL, arranca en la lista aunque se pida Comparar", () => {
    window.history.replaceState(null, "", "/admin?tab=compras&vista=proveedores&proveedor=prov-1");
    render(<ProveedoresVista onCrearOC={() => {}} seccionInicial="comparar" />);
    expect(montada()).toEqual(["seccion-lista"]);
  });

  it("un nombre viejo (`?vista=comparador`) abre Comparar por `seccionInicial`", () => {
    window.history.replaceState(null, "", "/admin?tab=compras&vista=proveedores");
    render(<ProveedoresVista onCrearOC={() => {}} seccionInicial="comparar" />);
    expect(montada()).toEqual(["seccion-comparar"]);
    expect(param("sub")).toBe("comparar");
  });
});

describe("Órdenes y recepción: una orden por enlace abre Órdenes", () => {
  it("desde Recibir, el enlace a una orden monta Órdenes", () => {
    window.history.replaceState(null, "", "/admin?tab=compras&vista=ordenes-compra&sub=recibir");
    render(<OrdenesYRecepcion />);
    expect(montada()).toEqual(["seccion-recibir"]);

    act(() => {
      irAEnlace("/admin?tab=compras&vista=ordenes-compra&oc=oc-9");
    });

    expect(montada()).toEqual(["seccion-ordenes"]);
    expect(param("oc")).toBe("oc-9");
    expect(param("sub")).toBe("ordenes");
  });

  it("un nombre viejo (`?vista=recepcion`) abre Recibir por `seccionInicial`", () => {
    window.history.replaceState(null, "", "/admin?tab=compras&vista=ordenes-compra");
    render(<OrdenesYRecepcion seccionInicial="recibir" />);
    expect(montada()).toEqual(["seccion-recibir"]);
  });
});
