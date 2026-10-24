/** ADR-462: el área y la cartografía por permiso leen con el criterio de `cumplePermiso`. */
import { describe, expect, it } from "vitest";
import { alcanceDeLectura, claveGeo, leerAlcanceGeo } from "@/lib/forestal/loth-alcance-geo";
import { cumplePermiso } from "@/lib/forestal/loth-filtro-permiso";

const q = (s: string) => leerAlcanceGeo(new URLSearchParams(s));

describe("claveGeo", () => {
  it("sin plan = la clave de siempre; con plan suma el id", () => {
    expect(claveGeo("loth-parcela:", "t1")).toBe("loth-parcela:t1");
    expect(claveGeo("loth-parcela:", "t1", null)).toBe("loth-parcela:t1");
    expect(claveGeo("loth-parcela:", "t1", "cm_abc-1")).toBe("loth-parcela:t1:cm_abc-1");
  });
  it("rechaza ids malos, «sin-plan» y tenant vacío", () => {
    for (const mal of ["sin-plan", "a:b", "a b", "x".repeat(65), "../x", "a%"]) {
      expect(() => claveGeo("loth-parcela:", "t1", mal)).toThrow();
    }
    expect(() => claveGeo("loth-parcela:", "", "p1")).toThrow();
  });
});

describe("lectura por alcance (misma tabla que cumplePermiso)", () => {
  it.each([
    ["", { tipo: "negocio" }],
    ["planId=sin-plan", { tipo: "negocio" }],
    ["planId=P1&solo=1", { tipo: "plan", planId: "P1", heredar: false }],
    ["planId=P1", { tipo: "plan", planId: "P1", heredar: true }],
    ["todos=1", { tipo: "todos" }],
    ["todos=1&planId=P1&solo=1", { tipo: "todos" }],
  ])("%s", (query, esperado) => {
    const r = q(query);
    expect(r.ok && r.alcance).toEqual(esperado);
  });

  it("heredar coincide con que cumplePermiso deje pasar lo «sin plan»", () => {
    for (const query of ["planId=P1", "planId=P1&solo=1"]) {
      const r = leerAlcanceGeo(new URLSearchParams(query));
      if (!r.ok || r.alcance.tipo !== "plan") throw new Error("esperaba plan");
      const filtro = { tipo: "plan" as const, planId: "P1", conSinPlan: !query.includes("solo") };
      expect(r.alcance.heredar).toBe(cumplePermiso(null, filtro));
      expect(alcanceDeLectura(filtro).tipo).toBe("plan");
    }
  });

  it("un planId inválido es error, no un alcance", () => {
    expect(q("planId=a:b").ok).toBe(false);
    expect(q("planId=P1&solo=2").ok).toBe(false);
  });
});
