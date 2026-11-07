/**
 * El reporte de producción del Libro CTP (vista «Reportes»).
 *
 * Lo que se prueba es lo que el dueño va a contrastar contra la tira de días:
 *
 *  · el PT de un día es EL MISMO que dice su casillero (`jornadasDesdeFilas`);
 *  · las cifras contiguas cierran: semanas = cubos = dueños = permisos =
 *    especies = total, y cada barra apilada suma su barra;
 *  · un filtro es un recorte de la partición: lo filtrado + lo demás = todo;
 *  · la semana en curso (o cortada por el mes) se compara contra los MISMOS
 *    días de la anterior, no contra una semana entera;
 *  · el período sabe N semanas, un mes y un rango, y su «previo».
 */

import { describe, expect, it } from "vitest";
import { PT_POR_M3 } from "@/lib/forestal/cubicacion";
import { jornadasDesdeFilas, repartirPt, SIN_DUENO, type FilaDeLaSemana } from "@/lib/forestal/detalle-de-jornada";
import {
  armarReporte,
  CLAVE_OTROS,
  CLAVE_SIN_PERMISO,
  DIMENSIONES,
  rangoALeer,
  repartirEntero,
  resolverPeriodo,
  type AgrupacionReporte,
  type CorridaDelReporte,
  type FiltrosReporte,
  type PeriodoReporte,
} from "@/lib/forestal/reportes-produccion";

const HOY = "2026-09-23"; // miércoles

let n = 0;
const corrida = (p: Partial<CorridaDelReporte> = {}): CorridaDelReporte => ({
  dia: "2026-09-21",
  lineNo: ++n,
  especie: "Tornillo",
  dueno: SIN_DUENO,
  permiso: null,
  m3: 1,
  otraUnidad: false,
  piezas: 10,
  entradaM3: 0,
  ...p,
});

function reporte(
  corridas: CorridaDelReporte[],
  periodo: PeriodoReporte = { tipo: "semanas", semanas: 4 },
  agrupacion: AgrupacionReporte = "semana",
  filtros: FiltrosReporte = {},
  hoy = HOY,
) {
  return armarReporte({ corridas, periodo: resolverPeriodo(periodo, hoy), agrupacion, filtros, hoy });
}

const suma = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

/** Un mes con volúmenes feos a propósito: fracciones que el redondeo por renglón no cierra. */
function mesConRuido(): CorridaDelReporte[] {
  const duenos = ["De tercero · WASACO", "Del centro", SIN_DUENO, "De tercero · CC.NN. San Luis"];
  const especies = ["Tornillo", "TORNILLO", "Cachimbo", "Panguana", null];
  const permisos = ["10-HUA-PUE/PER-FMP-2026-007", null, "19-SEC/REG-PLT-2026-032"];
  const out: CorridaDelReporte[] = [];
  let k = 0;
  for (let d = 1; d <= 23; d++) {
    if (d % 7 === 0) continue; // días sin sierra
    const dia = `2026-09-${String(d).padStart(2, "0")}`;
    for (let j = 0; j < (d % 3) + 1; j++) {
      k++;
      out.push(
        corrida({
          dia,
          especie: especies[k % especies.length]!,
          dueno: duenos[k % duenos.length]!,
          permiso: permisos[k % permisos.length]!,
          m3: [0.0012, 1.2347, 0.3333, 2.0071, 0.5555][k % 5]!,
          piezas: 7 + (k % 11),
          entradaM3: k % 4 === 0 ? 2.5 : 0,
        }),
      );
    }
  }
  return out;
}

describe("resolverPeriodo", () => {
  it("últimas N semanas: de lunes a domingo, con la semana en curso, y el previo cortado al mismo día", () => {
    const p = resolverPeriodo({ tipo: "semanas", semanas: 4 }, HOY);
    expect(p).toMatchObject({ desde: "2026-08-31", hasta: "2026-09-27", hastaEfectivo: HOY, diasTranscurridos: 24 });
    expect(p.previo).toMatchObject({ desde: "2026-08-03", hasta: "2026-08-26" });
    expect(p.etiqueta).toBe("Últimas 4 semanas");
  });

  it("N fuera de rango cae dentro: 0 → 8, 99 → 52", () => {
    expect(resolverPeriodo({ tipo: "semanas", semanas: 0 }, HOY).desde).toBe("2026-08-03");
    const p = resolverPeriodo({ tipo: "semanas", semanas: 99 }, HOY);
    expect(p.desde).toBe("2025-09-29");
  });

  it("un mes en curso se compara contra los mismos días del mes anterior", () => {
    const p = resolverPeriodo({ tipo: "mes", mes: "2026-09" }, HOY);
    expect(p).toMatchObject({ desde: "2026-09-01", hasta: "2026-09-30", hastaEfectivo: HOY, etiqueta: "setiembre 2026" });
    expect(p.previo).toEqual({ desde: "2026-08-01", hasta: "2026-08-23", etiqueta: "1–23 de agosto" });
  });

  it("un mes cerrado se compara contra el mes anterior entero; un mes corto recorta el día", () => {
    expect(resolverPeriodo({ tipo: "mes", mes: "2026-08" }, HOY).previo).toEqual({
      desde: "2026-07-01",
      hasta: "2026-07-31",
      etiqueta: "julio 2026",
    });
    expect(resolverPeriodo({ tipo: "mes", mes: "2026-03" }, "2026-03-30").previo.hasta).toBe("2026-02-28");
  });

  it("un mes inválido cae en el mes de hoy", () => {
    expect(resolverPeriodo({ tipo: "mes", mes: "2026-13" }, HOY).desde).toBe("2026-09-01");
  });

  it("rango: se da vuelta si viene al revés, se corta en dos años y el previo es el tramo inmediatamente anterior", () => {
    const p = resolverPeriodo({ tipo: "rango", desde: "2026-09-10", hasta: "2026-09-01" }, HOY);
    expect(p).toMatchObject({ desde: "2026-09-01", hasta: "2026-09-10", diasTranscurridos: 10 });
    expect(p.previo).toMatchObject({ desde: "2026-08-22", hasta: "2026-08-31" });
    const largo = resolverPeriodo({ tipo: "rango", desde: "2020-01-01", hasta: "2026-09-01" }, HOY);
    expect(largo.desde).toBe("2024-09-01");
  });

  it("un rango que todavía no empezó no tiene días transcurridos", () => {
    const p = resolverPeriodo({ tipo: "rango", desde: "2026-10-01", hasta: "2026-10-31" }, HOY);
    expect(p.diasTranscurridos).toBe(0);
    expect(reporte([corrida()], { tipo: "rango", desde: "2026-10-01", hasta: "2026-10-31" }).cubos).toEqual([]);
  });

  it("se lee también la semana anterior al período (la primera fila se compara con ella)", () => {
    const p = resolverPeriodo({ tipo: "mes", mes: "2026-08" }, HOY);
    expect(rangoALeer(p)).toEqual({ desde: "2026-07-01", hasta: "2026-08-31" });
    const s = resolverPeriodo({ tipo: "semanas", semanas: 1 }, HOY);
    expect(rangoALeer(s)).toEqual({ desde: "2026-09-14", hasta: "2026-09-27" });
  });
});

describe("repartirEntero", () => {
  it("da lo mismo que repartirPt de la tira, y siempre suma el total", () => {
    const casos = [
      [0.0012, 0.0012],
      [1.2347, 0.3333, 2.0071],
      [0.5555, 0.5555, 0.5555],
      [3.1, 0, 0.0001],
    ];
    for (const m3s of casos) {
      const total = Math.round(suma(m3s) * PT_POR_M3);
      expect(repartirEntero(m3s, total)).toEqual(repartirPt(m3s, total));
      expect(suma(repartirEntero(m3s, total))).toBe(total);
    }
  });

  it("aunque el total pida más de un PT por renglón, no pierde nada", () => {
    expect(suma(repartirEntero([0.001, 0.001], 10))).toBe(10);
    expect(suma(repartirEntero([1, 1], 500))).toBe(500);
  });
});

describe("armarReporte — las cifras cierran", () => {
  const corridas = mesConRuido();

  it("el PT de cada día es el del casillero de la tira", () => {
    const r = reporte(corridas, { tipo: "mes", mes: "2026-09" }, "dia");
    const filas: FilaDeLaSemana[] = corridas.map((c) => ({
      dia: c.dia,
      lineNo: c.lineNo,
      quantity: c.m3,
      unit: "m3",
      pieces: c.piezas,
      volumeInputM3: null,
      consumos: 0,
      reprocesosEntrada: 0,
      speciesCommon: c.especie,
      duenoMadera: null,
      titularNombre: null,
      originCode: c.permiso,
      lineaProduccion: null,
      materiaPrimaRef: null,
      paquetes: [],
    }));
    const tira = new Map(jornadasDesdeFilas(filas, "produccion").map((j) => [j.dia, j]));
    for (const cubo of r.cubos) {
      const j = tira.get(cubo.clave);
      expect(cubo.pt).toBe(j?.pt ?? 0);
      expect(cubo.corridas).toBe(j?.corridas ?? 0);
      expect(cubo.m3).toBeCloseTo(j?.m3 ?? 0, 4);
    }
    /* Y el día corta en hoy: el 24 todavía no pasó. */
    expect(r.cubos.at(-1)?.clave).toBe(HOY);
  });

  it("semanas, cubos, dueños, permisos y especies suman el total; cada pila suma su barra", () => {
    for (const agrupacion of ["dia", "semana", "mes"] as const) {
      const r = reporte(corridas, { tipo: "mes", mes: "2026-09" }, agrupacion);
      expect(suma(r.semanas.map((s) => s.pt))).toBe(r.totales.pt);
      expect(suma(r.cubos.map((c) => c.pt))).toBe(r.totales.pt);
      expect(suma(r.semanas.map((s) => s.corridas))).toBe(r.totales.corridas);
      expect(suma(r.semanas.map((s) => s.piezas))).toBe(r.totales.piezas);
      for (const d of DIMENSIONES) {
        expect(suma(r.partes[d].map((p) => p.pt))).toBe(r.totales.pt);
        expect(suma(r.partes[d].map((p) => p.corridas))).toBe(r.totales.corridas);
        for (const c of r.cubos) expect(suma(Object.values(c.pila[d]))).toBe(c.pt);
      }
      expect(r.cubos.at(-1)?.ptAcumulado).toBe(r.totales.pt);
    }
  });

  it("el total del mes es la suma de los PT de sus días (como la cabecera de la tira)", () => {
    const r = reporte(corridas, { tipo: "mes", mes: "2026-09" }, "semana");
    const porDia = reporte(corridas, { tipo: "mes", mes: "2026-09" }, "dia");
    expect(r.totales.pt).toBe(suma(porDia.cubos.map((c) => c.pt)));
    expect(r.totales.diasConProduccion).toBe(porDia.cubos.filter((c) => c.corridas > 0).length);
    expect(r.periodo.diasTranscurridos - r.totales.diasConProduccion).toBe(3); // 7, 14 y 21: sin sierra
  });

  it("«TORNILLO» y «Tornillo» son una especie; se muestra el nombre de la corrida más vieja", () => {
    const r = reporte(corridas, { tipo: "mes", mes: "2026-09" });
    const tornillo = r.partes.especie.filter((p) => p.clave === "tornillo");
    expect(tornillo).toHaveLength(1);
    expect(["Tornillo", "TORNILLO"]).toContain(tornillo[0]!.titulo);
  });
});

describe("armarReporte — filtros", () => {
  const corridas = mesConRuido();
  const periodo: PeriodoReporte = { tipo: "mes", mes: "2026-09" };

  it("lo filtrado más lo demás es el todo, en PT, piezas y corridas", () => {
    const todo = reporte(corridas, periodo);
    const wasaco = reporte(corridas, periodo, "semana", { duenos: ["De tercero · WASACO"] });
    const resto = reporte(corridas, periodo, "semana", {
      duenos: todo.partes.dueno.map((p) => p.clave).filter((k) => k !== "De tercero · WASACO"),
    });
    expect(wasaco.totales.pt + resto.totales.pt).toBe(todo.totales.pt);
    expect(wasaco.totales.piezas + resto.totales.piezas).toBe(todo.totales.piezas);
    expect(wasaco.totales.corridas + resto.totales.corridas).toBe(todo.totales.corridas);
    expect(wasaco.partes.dueno.map((p) => p.clave)).toEqual(["De tercero · WASACO"]);
  });

  it("el PT filtrado es el mismo pedazo que muestra la parte sin filtrar (no otra cuenta)", () => {
    const todo = reporte(corridas, periodo);
    for (const parte of todo.partes.especie) {
      const solo = reporte(corridas, periodo, "semana", { especies: [parte.clave] });
      expect(solo.totales.pt).toBe(parte.pt);
    }
  });

  it("los filtros se combinan (especie Y permiso) y el «sin permiso» es filtrable", () => {
    const r = reporte(corridas, periodo, "semana", { especies: ["tornillo"], permisos: [CLAVE_SIN_PERMISO] });
    expect(r.partes.permiso.map((p) => p.clave)).toEqual([CLAVE_SIN_PERMISO]);
    expect(r.partes.especie.map((p) => p.clave)).toEqual(["tornillo"]);
    expect(r.partes.permiso[0]!.titulo).toBe("Sin permiso declarado");
  });

  it("las opciones son las del período SIN recortar, y lo elegido que ya no está sigue en la lista", () => {
    const todo = reporte(corridas, periodo);
    const filtrado = reporte(corridas, periodo, "semana", { especies: ["cachimbo", "caoba"] });
    expect(filtrado.opciones.especie.map((o) => o.value)).toEqual([
      ...todo.opciones.especie.map((o) => o.value),
      "caoba",
    ]);
    expect(filtrado.opciones.especie.at(-1)?.hint).toBe("sin corridas en el período");
  });
});

describe("armarReporte — semanas y comparaciones", () => {
  it("la semana en curso se compara contra los MISMOS días de la semana anterior", () => {
    const corridas = [
      corrida({ dia: "2026-09-14", m3: 1 }), // lunes anterior
      corrida({ dia: "2026-09-19", m3: 5 }), // sábado anterior: no se compara todavía
      corrida({ dia: "2026-09-21", m3: 2 }), // lunes de esta semana
    ];
    const r = reporte(corridas, { tipo: "semanas", semanas: 2 });
    const actual = r.semanas.at(-1)!;
    expect(actual).toMatchObject({ lunes: "2026-09-21", enCurso: true, dias: 3, pt: 848, ptSemanaAnterior: 424 });
    expect(actual.variacionPct).toBe(100);
    expect(r.semanas[0]).toMatchObject({ lunes: "2026-09-14", enCurso: false, pt: 2544 });
  });

  it("la primera semana se compara contra la de antes del período, que no es una fila", () => {
    const r = reporte(
      [corrida({ dia: "2026-08-25", m3: 2 }), corrida({ dia: "2026-09-01", m3: 1 })],
      { tipo: "semanas", semanas: 4 },
    );
    expect(r.semanas[0]).toMatchObject({ lunes: "2026-08-31", pt: 424, ptSemanaAnterior: 848, variacionPct: -50 });
    expect(r.semanas).toHaveLength(4);
  });

  it("un mes corta sus semanas de los bordes y las marca parciales", () => {
    const r = reporte([corrida({ dia: "2026-09-01" })], { tipo: "mes", mes: "2026-09" });
    expect(r.semanas[0]).toMatchObject({ lunes: "2026-08-31", desde: "2026-09-01", dias: 6, parcial: true });
    expect(r.semanas.at(-1)).toMatchObject({ lunes: "2026-09-21", hasta: HOY, enCurso: true });
  });

  it("sin nada la semana anterior no hay porcentaje que inventar", () => {
    const r = reporte([corrida({ dia: "2026-09-22" })], { tipo: "semanas", semanas: 1 });
    expect(r.semanas[0]!.variacionPct).toBeNull();
  });

  it("el previo del período lleva los mismos filtros", () => {
    const corridas = [
      corrida({ dia: "2026-08-10", dueno: "Del centro", m3: 1 }),
      corrida({ dia: "2026-08-11", dueno: SIN_DUENO, m3: 3 }),
      corrida({ dia: "2026-09-10", dueno: "Del centro", m3: 2 }),
    ];
    const r = reporte(corridas, { tipo: "mes", mes: "2026-09" }, "semana", { duenos: ["Del centro"] });
    expect(r.previo.pt).toBe(424);
    expect(r.totales.pt).toBe(848);
  });

  it("agrupado por mes: un cubo por mes, cortado en hoy", () => {
    const r = reporte(
      [corrida({ dia: "2026-07-15" }), corrida({ dia: "2026-09-02" })],
      { tipo: "rango", desde: "2026-07-10", hasta: "2026-12-31" },
      "mes",
    );
    expect(r.cubos.map((c) => [c.clave, c.etiqueta, c.pt])).toEqual([
      ["2026-07-01", "jul 26", 424],
      ["2026-08-01", "ago 26", 0],
      ["2026-09-01", "set 26", 424],
    ]);
    expect(r.cubos[0]).toMatchObject({ desde: "2026-07-10", parcial: true });
    expect(r.cubos[2]).toMatchObject({ enCurso: true, hasta: HOY });
  });
});

describe("armarReporte — lo que no se sabe no se inventa", () => {
  it("rendimiento sólo con materia prima atribuida; `null` si no hay ninguna", () => {
    expect(reporte([corrida()]).rendimiento).toBeNull();
    const r = reporte([
      corrida({ m3: 1, entradaM3: 2 }),
      corrida({ m3: 5 }),
      corrida({ m3: 0, otraUnidad: true, entradaM3: 3 }),
    ]);
    expect(r.rendimiento).toEqual({ corridas: 1, entradaM3: 2, salidaM3: 1, pct: 50 });
    expect(r.totales.corridasOtraUnidad).toBe(1);
    expect(r.totales.corridas).toBe(3);
  });

  it("más de cinco dueños: cinco series y «Otros»; lo no declarado va arriba de la pila", () => {
    const corridas = ["A", "B", "C", "D", "E", "F", "G"].map((x, i) =>
      corrida({ dueno: `De tercero · ${x}`, m3: 10 - i }),
    );
    corridas.push(corrida({ dueno: SIN_DUENO, m3: 9.5 }));
    const r = reporte(corridas);
    const series = r.series.dueno;
    expect(series).toHaveLength(6);
    expect(series.at(-2)).toMatchObject({ clave: SIN_DUENO, tipo: "sin-dato" });
    expect(series.at(-1)).toMatchObject({ clave: CLAVE_OTROS, tipo: "otros", etiqueta: "Otros (3)" });
    expect(series[0]).toMatchObject({ clave: "De tercero · A", etiqueta: "A" });
    const cubo = r.cubos.find((c) => c.pt > 0)!;
    expect(suma(Object.values(cubo.pila.dueno))).toBe(cubo.pt);
  });

  it("un «sin dueño» chico no se esconde en «Otros»: ocupa uno de los cinco lugares", () => {
    const corridas = ["A", "B", "C", "D", "E", "F", "G"].map((x, i) =>
      corrida({ dueno: `De tercero · ${x}`, m3: 10 - i }),
    );
    corridas.push(corrida({ dueno: SIN_DUENO, m3: 0.2 }));
    const series = reporte(corridas).series.dueno;
    expect(series).toHaveLength(6);
    expect(series.some((s) => s.clave === SIN_DUENO && s.tipo === "sin-dato")).toBe(true);
    expect(series.at(-1)).toMatchObject({ clave: CLAVE_OTROS, etiqueta: "Otros (3)" });
  });

  it("mejor día y mejor semana salen de lo filtrado", () => {
    const r = reporte([corrida({ dia: "2026-09-02", m3: 3 }), corrida({ dia: "2026-09-15", m3: 1 })]);
    expect(r.mejorDia).toEqual({ dia: "2026-09-02", pt: 1272 });
    expect(r.mejorSemana).toMatchObject({ lunes: "2026-08-31", pt: 1272 });
  });
});

describe("tope del período (revisión 23-09)", () => {
  it("un mes de año raro («0050-01») no arma un período de siglos: cae al mes de hoy", async () => {
    const { resolverPeriodo } = await import("@/lib/forestal/reportes-produccion");
    const p = resolverPeriodo({ tipo: "mes", mes: "0050-01" }, "2026-09-23");
    const dias = (Date.parse(`${p.hasta}T00:00:00Z`) - Date.parse(`${p.desde}T00:00:00Z`)) / 86_400_000 + 1;
    expect(dias).toBeLessThanOrEqual(31);
    expect(p.desde.slice(0, 7)).toBe("2026-09");
  });
});
