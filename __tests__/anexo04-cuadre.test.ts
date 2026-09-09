/**
 * «Me pasé por 0,003 m³»: qué medida mover para que el ANEXO N° 04 cuadre.
 *
 * La prueba no verifica que la función devuelva algo: verifica que aplicando lo
 * que sugiere, el total del anexo dé EXACTAMENTE el declarado — recalculado por
 * el mismo camino que usa la hoja (`cubicarPieza` → `construirAnexo04`), no por
 * la fórmula de la sugerencia. Es la diferencia entre probar el script propio y
 * probar el camino del usuario.
 */
import { describe, expect, it } from "vitest";
import { cubicarPieza, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import { construirAnexo04 } from "@/lib/forestal/anexo04-serfor";
import {
  ajustesParaCuadrar, filasDeCuadre, planDeCuadre, saltoMinimoM3, totalCalculado, TOL_CUADRE_M3,
} from "@/lib/forestal/anexo04-cuadre";

let seq = 0;
function pieza(cantidad: number, espesor: number, ancho: number, largo: number): PiezaCubicada {
  const dims = { cantidad, espesor, ancho, largo, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies" } as const;
  return { id: `p${++seq}`, ...dims, especie: "Tornillo", ...cubicarPieza(dims) };
}

const LOTE: PiezaCubicada[] = [
  pieza(12, 2, 8, 10), pieza(30, 6, 6, 10), pieza(20, 2, 6, 8), pieza(5, 4, 4, 12),
];

/** Aplica el ajuste como lo hace el modal (override + recubicar) y devuelve el total impreso. */
function totalTrasAplicar(filas: PiezaCubicada[], id: string, campo: string, valor: number): number {
  const editadas = filas.map((r) => {
    if (r.id !== id) return r;
    const upd = {
      ...r,
      [campo]: valor,
      ...(campo === "espesor" ? { uEspesor: "pulg" as const } : {}),
      ...(campo === "ancho" ? { uAncho: "pulg" as const } : {}),
      ...(campo === "largo" ? { uLargo: "pies" as const } : {}),
    };
    return { ...upd, ...cubicarPieza(upd) };
  });
  return construirAnexo04(editadas, { unidadV: "pt", modo: "oficial" }).totalCalculadoM3;
}

describe("ajustesParaCuadrar", () => {
  const total = totalCalculado(LOTE);

  it("sin diferencia real (menos de media milésima) no propone nada", () => {
    expect(ajustesParaCuadrar(LOTE, total)).toEqual([]);
    expect(ajustesParaCuadrar(LOTE, total + 0.0004)).toEqual([]);
  });

  it.each([0.003, 0.004, 0.005, -0.003, -0.006])(
    "con una diferencia de %s m³ la mejor sugerencia cuadra EXACTO al aplicarla",
    (delta) => {
      const objetivo = Math.round((total + delta) * 1000) / 1000;
      const [mejor] = ajustesParaCuadrar(LOTE, objetivo);
      expect(mejor).toBeTruthy();
      expect(Math.abs(mejor.restaM3)).toBeLessThan(TOL_CUADRE_M3);
      // El total REAL de la hoja después de aplicarla, no el de la sugerencia.
      const real = totalTrasAplicar(LOTE, mejor.id, mejor.campo, mejor.sugerido);
      expect(real).toBeCloseTo(objetivo, 3);
    },
  );

  it("el valor sugerido es el impreso (2 decimales) y en la unidad de la columna", () => {
    const [mejor] = ajustesParaCuadrar(LOTE, totalCalculado(LOTE) + 0.005);
    expect(mejor.sugerido).toBe(Math.round(mejor.sugerido * 100) / 100);
    expect(mejor.sugerido).toBeGreaterThan(0);
  });

  it("ningún ajuste deja MÁS diferencia de la que había", () => {
    const objetivo = total + 0.004;
    for (const a of ajustesParaCuadrar(LOTE, objetivo)) {
      expect(Math.abs(a.restaM3)).toBeLessThan(0.004);
    }
  });

  it("`soloId` acota a una medida y da sus tres dimensiones cuando llegan", () => {
    const id = LOTE[1].id;
    const solo = ajustesParaCuadrar(LOTE, total + 0.003, { soloId: id });
    expect(solo.every((a) => a.id === id)).toBe(true);
    expect(new Set(solo.map((a) => a.campo)).size).toBeGreaterThan(0);
  });

  it("una diferencia enorme no se tapa deformando una medida", () => {
    // Duplicar el anexo con una sola pieza sería un cambio de +100%: no se ofrece.
    expect(ajustesParaCuadrar(LOTE, total * 2)).toEqual([]);
  });
});

describe("filasDeCuadre", () => {
  it("lista las medidas en unidades impresas, de mayor a menor volumen", () => {
    const filas = filasDeCuadre(LOTE);
    expect(filas).toHaveLength(4);
    expect(filas[0].m3).toBeGreaterThanOrEqual(filas[1].m3);
    expect(filas.find((f) => f.id === LOTE[0].id)?.medida).toBe("2×8×10");
  });
});

describe("planDeCuadre — repartir la diferencia entre varias medidas", () => {
  const total = totalCalculado(LOTE);

  it.each([2, 3])("con %s medidas llega al objetivo y cada paso mueve una distinta", (n) => {
    const objetivo = Math.round((total + 0.05) * 1000) / 1000;
    const plan = planDeCuadre(LOTE, objetivo, { medidas: n });
    expect(plan).toBeTruthy();
    expect(plan!.pasos.length).toBeLessThanOrEqual(n);
    expect(new Set(plan!.pasos.map((p) => p.id)).size).toBe(plan!.pasos.length);
    expect(Math.abs(plan!.restaM3)).toBeLessThan(TOL_CUADRE_M3);
    // El total del plan es el que dará la hoja al aplicarlo paso por paso.
    let filas = [...LOTE];
    for (const p of plan!.pasos) {
      filas = filas.map((r) =>
        r.id === p.id ? { ...r, [p.campo]: p.sugerido, uEspesor: "pulg" as const, uAncho: "pulg" as const, uLargo: "pies" as const } : r,
      ).map((r) => ({ ...r, ...cubicarPieza(r) }));
    }
    expect(construirAnexo04(filas, { unidadV: "pt", modo: "oficial" }).totalCalculadoM3).toBeCloseTo(objetivo, 3);
  });

  it("repartir deforma MENOS cada medida que cargarlo todo en una", () => {
    const objetivo = Math.round((total + 0.06) * 1000) / 1000;
    const [una] = ajustesParaCuadrar(LOTE, objetivo);
    const plan = planDeCuadre(LOTE, objetivo, { medidas: 3 });
    const peorDelPlan = Math.max(...plan!.pasos.map((p) => p.cambioPct));
    expect(peorDelPlan).toBeLessThanOrEqual(una.cambioPct);
  });

  it("el resto de cada paso se mide contra el objetivo FINAL", () => {
    const objetivo = Math.round((total + 0.05) * 1000) / 1000;
    const plan = planDeCuadre(LOTE, objetivo, { medidas: 3 });
    // El primer paso NO puede decir «cuadra exacto» si faltan dos por mover.
    if (plan!.pasos.length > 1) {
      expect(Math.abs(plan!.pasos[0].restaM3)).toBeGreaterThan(TOL_CUADRE_M3);
    }
    expect(Math.abs(plan!.pasos.at(-1)!.restaM3)).toBeLessThan(TOL_CUADRE_M3);
  });
});

describe("modo «medidas reales» (¼ de pulgada)", () => {
  it("sugiere valores de la grilla de la sierra, no 10,04", () => {
    const objetivo = Math.round((totalCalculado(LOTE) + 0.08) * 1000) / 1000;
    for (const a of ajustesParaCuadrar(LOTE, objetivo, { modo: "real" })) {
      const grano = a.campo === "largo" ? 0.5 : 0.25;
      expect(Math.abs(Math.round(a.sugerido / grano) * grano - a.sugerido)).toBeLessThan(1e-9);
    }
  });

  it("con una diferencia de milésimas no inventa: no llega y lo dice el salto mínimo", () => {
    const objetivo = Math.round((totalCalculado(LOTE) + 0.003) * 1000) / 1000;
    expect(ajustesParaCuadrar(LOTE, objetivo, { modo: "real" })).toEqual([]);
    // El escalón más chico de esa escuadría es MAYOR que la diferencia buscada.
    expect(saltoMinimoM3(LOTE[0], "ancho", "real")).toBeGreaterThan(0.003);
  });
});
