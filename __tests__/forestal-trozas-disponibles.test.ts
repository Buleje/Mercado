/**
 * «Trozas disponibles» (Brandon 2026-09-27): la lógica pura de la pestaña.
 *
 *  · UN criterio (revisión 2026-09-27): las cifras principales son EN EL PATIO
 *    (libres + en lote); lo sin recepcionar va aparte y nunca se suma. Por cada
 *    permiso, sus especies suman la fila (también el que tiene TODO sin
 *    recepcionar: 0 en el patio arriba y 0 abajo);
 *  · la especie es la de la TROZA, no la de la guía (en Blas, 29 de 84 trozas
 *    vinieron en una guía de otra especie);
 *  · el pt es aserrable al 56 % (m³ × 0,56 × 424), nunca m³ × 424;
 *  · el filtro cruzado deja fuera SU campo (`excepto`) para poder cambiar de
 *    permiso desde la tabla de permisos;
 *  · lo sin recepcionar no cuenta días en el patio.
 */
import { describe, expect, it } from "vitest";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import { resumenPorPermiso } from "@/lib/forestal/patio-resumen";
import {
  FILTRO_DISPONIBLES_VACIO,
  antiguedadDisponible,
  especiesDelPermiso,
  estadoDisponible,
  filtrarDisponibles,
  hojaPorEspecie,
  permisoCorto,
  pilaPermisoEspecie,
  porEspecieDisponible,
  ptDe,
  resumenDisponibles,
  trozasDisponibles,
} from "@/lib/forestal/trozas-disponibles";

const AHORA = new Date("2026-09-27T15:00:00Z");

function troza(p: Partial<TrozaConsumible> & { id: string }): TrozaConsumible {
  return {
    woodEntryId: `we-${p.gtfNumber ?? "x"}`,
    codificacion: p.id,
    especieComun: "Cachimbo",
    volumenM3: 2,
    guiaRecepcionada: true,
    fechaRecepcion: "2026-09-08T05:00:00.000Z",
    fechaIngreso: "2026-09-08T00:00:00.000Z",
    permiso: "10-HUA-PUE/PER-FMP-2026-007",
    gtfNumber: "G1",
    proveedor: "WASACO",
    ...p,
  };
}

/* Calcado de Blas (27-09): un permiso en el patio con varias especies, otro
   con su guía sin recepcionar, una pieza apartada en lote, una ya consumida
   (no está viva) y una sin permiso. */
const TROZAS: TrozaConsumible[] = [
  troza({ id: "a1", volumenM3: 3 }),
  troza({
    id: "a2",
    volumenM3: 1.5,
    especieComun: "CACHIMBO",
    loteAserrioId: "l1",
    loteAserrioCode: "LA-7",
  }),
  troza({
    id: "a3",
    volumenM3: 4,
    especieComun: "Panguana",
    gtfNumber: "G2",
    fechaRecepcion: "2026-09-20T05:00:00.000Z",
  }),
  troza({
    id: "b1",
    permiso: "19-SEC/REG-PLT-2021-017",
    especieComun: "TORNILLO",
    gtfNumber: "G9",
    guiaRecepcionada: false,
    fechaRecepcion: null,
    volumenM3: 0.5,
  }),
  troza({
    id: "b2",
    permiso: "19-SEC/REG-PLT-2021-017",
    especieComun: "Tornillo",
    gtfNumber: "G9",
    guiaRecepcionada: false,
    fechaRecepcion: null,
    volumenM3: 0.75,
  }),
  troza({ id: "c1", permiso: null, especieComun: "Copal", volumenM3: 1 }),
  troza({ id: "x1", consumidaEnId: "corrida-1", volumenM3: 9 }),
];
const VIVAS = trozasDisponibles(TROZAS);

describe("trozasDisponibles + estadoDisponible", () => {
  it("deja fuera lo consumido y reparte en tres estados", () => {
    expect(VIVAS.map((t) => t.id)).toEqual(["a1", "a2", "a3", "b1", "b2", "c1"]);
    expect(VIVAS.map(estadoDisponible)).toEqual([
      "libre",
      "en-lote",
      "libre",
      "sin-recepcionar",
      "sin-recepcionar",
      "libre",
    ]);
  });
});

describe("resumenDisponibles — en el patio arriba, sin recepcionar aparte", () => {
  const r = resumenDisponibles(VIVAS, AHORA);

  it("en el patio = libres + en lote; lo sin recepcionar NO se suma", () => {
    expect(r.enPatio.trozas).toBe(4);
    expect(r.libres.trozas + r.enLote.trozas).toBe(r.enPatio.trozas);
    expect(r.enPatio.m3).toBeCloseTo(9.5, 4);
    expect(r.libres.m3 + r.enLote.m3).toBeCloseTo(r.enPatio.m3, 4);
    expect(r.sinRecepcionar).toMatchObject({ trozas: 2, m3: 1.25, guias: 1 });
  });

  it("pt aserrable al 56 % del patio, no m³ × 424 ni el total vivo", () => {
    expect(r.enPatio.pt).toBe(Math.round(9.5 * 0.56 * 424));
    expect(r.enPatio.pt).not.toBe(Math.round(9.5 * 424));
    expect(r.enPatio.pt).not.toBe(Math.round(10.75 * 0.56 * 424));
    expect(ptDe(1)).toBe(237);
  });

  it("permisos, especies y guías son del patio; los que tienen TODO sin recepcionar se cuentan aparte", () => {
    expect(r.permisos).toBe(1);
    expect(r.sinRecepcionar.permisosSolo).toBe(1);
    expect(r.sinPermiso).toBe(1);
    expect(r.especies).toBe(3);
    expect(r.sinRecepcionar.especiesSolo).toBe(1);
    /* a1, a2 y c1 llevan 19 días; a3 sólo 7; b1/b2 no están en el patio. */
    expect(r.anejas.trozas).toBe(3);
    expect(r.masVieja?.dias).toBe(19);
    expect(r.proveedores).toBe(1);
    expect(r.mayorM3).toBe(4);
    expect(r.promedioM3).toBeCloseTo(9.5 / 4, 4);
  });
});

describe("porEspecieDisponible", () => {
  const filas = porEspecieDisponible(VIVAS, AHORA);

  it("agrupa por la especie de la TROZA, sin distinguir mayúsculas, y suma lo mismo que el resumen", () => {
    const cachimbo = filas.find((f) => f.clave === "cachimbo");
    expect(cachimbo).toMatchObject({ trozas: 2, libres: 1, enLote: 1 });
    expect(filas.reduce((a, f) => a + f.trozas, 0)).toBe(4);
    expect(filas.reduce((a, f) => a + f.m3, 0)).toBeCloseTo(9.5, 4);
    expect(filas.reduce((a, f) => a + f.sinRecepcionar.trozas, 0)).toBe(2);
  });

  it("una especie con TODO sin recepcionar sale con 0 en el patio y su columna aparte", () => {
    const tornillo = filas.find((f) => f.clave === "tornillo");
    expect(tornillo).toMatchObject({ trozas: 0, m3: 0, pt: 0, permisos: 0, masVieja: null });
    expect(tornillo?.sinRecepcionar).toEqual({ trozas: 2, m3: 1.25 });
    expect(filas[filas.length - 1].clave).toBe("tornillo");
  });

  it("ordena por m³ en el patio y el % del patio suma 100", () => {
    expect(filas[0].especie).toMatch(/cachimbo/i);
    expect(filas.map((f) => f.m3)).toEqual([...filas.map((f) => f.m3)].sort((a, b) => b - a));
    expect(filas.reduce((a, f) => a + f.pctM3, 0)).toBeCloseTo(100, 0);
  });

  it("por CADA permiso, sus especies suman la fila de «Por permiso» (en el patio y aparte)", () => {
    const { filas: permisos } = resumenPorPermiso(VIVAS, AHORA);
    expect(permisos.map((f) => f.permiso)).toContain("19-SEC/REG-PLT-2021-017");
    for (const fila of permisos) {
      const esp = especiesDelPermiso(VIVAS, fila.permiso, AHORA);
      expect(esp.reduce((a, f) => a + f.trozas, 0)).toBe(fila.enPatio.trozas);
      expect(esp.reduce((a, f) => a + f.m3, 0)).toBeCloseTo(fila.enPatio.m3, 4);
      expect(esp.reduce((a, f) => a + f.sinRecepcionar.trozas, 0)).toBe(fila.porRecepcionar.trozas);
      expect(esp.reduce((a, f) => a + f.sinRecepcionar.m3, 0)).toBeCloseTo(
        fila.porRecepcionar.m3,
        4,
      );
    }
    /* El permiso con TODO sin recepcionar: 0 arriba y 0 al abrirlo (antes: 0 y 2). */
    const sec = permisos.find((f) => f.permiso === "19-SEC/REG-PLT-2021-017");
    expect(sec?.enPatio.trozas).toBe(0);
    const delSec = especiesDelPermiso(VIVAS, "19-SEC/REG-PLT-2021-017", AHORA);
    expect(delSec.map((f) => [f.trozas, f.sinRecepcionar.trozas])).toEqual([[0, 2]]);
  });

  it("las especies de lo que no declara permiso", () => {
    expect(especiesDelPermiso(VIVAS, null, AHORA).map((f) => f.clave)).toEqual(["copal"]);
  });

  it("la hoja «Por especie» del Excel usa las MISMAS cabeceras que «Por permiso»", () => {
    const hoja = hojaPorEspecie(filas);
    expect(hoja.nombre).toBe("Por especie");
    const cab = Object.keys(hoja.filas[0]);
    for (const c of [
      "Trozas en patio",
      "m³ en patio",
      "≈pt aserrable (derivado 56 %)",
      "Libres",
      "En lote",
      "Por recepcionar (trozas)",
      "Por recepcionar (m³)",
      "Más vieja en patio",
      "Días en patio",
    ])
      expect(cab).toContain(c);
    expect(typeof hoja.filas[0]["m³ en patio"]).toBe("number");
    const tornillo = hoja.filas.find((f) => /tornillo/i.test(String(f.Especie)));
    expect(tornillo?.["Trozas en patio"]).toBe(0);
    expect(tornillo?.["Por recepcionar (trozas)"]).toBe(2);
  });
});

describe("filtrarDisponibles — filtro cruzado", () => {
  it("acota por permiso, especie y estado (OR adentro, AND entre campos)", () => {
    const f = {
      ...FILTRO_DISPONIBLES_VACIO,
      permiso: ["10-HUA-PUE/PER-FMP-2026-007"],
      estado: ["libre" as const],
    };
    expect(filtrarDisponibles(VIVAS, f, AHORA).map((t) => t.id)).toEqual(["a1", "a3"]);
  });

  it("`excepto` deja fuera SU campo: la tabla por permiso sigue mostrando todos", () => {
    const f = {
      ...FILTRO_DISPONIBLES_VACIO,
      permiso: ["10-HUA-PUE/PER-FMP-2026-007"],
      especie: ["Tornillo"],
    };
    expect(filtrarDisponibles(VIVAS, f, AHORA)).toHaveLength(0);
    const sinPermiso = filtrarDisponibles(VIVAS, f, AHORA, "permiso");
    expect(sinPermiso.map((t) => t.id)).toEqual(["b1", "b2"]);
    expect(resumenPorPermiso(sinPermiso, AHORA).filas.map((x) => x.permiso)).toEqual([
      "19-SEC/REG-PLT-2021-017",
    ]);
  });

  it("pedir un tramo de días deja fuera lo sin recepcionar (no tiene días en el patio)", () => {
    const f = { ...FILTRO_DISPONIBLES_VACIO, tramos: ["16a30" as const] };
    expect(filtrarDisponibles(VIVAS, f, AHORA).map((t) => t.id)).toEqual(["a1", "a2", "c1"]);
  });
});

describe("gráficos", () => {
  it("antigüedad: tramos del patio y lo sin recepcionar aparte", () => {
    const a = antiguedadDisponible(VIVAS, AHORA);
    expect(a.tramos.find((t) => t.tramo === "hasta15")?.trozas).toBe(1);
    expect(a.tramos.find((t) => t.tramo === "16a30")?.trozas).toBe(3);
    expect(a.sinRecepcionar).toEqual({ trozas: 2, m3: 1.25 });
  });

  it("pila permiso × especie: sólo lo EN EL PATIO; lo que no entra al tope va a «Otras»", () => {
    const pila = pilaPermisoEspecie(VIVAS, AHORA, 2);
    expect(pila.especies.map((e) => e.clave)).toEqual(["cachimbo", "panguana"]);
    expect(pila.hayOtras).toBe(true);
    const hua = pila.filas.find((f) => f.permiso === "10-HUA-PUE/PER-FMP-2026-007");
    expect(hua?.m3).toBe(8.5);
    expect(hua?.porEspecie).toEqual({ cachimbo: 4.5, panguana: 4 });
    /* El permiso con todo sin recepcionar no tiene barra. */
    expect(pila.filas.find((f) => f.permiso === "19-SEC/REG-PLT-2021-017")).toBeUndefined();
    expect(pila.filas.reduce((a, f) => a + f.m3, 0)).toBeCloseTo(9.5, 4);
  });

  it("permisoCorto: zona y año-número", () => {
    expect(permisoCorto("10-HUA-PUE/PER-FMP-2026-007")).toBe("10-HUA-PUE · 2026-007");
    expect(permisoCorto("19-SEC/REG-PLT-2021-017")).toBe("19-SEC · 2021-017");
    expect(permisoCorto(null)).toBe("Sin permiso");
  });
});
