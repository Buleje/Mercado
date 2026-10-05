import { describe, expect, it } from "vitest";
import {
  especiesLibres,
  planDeAserrio,
  resumenDelPlan,
  type PiezaPlan,
} from "@/lib/forestal/plan-aserrio";

const HOY = new Date("2026-10-05T12:00:00Z");

/** `dias` = cuántos días antes de HOY bajó del camión. */
const pieza = (id: string, o: Partial<PiezaPlan> & { dias?: number | null } = {}): PiezaPlan => {
  const { dias = 10, ...resto } = o;
  return {
    id,
    woodEntryId: "g1",
    especieComun: "Tornillo",
    volumenM3: 1,
    gtfNumber: "001",
    fechaIngreso: null,
    fechaRecepcion: dias == null ? null : new Date(HOY.getTime() - dias * 86_400_000).toISOString(),
    consumidaEnId: null,
    despachadaEnId: null,
    noRecepcionada: false,
    guiaRecepcionada: true,
    descarte: false,
    retrozos: 0,
    trozaOrigenId: null,
    loteAserrioCode: null,
    codificacion: id.toUpperCase(),
    d1Cm: 60,
    d2Cm: 58,
    largoM: 4,
    ...resto,
  };
};

const ids = (p: ReturnType<typeof planDeAserrio>) => p.grupos.flatMap((g) => g.filas.map((f) => f.id));

describe("planDeAserrio — sólo libres, la más vieja primero", () => {
  const patio = [
    pieza("a", { dias: 5 }),
    pieza("b", { dias: 40 }),
    pieza("c", { dias: 20 }),
    pieza("apartada", { dias: 90, loteAserrioCode: "L-1" }),
    pieza("aserrada", { dias: 90, consumidaEnId: "corr-1" }),
    pieza("bandeja", { dias: 90, guiaRecepcionada: false }),
    pieza("madre", { dias: 90, retrozos: 2 }),
  ];

  it("lo apartado, aserrado, en bandeja o retrozado no entra; orden por días", () => {
    const p = planDeAserrio(patio, { hoy: HOY, objetivo: { tipo: "piezas", valor: 10 } });
    expect(ids(p)).toEqual(["b", "c", "a"]);
    expect(p.alcanza).toBe(false);
    expect(p.avisos.some((a) => a.includes("no alcanza"))).toBe(true);
  });

  it("una troza que la corrida consume sale sola del plan (se recalcula en vivo)", () => {
    const antes = planDeAserrio(patio, { hoy: HOY, objetivo: { tipo: "piezas", valor: 2 } });
    expect(ids(antes)).toEqual(["b", "c"]);
    const despues = planDeAserrio(
      patio.map((t) => (t.id === "b" ? { ...t, consumidaEnId: "corr-2" } : t)),
      { hoy: HOY, objetivo: { tipo: "piezas", valor: 2 } },
    );
    expect(ids(despues)).toEqual(["c", "a"]);
  });

  it("empate de días → más volumen primero; sin fecha al final", () => {
    const p = planDeAserrio(
      [pieza("x", { dias: 10, volumenM3: 1 }), pieza("y", { dias: 10, volumenM3: 2 }), pieza("z", { dias: null })],
      { hoy: HOY, objetivo: { tipo: "piezas", valor: 3 } },
    );
    expect(ids(p)).toEqual(["y", "x", "z"]);
    expect(p.avisos.some((a) => a.includes("sin fecha"))).toBe(true);
  });
});

describe("planDeAserrio — metas de la jornada", () => {
  const patio = [pieza("a", { dias: 30, volumenM3: 2 }), pieza("b", { dias: 20, volumenM3: 1.5 }), pieza("c", { dias: 10, volumenM3: 1 })];

  it("m³: toma hasta llegar o pasar", () => {
    const p = planDeAserrio(patio, { hoy: HOY, objetivo: { tipo: "m3", valor: 3 } });
    expect(ids(p)).toEqual(["a", "b"]);
    expect(p.total.m3).toBe(3.5);
    expect(p.alcanza).toBe(true);
  });

  it("pt con el rendimiento del libro: m³ × % × 424, por troza y sumado", () => {
    const p = planDeAserrio(patio, { hoy: HOY, rendimientoPct: 50, objetivo: { tipo: "pt", valor: 400 } });
    expect(ids(p)).toEqual(["a"]);
    expect(p.grupos[0].filas[0].pt).toBe(424);
    expect(ids(planDeAserrio(patio, { hoy: HOY, rendimientoPct: 50, objetivo: { tipo: "pt", valor: 600 } }))).toEqual(["a", "b"]);
  });

  it("sin rendimiento del libro: ni pt por troza ni meta en pt (no se inventa el 56 %)", () => {
    const p = planDeAserrio(patio, { hoy: HOY, objetivo: { tipo: "pt", valor: 600 } });
    expect(p.total.piezas).toBe(0);
    expect(p.total.pt).toBeNull();
    expect(p.avisos[0]).toMatch(/Sin rendimiento del libro/);
    const porPiezas = planDeAserrio(patio, { hoy: HOY, objetivo: { tipo: "piezas", valor: 1 } });
    expect(porPiezas.grupos[0].filas[0].pt).toBeNull();
    expect(porPiezas.grupos[0].pt).toBeNull();
  });

  it("«todas las de 15 días o más»", () => {
    expect(ids(planDeAserrio(patio, { hoy: HOY, objetivo: { tipo: "dias", valor: 15 } }))).toEqual(["a", "b"]);
    const nada = planDeAserrio(patio, { hoy: HOY, objetivo: { tipo: "dias", valor: 60 } });
    expect(nada.total.piezas).toBe(0);
    expect(nada.avisos.some((a) => a.includes("la más vieja tiene 30"))).toBe(true);
  });
});

describe("planDeAserrio — especie y cambios a mano", () => {
  const patio = [
    pieza("t1", { dias: 30 }),
    pieza("t2", { dias: 20 }),
    pieza("t3", { dias: 10 }),
    pieza("c1", { dias: 50, especieComun: "Cumala" }),
  ];

  it("filtra por especie; la sugerida es la de la libre más vieja", () => {
    expect(especiesLibres(patio, HOY).map((e) => e.especie)).toEqual(["Cumala", "Tornillo"]);
    const p = planDeAserrio(patio, { hoy: HOY, especies: ["Tornillo"], objetivo: { tipo: "piezas", valor: 2 } });
    expect(ids(p)).toEqual(["t1", "t2"]);
    expect(p.disponibles.piezas).toBe(3);
  });

  it("quitar deja entrar a la siguiente; agregar suma sin sacar a nadie", () => {
    const p = planDeAserrio(patio, {
      hoy: HOY,
      especies: ["Tornillo"],
      objetivo: { tipo: "piezas", valor: 2 },
      quitadas: ["t1"],
      agregadas: ["c1"],
    });
    expect(ids(p)).toEqual(["c1", "t2", "t3"]);
    expect(p.grupos.map((g) => g.especie)).toEqual(["Cumala", "Tornillo"]);
    expect(p.grupos[0].filas[0].aMano).toBe(true);
    expect(p.fuera.map((f) => f.id)).toEqual(["t1"]);
  });

  it("agregar una que ya se aserró no hace nada", () => {
    const p = planDeAserrio([...patio, pieza("ya", { consumidaEnId: "x" })], {
      hoy: HOY,
      especies: ["Tornillo"],
      objetivo: { tipo: "piezas", valor: 1 },
      agregadas: ["ya"],
    });
    expect(ids(p)).toEqual(["t1"]);
  });
});

describe("cancha y resumen", () => {
  it("la cancha de la troza separada manda; si no, la de su carga", () => {
    const canchas = { g1: { zonaId: "z1", nombre: "Cancha 1" }, g2: { zonaId: "z2", nombre: "Cancha 2" } };
    const p = planDeAserrio(
      [pieza("a", { dias: 9, zonaId: "z2" }), pieza("b", { dias: 8 }), pieza("c", { dias: 7, woodEntryId: "g9" })],
      { hoy: HOY, canchas, objetivo: { tipo: "piezas", valor: 3 } },
    );
    expect(p.grupos[0].filas.map((f) => f.cancha)).toEqual(["Cancha 2", "Cancha 1", null]);
  });

  it("«6 de Tornillo · ≈N pt» con rendimiento; m³ sin él", () => {
    const patio = Array.from({ length: 6 }, (_, i) => pieza(`t${i}`, { dias: 20 - i }));
    const con = planDeAserrio(patio, { hoy: HOY, rendimientoPct: 25, objetivo: { tipo: "piezas", valor: 6 } });
    expect(con.total.pt).toBe(6 * 106);
    expect(resumenDelPlan(con)).toBe("6 de Tornillo · ≈636 pt");
    const sin = planDeAserrio(patio, { hoy: HOY, objetivo: { tipo: "piezas", valor: 6 } });
    expect(resumenDelPlan(sin)).toBe("6 de Tornillo · 6.000 m³");
  });
});
