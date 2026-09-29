// @vitest-environment jsdom
/**
 * «Registrar tala» desde el mapa del LO-TH: abre el alta ENCIMA del mapa con el
 * árbol elegido (29-09: al guardar, la etiqueta cambia ahí mismo); desde otra
 * vista, navega a la sección Tala dejando el «atrás». Si el libro ya montado
 * no recoge `nuevaTala`, entra por la dirección (el libro lo lee al montar).
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

  it("desde el mapa: el alta se abre ENCIMA del mapa (sin entrada nueva en el historial) + popstate para que el libro la abra", () => {
    const antes = window.history.length;
    const oidos: string[] = [];
    const onPop = () => oidos.push(window.location.search);
    window.addEventListener("popstate", onPop);
    irARegistrarTala("QA-1", () => {});
    window.removeEventListener("popstate", onPop);
    expect(window.history.length).toBe(antes);
    expect(oidos).toEqual(["?tab=loth-libro-operaciones&vista=mapa&seccion=tala&nuevaTala=QA-1"]);
  });

  it("desde otra vista del libro: push (el «atrás» vuelve) y pasa a la sección Tala", () => {
    window.history.replaceState(null, "", "/admin?tab=loth-libro-operaciones&vista=plan");
    const antes = window.history.length;
    irARegistrarTala("QA-1", () => {});
    expect(window.history.length).toBe(antes + 1);
    expect(window.location.search).toBe("?tab=loth-libro-operaciones&vista=secciones&seccion=tala&nuevaTala=QA-1");
  });

  it("si el libro montado NO recoge el parámetro, entra por la dirección (y se queda en el mapa)", () => {
    const entrar = vi.fn();
    irARegistrarTala("QA-1", entrar);
    vi.advanceTimersByTime(500);
    expect(entrar).toHaveBeenCalledWith("/admin?tab=loth-libro-operaciones&vista=mapa&seccion=tala&nuevaTala=QA-1");
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
