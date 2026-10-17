/**
 * Las hojas del Excel del reporte de producción.
 *
 * Puro (sin exceljs, sin navegador): arma las filas y `exportSheetsToExcel`
 * las baja. Así se prueba qué columnas y qué cifras salen sin abrir un archivo.
 *
 * Las cifras son las MISMAS del reporte —no se recalcula nada—: el Excel y la
 * pantalla no pueden discutir. Unidades en el encabezado, en el orden del
 * aserradero: PT, m³, piezas.
 */

import type { HojaExcel } from "@/lib/export-excel";
import type { DimensionReporte, ReporteDeProduccion } from "@/lib/forestal/reportes-produccion";

const NOMBRE_DIMENSION: Record<DimensionReporte, string> = {
  dueno: "Dueño",
  permiso: "Permiso",
  especie: "Especie",
};

const NOMBRE_CUBO: Record<ReporteDeProduccion["agrupacion"], string> = {
  dia: "Por día",
  semana: "Por semana",
  mes: "Por mes",
};

export function hojasDelReporte(r: ReporteDeProduccion): HojaExcel[] {
  const filtros = [
    r.filtros.duenos.length ? `Dueño: ${r.filtros.duenos.join(", ")}` : null,
    r.filtros.permisos.length ? `Permiso: ${r.filtros.permisos.join(", ")}` : null,
    r.filtros.especies.length
      ? `Especie: ${r.filtros.especies
          .map((k) => r.opciones.especie.find((o) => o.value === k)?.label ?? k)
          .join(", ")}`
      : null,
  ].filter(Boolean);

  const resumen: HojaExcel = {
    nombre: "Resumen",
    filas: [
      { Dato: "Período", Valor: r.periodo.etiqueta },
      { Dato: "Desde", Valor: r.periodo.desde },
      { Dato: "Hasta (con datos)", Valor: r.periodo.hastaEfectivo },
      { Dato: "Filtros", Valor: filtros.length ? filtros.join(" · ") : "Ninguno: toda la producción" },
      { Dato: "PT producidos", Valor: r.totales.pt },
      { Dato: "m³ producidos", Valor: r.totales.m3 },
      { Dato: "Piezas", Valor: r.totales.piezas },
      { Dato: "Corridas", Valor: r.totales.corridas },
      { Dato: "Días con producción", Valor: r.totales.diasConProduccion },
      { Dato: "Días del período (hasta hoy)", Valor: r.periodo.diasTranscurridos },
      { Dato: "PT por día trabajado", Valor: r.totales.ptPorDiaTrabajado ?? "—" },
      { Dato: `PT en ${r.periodo.previo.etiqueta}`, Valor: r.previo.pt },
      /* Números, no una frase: el Excel es para sumar y comparar. */
      ...(r.rendimiento
        ? [
            { Dato: "Rendimiento % (sólo corridas con materia prima atribuida)", Valor: r.rendimiento.pct },
            { Dato: "Rendimiento: corridas con materia prima", Valor: r.rendimiento.corridas },
            { Dato: "Rendimiento: salida m³", Valor: r.rendimiento.salidaM3 },
            { Dato: "Rendimiento: entrada m³", Valor: r.rendimiento.entradaM3 },
          ]
        : [{ Dato: "Rendimiento", Valor: "Ninguna corrida tiene materia prima atribuida" }]),
      ...(r.totales.corridasOtraUnidad > 0
        ? [{ Dato: "Corridas en otra unidad (no suman m³ ni PT)", Valor: r.totales.corridasOtraUnidad }]
        : []),
      ...(r.truncado ? [{ Dato: "Aviso", Valor: "El período es tan largo que se leyeron sólo las corridas más nuevas" }] : []),
    ],
  };

  const semanas: HojaExcel = {
    nombre: "Por semana",
    filas: r.semanas.map((s) => ({
      "Semana (lunes)": s.lunes,
      Semana: s.etiqueta,
      Desde: s.desde,
      Hasta: s.hasta,
      "Días con producción": s.diasConProduccion,
      Corridas: s.corridas,
      Piezas: s.piezas,
      "m³": s.m3,
      PT: s.pt,
      "PT mismos días semana anterior": s.ptSemanaAnterior,
      "Variación %": s.variacionPct ?? "—",
      Estado: s.enCurso ? "En curso" : s.parcial ? "Cortada por el período" : "Completa",
    })),
  };

  const cubos: HojaExcel[] =
    r.agrupacion === "semana"
      ? []
      : [
          {
            nombre: NOMBRE_CUBO[r.agrupacion],
            filas: r.cubos.map((c) => ({
              [r.agrupacion === "dia" ? "Día" : "Mes"]: c.titulo,
              Desde: c.desde,
              Hasta: c.hasta,
              Corridas: c.corridas,
              Piezas: c.piezas,
              "m³": c.m3,
              PT: c.pt,
              "PT acumulado": c.ptAcumulado,
            })),
          },
        ];

  const partes = (["dueno", "permiso", "especie"] as const).map(
    (d): HojaExcel => ({
      nombre: `Por ${NOMBRE_DIMENSION[d].toLowerCase()}`,
      filas: r.partes[d].map((p) => ({
        [NOMBRE_DIMENSION[d]]: p.titulo,
        Corridas: p.corridas,
        Piezas: p.piezas,
        "m³": p.m3,
        PT: p.pt,
        "% del PT": p.pct,
      })),
    }),
  );

  return [resumen, semanas, ...cubos, ...partes];
}

/** `reporte-produccion-2026-09-01-a-2026-09-23`. */
export function nombreDelArchivo(r: ReporteDeProduccion): string {
  return `reporte-produccion-${r.periodo.desde}-a-${r.periodo.hastaEfectivo}`;
}
