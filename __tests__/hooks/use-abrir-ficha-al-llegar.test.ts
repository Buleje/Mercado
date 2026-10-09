/**
 * useAbrirFichaAlLlegar — el lector de `?<param>=<id>` de las pantallas de la
 * bodega (pedido, cliente, producto, proveedor, orden de compra).
 */

import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAbrirFichaAlLlegar, type OpcionesAbrirFichaAlLlegar } from "@/hooks/use-abrir-ficha-al-llegar";

type Cosa = { id: string };

function preparar(inicial: Partial<OpcionesAbrirFichaAlLlegar<Cosa>> = {}) {
  const lista: Cosa[] = [{ id: "a" }, { id: "b" }];
  const abrir = vi.fn();
  const cerrar = vi.fn();
  const noEsta = vi.fn();
  const base: OpcionesAbrirFichaAlLlegar<Cosa> = {
    idEnUrl: null,
    idAbierto: null,
    listo: false,
    buscar: (id) => lista.find((c) => c.id === id),
    abrir,
    cerrar,
    noEsta,
    ...inicial,
  };
  const hook = renderHook((o: OpcionesAbrirFichaAlLlegar<Cosa>) => useAbrirFichaAlLlegar(o), { initialProps: base });
  return { ...hook, base, abrir, cerrar, noEsta };
}

describe("useAbrirFichaAlLlegar", () => {
  it("llegar con el id: abre la cosa de la lista", () => {
    const { abrir, noEsta } = preparar({ idEnUrl: "b", listo: true });
    expect(abrir).toHaveBeenCalledWith({ id: "b" });
    expect(noEsta).not.toHaveBeenCalled();
  });

  it("no está en la lista: espera a que cargue y pide `noEsta` UNA vez", () => {
    const { rerender, base, abrir, noEsta } = preparar({ idEnUrl: "zz", listo: false });
    expect(noEsta).not.toHaveBeenCalled();
    rerender({ ...base, idEnUrl: "zz", listo: true });
    expect(noEsta).toHaveBeenCalledTimes(1);
    expect(noEsta).toHaveBeenCalledWith("zz");
    /* La lista se recarga (SSE): no se vuelve a pedir. */
    rerender({ ...base, idEnUrl: "zz", listo: false });
    rerender({ ...base, idEnUrl: "zz", listo: true });
    expect(noEsta).toHaveBeenCalledTimes(1);
    expect(abrir).not.toHaveBeenCalled();
  });

  it("ya abierta (la abrió el clic): no la reabre", () => {
    const { abrir } = preparar({ idEnUrl: "a", idAbierto: "a", listo: true });
    expect(abrir).not.toHaveBeenCalled();
  });

  it("«atrás» saca el parámetro: cierra lo abierto", () => {
    const { rerender, base, cerrar } = preparar({ idEnUrl: "a", idAbierto: "a", listo: true });
    rerender({ ...base, idEnUrl: null, idAbierto: "a", listo: true });
    expect(cerrar).toHaveBeenCalledTimes(1);
  });

  it("cerrar con la X (lo abierto se va antes que el parámetro): no la reabre", () => {
    const { rerender, base, abrir } = preparar({ idEnUrl: "a", idAbierto: "a", listo: true });
    rerender({ ...base, idEnUrl: "a", idAbierto: null, listo: true });
    expect(abrir).not.toHaveBeenCalled();
  });

  it("«adelante» a otra ficha: abre la nueva", () => {
    const { rerender, base, abrir } = preparar({ idEnUrl: "a", idAbierto: "a", listo: true });
    rerender({ ...base, idEnUrl: "b", idAbierto: "a", listo: true });
    expect(abrir).toHaveBeenCalledWith({ id: "b" });
  });

  it("sin parámetro y nada abierto: no hace nada", () => {
    const { abrir, cerrar, noEsta } = preparar({ listo: true });
    expect(abrir).not.toHaveBeenCalled();
    expect(cerrar).not.toHaveBeenCalled();
    expect(noEsta).not.toHaveBeenCalled();
  });
});
