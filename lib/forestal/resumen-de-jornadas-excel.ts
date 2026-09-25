/**
 * El resumen de jornadas en Excel (Brandon, 2026-09-23: «Excel del resumen
 * por día»). Un archivo con los tres cortes en hojas —primero el que se está
 * mirando— y las corridas que los componen.
 *
 * Las cifras van como NÚMEROS, no como el texto formateado de la pantalla:
 * quien baja el Excel es para sumar, filtrar o armar una dinámica. Y cada fila
 * trae su día y su especie escritos, sin celdas vacías «como la de arriba».
 *
 * PURO: el botón llama a `exportSheetsToExcel` con lo que devuelve esto.
 */
import type { HojaExcel } from "@/lib/export-excel";
import type { ResumenDeJornadas } from "@/lib/forestal/resumen-de-jornadas";
import { nombreDelDia } from "@/lib/forestal/semana-de-registro";

export type CorteDelResumen = "especie" | "dia" | "diaEspecie";

const r2 = (n: number) => Math.round(n * 100) / 100;
const dia = (iso: string) => nombreDelDia(iso, true);

function hojaPorDia(d: ResumenDeJornadas): HojaExcel {
  const filas: Record<string, unknown>[] = d.porDia.map((x) => ({
    Fecha: x.dia,
    Día: dia(x.dia),
    Dueños: x.duenos.join(" · "),
    Corridas: x.corridas,
    Especies: x.especies.map((e) => e.especie).join(" · "),
    Piezas: x.piezas,
    "m³": x.m3,
    PT: x.pt,
    "PT por pieza": x.piezas > 0 ? r2(x.pt / x.piezas) : null,
  }));
  if (d.porDia.length > 1) {
    const t = d.totales;
    filas.push({ Fecha: "TOTAL", Día: "", Dueños: "", Corridas: t.corridas, Especies: "", Piezas: t.piezas, "m³": t.m3, PT: t.pt, "PT por pieza": t.piezas > 0 ? r2(t.pt / t.piezas) : null });
  }
  return { nombre: "Por día", filas };
}

function hojaPorDiaEspecieTipo(d: ResumenDeJornadas): HojaExcel {
  const filas: Record<string, unknown>[] = d.porDia.flatMap((x) =>
    x.especies.flatMap((e) =>
      e.productos.map((p) => ({
        Fecha: x.dia,
        Día: dia(x.dia),
        Especie: e.especie,
        Tipo: p.producto,
        Piezas: p.piezas,
        "m³": p.m3,
        PT: p.pt,
      })),
    ),
  );
  if (filas.length > 0) {
    const t = d.totales;
    filas.push({ Fecha: "TOTAL", Día: "", Especie: "", Tipo: "", Piezas: t.piezas, "m³": t.m3, PT: t.pt });
  }
  return { nombre: "Por día, especie y tipo", filas };
}

function hojaPorEspecie(d: ResumenDeJornadas): HojaExcel {
  return {
    nombre: "Por especie",
    filas: d.porEspecie.flatMap((e) =>
      e.productos.map((p) => ({ Especie: e.especie, Tipo: p.producto, Piezas: p.piezas, "m³": p.m3, PT: p.pt })),
    ),
  };
}

function hojaCorridas(d: ResumenDeJornadas): HojaExcel {
  return {
    nombre: "Corridas",
    filas: d.corridas.map((c) => ({
      Fecha: c.dia,
      "N°": c.lineNo,
      Especie: c.especie ?? "",
      Dueño: c.dueno,
      Línea: c.linea ?? "",
      "Materia prima": c.materiaPrimaRef ?? "sin lote",
      Piezas: c.piezas,
      "m³": c.m3,
    })),
  };
}

/** Las hojas del archivo, con el corte que se está mirando primero. */
export function hojasDelResumen(d: ResumenDeJornadas, corte: CorteDelResumen): HojaExcel[] {
  const cortes: Record<CorteDelResumen, HojaExcel> = {
    dia: hojaPorDia(d),
    diaEspecie: hojaPorDiaEspecieTipo(d),
    especie: hojaPorEspecie(d),
  };
  const orden: CorteDelResumen[] = [corte, ...(["dia", "diaEspecie", "especie"] as const).filter((c) => c !== corte)];
  return [...orden.map((c) => cortes[c]), hojaCorridas(d)];
}

/** `resumen-produccion-2026-09-15_2026-09-18`, con `-filtrado` si se sacó algún dueño. */
export function nombreDelArchivo(d: ResumenDeJornadas, filtrado: boolean): string {
  const dias = [...d.dias].sort();
  const rango = dias.length <= 1 ? (dias[0] ?? "sin-dias") : `${dias[0]}_${dias[dias.length - 1]}`;
  return `resumen-produccion-${rango}${filtrado ? "-filtrado" : ""}`;
}
