import { describe, expect, it } from "vitest";
import {
  CLAVE_DESDE,
  TOPE_USO,
  contadorALista,
  listaAContador,
  ordenPorUso,
  sumarUso,
  unirContadores,
  type ContadorDeUso,
} from "@/lib/admin/orden-por-uso";

const DIA = 86_400_000;
const AHORA = Date.UTC(2026, 9, 19, 15);
const IDS = ["resumen", "gastos", "bancos", "deudas", "metas"] as const;

/** Contador con `dias` de datos y las vistas dadas (`[id, veces, hace cuántos días]`). */
function contador(dias: number, usos: [string, number, number][]): ContadorDeUso {
  const c: ContadorDeUso = { [CLAVE_DESDE]: { n: 0, ultima: AHORA - dias * DIA } };
  for (const [id, n, hace] of usos) c[`plata:${id}`] = { n, ultima: AHORA - hace * DIA };
  return c;
}

describe("ordenPorUso", () => {
  it("sin datos: el orden de siempre y nada al «Más»", () => {
    expect(ordenPorUso(IDS, null, "plata", AHORA)).toEqual({ visiblesEnOrden: [...IDS], aMas: [], aplicado: false });
    expect(ordenPorUso(IDS, {}, "plata", AHORA).aplicado).toBe(false);
  });

  it("con menos de 7 días de datos no reordena aunque haya uso", () => {
    const c = contador(6, [["metas", 40, 0], ["bancos", 10, 1]]);
    expect(ordenPorUso(IDS, c, "plata", AHORA)).toEqual({ visiblesEnOrden: [...IDS], aMas: [], aplicado: false });
  });

  it("con 7 días: de más a menos uso; las no abiertas en 30 días van al «Más»", () => {
    const c = contador(40, [["metas", 40, 0], ["bancos", 10, 1], ["gastos", 25, 3], ["deudas", 99, 31]]);
    expect(ordenPorUso(IDS, c, "plata", AHORA)).toEqual({
      visiblesEnOrden: ["metas", "gastos", "bancos"],
      aMas: ["resumen", "deudas"],
      aplicado: true,
    });
  });

  it("con menos de 30 días, lo nunca abierto queda visible detrás de lo usado (no se esconde lo nuevo)", () => {
    const c = contador(10, [["metas", 4, 0], ["gastos", 2, 2]]);
    expect(ordenPorUso(IDS, c, "plata", AHORA)).toEqual({
      visiblesEnOrden: ["metas", "gastos", "resumen", "bancos", "deudas"],
      aMas: [],
      aplicado: true,
    });
  });

  it("la activa nunca queda escondida: va última de las visibles", () => {
    const c = contador(40, [["metas", 4, 0], ["gastos", 2, 2]]);
    const r = ordenPorUso(IDS, c, "plata", AHORA, "deudas");
    expect(r.visiblesEnOrden).toEqual(["metas", "gastos", "deudas"]);
    expect(r.aMas).toEqual(["resumen", "bancos"]);
  });

  it("empate: manda el orden de siempre", () => {
    const c = contador(40, [["metas", 5, 0], ["bancos", 5, 1], ["resumen", 5, 2]]);
    expect(ordenPorUso(IDS, c, "plata", AHORA).visiblesEnOrden).toEqual(["resumen", "bancos", "metas"]);
  });

  it("todas sin uso en 30 días: el orden de siempre (no se esconde todo)", () => {
    const c = contador(90, [["metas", 5, 45], ["bancos", 3, 60]]);
    expect(ordenPorUso(IDS, c, "plata", AHORA)).toEqual({ visiblesEnOrden: [...IDS], aMas: [], aplicado: false });
  });

  it("sólo cuenta lo de su pantalla (el prefijo)", () => {
    const c = contador(40, [["metas", 5, 0]]);
    c["ventas-caja:metas"] = { n: 99, ultima: AHORA };
    expect(ordenPorUso(IDS, c, "ventas-caja", AHORA).visiblesEnOrden).toEqual(["metas"]);
    expect(ordenPorUso(IDS, c, "inventario", AHORA).aplicado).toBe(false);
  });
});

describe("contador de uso", () => {
  it("sumarUso empieza a contar los días la primera vez y no lo mueve después", () => {
    const uno = sumarUso({}, "plata:metas", AHORA);
    expect(uno[CLAVE_DESDE].ultima).toBe(AHORA);
    const dos = sumarUso(uno, "plata:metas", AHORA + DIA);
    expect(dos["plata:metas"]).toEqual({ n: 2, ultima: AHORA + DIA });
    expect(dos[CLAVE_DESDE].ultima).toBe(AHORA);
  });

  it("no pasa del tope: salen las más viejas, nunca el inicio", () => {
    let c: ContadorDeUso = {};
    for (let i = 0; i < TOPE_USO + 30; i += 1) c = sumarUso(c, `x:${i}`, AHORA + i);
    expect(Object.keys(c).length).toBeLessThanOrEqual(TOPE_USO);
    expect(c[CLAVE_DESDE]).toBeDefined();
    expect(c["x:0"]).toBeUndefined();
    expect(c[`x:${TOPE_USO + 29}`]).toBeDefined();
  });

  it("unir: la mayor cuenta, la fecha más nueva y el inicio más viejo", () => {
    const a = { [CLAVE_DESDE]: { n: 0, ultima: 50 }, "p:a": { n: 3, ultima: 100 } };
    const b = { [CLAVE_DESDE]: { n: 0, ultima: 10 }, "p:a": { n: 1, ultima: 200 }, "p:b": { n: 2, ultima: 5 } };
    expect(unirContadores(a, b)).toEqual({
      [CLAVE_DESDE]: { n: 0, ultima: 10 },
      "p:a": { n: 3, ultima: 200 },
      "p:b": { n: 2, ultima: 5 },
    });
  });

  it("ida y vuelta a la lista del servidor; descarta lo que no tiene forma", () => {
    const c = { [CLAVE_DESDE]: { n: 0, ultima: 1 }, "p:a": { n: 3, ultima: 2 } };
    expect(listaAContador(contadorALista(c))).toEqual(c);
    expect(listaAContador([{ k: "p:x", n: "3", u: 1 }, null, { k: "", n: 1, u: 1 }, { k: "p:y", n: -1, u: 1 }])).toEqual({});
    expect(listaAContador("roto")).toEqual({});
  });
});
