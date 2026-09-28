// @vitest-environment jsdom
/**
 * «Registrar tala» desde el mapa del LO-TH: navega a la sección Tala con el
 * árbol elegido, deja el «atrás» volviendo al mapa y, si el libro ya montado no
 * recoge `nuevaTala`, entra por la dirección (el libro lo lee al montar).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { irARegistrarTala, urlRegistrarTala } from "@/components/admin/forestal/loth-mapa-tala-url";

describe("urlRegistrarTala", () => {
  it("arma la dirección que lee el libro, con el código escapado", () => {
    expect(urlRegistrarTala("22 A/B")).toBe("/admin?tab=loth-libro-operaciones&vista=secciones&seccion=tala&nuevaTala=22+A%2FB");
  });
});

describe("irARegistrarTala", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.history.replaceState(null, "", "/admin?tab=loth-libro-operaciones&vista=mapa");
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("desde el mapa: push (el «atrás» vuelve al mapa) + popstate para que la vista cambie", () => {
    const antes = window.history.length;
    const oidos: string[] = [];
    const onPop = () => oidos.push(window.location.search);
    window.addEventListener("popstate", onPop);
    irARegistrarTala("QA-1", () => {});
    window.removeEventListener("popstate", onPop);
    expect(window.history.length).toBe(antes + 1);
    expect(oidos).toEqual(["?tab=loth-libro-operaciones&vista=secciones&seccion=tala&nuevaTala=QA-1"]);
  });

  it("si el libro montado NO recoge el parámetro, entra por la dirección", () => {
    const entrar = vi.fn();
    irARegistrarTala("QA-1", entrar);
    vi.advanceTimersByTime(500);
    expect(entrar).toHaveBeenCalledWith("/admin?tab=loth-libro-operaciones&vista=secciones&seccion=tala&nuevaTala=QA-1");
  });

  it("si el libro lo recoge (lo borra de la URL), no recarga nada", () => {
    const entrar = vi.fn();
    const recoger = () => {
      const q = new URLSearchParams(window.location.search);
      q.delete("nuevaTala");
      window.history.replaceState(null, "", `/admin?${q.toString()}`);
    };
    window.addEventListener("popstate", recoger);
    irARegistrarTala("QA-1", entrar);
    window.removeEventListener("popstate", recoger);
    vi.advanceTimersByTime(500);
    expect(entrar).not.toHaveBeenCalled();
  });
});
