/**
 * De qué plan habla el encabezado de «Control del permiso» (04-10): el del chip
 * del libro si es uno puntual; con «Todos» o «Líneas sin permiso», el activo.
 */
import { describe, expect, it } from "vitest";
import { cuadreDelControl, planDelControl, trozasDelControl } from "@/lib/forestal/loth-control-del-plan";
import type { CuadreGuia } from "@/lib/forestal/loth-cuadre-guias";
import type { PlanFichaApi } from "@/lib/forestal/loth-ficha-permiso";
import { PLAN_SIN_PLAN, type TrozaTablero } from "@/lib/forestal/loth-tablero-trozas";

const plan = (id: string, planNumber: string, isActive = true): PlanFichaApi => ({ id, planNumber, planType: "PO", isActive, alias: null });
const ACTIVO = plan("p-activo", "001");
const OTRO = plan("p-otro", "002");
const PLANES = [OTRO, ACTIVO];

const troza = (code: string, planId: string | null) => ({ code, planId }) as unknown as TrozaTablero;
const FILAS = [troza("A-1", "p-activo"), troza("B-1", "p-otro"), troza("S-1", null)];
const guia = (gtf: string, codigos: string[]) => ({ gtf, codigos }) as unknown as CuadreGuia;

describe("planDelControl", () => {
  it("con un plan puntual en el chip, la ficha, el saldo y los vivos son de ESE plan", () => {
    const pc = planDelControl("p-otro", PLANES, ACTIVO);
    expect(pc).toMatchObject({ puntual: "p-otro", id: "p-otro" });
    expect(pc.plan?.planNumber).toBe("002");
    expect(pc.vivos[0].id).toBe("p-otro");
  });

  it("con «Todos» y con «Líneas sin permiso» sigue el activo del libro", () => {
    for (const sel of [null, PLAN_SIN_PLAN]) {
      const pc = planDelControl(sel, PLANES, ACTIVO);
      expect(pc).toMatchObject({ puntual: null, id: "p-activo" });
      expect(pc.plan?.id).toBe("p-activo");
      expect(pc.vivos[0].id).toBe("p-activo");
    }
  });

  it("un puntual que la lista todavía no trae NO cae al activo: sería mostrar otro papel", () => {
    expect(planDelControl("p-otro", null, ACTIVO).plan).toBeNull();
    expect(planDelControl("p-activo", null, ACTIVO).plan?.id).toBe("p-activo");
  });

  it("sin plan activo, con «Todos», el primero vivo (lo de siempre)", () => {
    expect(planDelControl(null, [plan("x", "9", false), OTRO], null).plan?.id).toBe("p-otro");
  });
});

describe("trozas y cuadre del control", () => {
  it("con un puntual, sólo sus trozas; con «Todos», todas", () => {
    expect(trozasDelControl(FILAS, "p-otro").map((f) => f.code)).toEqual(["B-1"]);
    expect(trozasDelControl(FILAS, null)).toHaveLength(3);
  });

  it("guías: las que cita alguna troza del plan, sin cortar la que lleva madera de dos", () => {
    const cuadre = [guia("G-ACT", ["A-1"]), guia("G-MIX", ["A-1", "B-1"]), guia("G-SUELTA", [])];
    expect(cuadreDelControl(cuadre, FILAS, "p-otro")?.map((g) => g.gtf)).toEqual(["G-MIX"]);
    expect(cuadreDelControl(cuadre, FILAS, null)).toHaveLength(3);
    expect(cuadreDelControl(null, FILAS, "p-otro")).toBeNull();
  });
});
