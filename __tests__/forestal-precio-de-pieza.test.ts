/**
 * __tests__/forestal-precio-de-pieza.test.ts
 *
 * El precio de cada pieza del cubicador (ADR-430): «que al cubicar, elegir el
 * cliente ponga solo ese precio». Lo que fija:
 *  - con el modo en Aserrío/Venta, la pieza de un dueño del Directorio toma el
 *    precio pactado con él (especie → grupo → tipo → su global);
 *  - lo que su trato no cubre cae al precio a mano: la especie, si no el general;
 *  - «A mano» ignora los tratos; un dueño escrito a mano (sin ficha) también;
 *  - el trato es el de ESE servicio y el vigente el día del lote;
 *  - el desglose dice de dónde salió cada precio, en palabras.
 */
import { describe, expect, it } from "vitest";
import { cubicarPieza, unificarPorMedida, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import {
  desglosePorPrecio,
  explicarPrecioDePieza,
  hayPrecioVariable,
  precioDePieza,
  resolverPrecio,
  type ContextoPrecio,
} from "@/lib/forestal/precio-de-pieza";
import type { GrupoEspecies, TarifaCliente } from "@/lib/forestal/precio-cliente";

const GRUPOS: GrupoEspecies[] = [{ id: "g-duras", nombre: "Duras", claves: ["shihuahuaco", "anacaspi"] }];

const trato = (parcial: Partial<TarifaCliente>): TarifaCliente => ({
  id: "t1", parteId: "juan", servicio: "aserrio", vigenteDesde: "2026-09-01", basePt: null,
  grupos: [], especies: [], tipos: [], nota: null, ...parcial,
});

const pieza = (especie: string, extra: Partial<PiezaCubicada> = {}): PiezaCubicada => {
  const base = { id: `p-${especie}`, cantidad: 10, espesor: 2, ancho: 8, largo: 10, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies" } as const;
  return { ...base, especie, ...cubicarPieza(base), ...extra };
};

const TRATOS = new Map<string, TarifaCliente[]>([
  [
    "juan",
    [
      trato({ especies: [{ clave: "tornillo", nombre: "Tornillo", precioPt: 0.6 }], grupos: [{ grupoId: "g-duras", precioPt: 1.2 }] }),
      trato({ id: "t-venta", servicio: "venta", basePt: 3.5 }),
      trato({ id: "t-nuevo", vigenteDesde: "2026-10-01", especies: [{ clave: "tornillo", nombre: "Tornillo", precioPt: 0.7 }] }),
    ],
  ],
]);

const ctx = (parcial: Partial<ContextoPrecio> = {}): ContextoPrecio => ({
  modo: "aserrio",
  aMano: { general: 0.45, porEspecie: { cedro: "0.9" } },
  tratos: TRATOS,
  grupos: GRUPOS,
  fecha: "2026-09-22",
  ...parcial,
});

describe("el cubicador pone el precio del cliente elegido", () => {
  it("la pieza de un dueño del Directorio toma su precio pactado de aserrío para la especie", () => {
    const p = pieza("Tornillo", { dueno: "Juan", duenoParteId: "juan" });
    expect(precioDePieza(p, ctx())).toEqual({ precioPt: 0.6, desde: "cliente-especie", grupo: null });
    expect(explicarPrecioDePieza(precioDePieza(p, ctx()), p)).toBe("precio del cliente para Tornillo");
  });

  it("por grupo de la planta cuando la especie no tiene precio propio", () => {
    const p = pieza("Shihuahuaco", { duenoParteId: "juan" });
    expect(precioDePieza(p, ctx())).toMatchObject({ precioPt: 1.2, desde: "cliente-grupo", grupo: "Duras" });
  });

  it("si su trato no la cubre, cae al precio a mano: el de la especie, si no el general", () => {
    expect(precioDePieza(pieza("Cedro", { duenoParteId: "juan" }), ctx())).toMatchObject({ precioPt: 0.9, desde: "mano-especie" });
    expect(precioDePieza(pieza("Cumala", { duenoParteId: "juan" }), ctx())).toMatchObject({ precioPt: 0.45, desde: "mano-general" });
  });

  it("modo Venta usa el trato de venta, no el de aserrío", () => {
    const p = pieza("Tornillo", { duenoParteId: "juan" });
    expect(precioDePieza(p, ctx({ modo: "venta" }))).toMatchObject({ precioPt: 3.5, desde: "cliente-general" });
  });

  it("rige la versión vigente el día del lote", () => {
    const p = pieza("Tornillo", { duenoParteId: "juan" });
    expect(precioDePieza(p, ctx({ fecha: "2026-10-05" })).precioPt).toBe(0.7);
    expect(precioDePieza(p, ctx({ fecha: "2026-08-15" })).desde).toBe("mano-general");
  });

  it("«A mano» ignora los tratos; un dueño escrito a mano (sin ficha) también", () => {
    expect(precioDePieza(pieza("Tornillo", { duenoParteId: "juan" }), ctx({ modo: "manual" })).desde).toBe("mano-general");
    expect(precioDePieza(pieza("Tornillo", { dueno: "Juan" }), ctx()).desde).toBe("mano-general");
  });

  it("sin precio a mano ni trato: sin precio, nunca un número inventado", () => {
    const p = pieza("Cumala");
    const r = precioDePieza(p, ctx({ aMano: { general: 0, porEspecie: {} } }));
    expect(r).toEqual({ precioPt: 0, desde: null, grupo: null });
    expect(explicarPrecioDePieza(r, p)).toBe("sin precio");
  });

  it("el resolver que usan el resumen, el PDF y la liquidación dice lo mismo", () => {
    const rows = [pieza("Tornillo", { duenoParteId: "juan" }), pieza("Cumala")];
    const precioDe = resolverPrecio(ctx());
    expect(rows.map(precioDe)).toEqual([0.6, 0.45]);
    expect(hayPrecioVariable(rows, ctx())).toBe(true);
    expect(hayPrecioVariable([pieza("Cumala")], ctx())).toBe(false);
  });
});

describe("el desglose dice de dónde salió cada precio", () => {
  it("una línea por dueño y especie, con su origen y su importe", () => {
    const rows = [
      pieza("Tornillo", { id: "a", dueno: "Juan", duenoParteId: "juan" }),
      pieza("Tornillo", { id: "b", dueno: "Juan", duenoParteId: "juan" }),
      pieza("Cumala", { id: "c" }),
    ];
    const d = desglosePorPrecio(rows, ctx());
    expect(d).toHaveLength(2);
    const tornillo = d.find((l) => l.especie === "Tornillo")!;
    expect(tornillo).toMatchObject({ dueno: "Juan", delDirectorio: true, explicacion: "precio del cliente para Tornillo" });
    expect(tornillo.pt).toBeCloseTo(rows[0]!.pieTablar * 2, 2);
    expect(tornillo.importe).toBeCloseTo(rows[0]!.pieTablar * 2 * 0.6, 2);
    expect(d.find((l) => l.especie === "Cumala")?.explicacion).toBe("precio general a mano");
  });
});

describe("los lotes guardados antes de ADR-430", () => {
  it("una pieza con sólo el nombre del dueño se sigue unificando y valorizando como antes", () => {
    const vieja = pieza("Tornillo", { dueno: "Juan" });
    const [u] = unificarPorMedida([vieja, { ...vieja, id: "otra" }]);
    expect(u!.cantidad).toBe(20);
    expect(precioDePieza(u!, ctx({ modo: "manual" })).precioPt).toBe(0.45);
  });

  it("dos piezas del mismo nombre, una atada a su ficha y otra no, no se mezclan", () => {
    const atada = pieza("Tornillo", { dueno: "Juan", duenoParteId: "juan" });
    expect(unificarPorMedida([atada, { ...atada, id: "x", duenoParteId: undefined }])).toHaveLength(2);
  });
});
