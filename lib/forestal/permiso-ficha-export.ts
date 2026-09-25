"use client";

/**
 * La ficha de un permiso, en papel y en Excel (ADR-432, ficha del contrato).
 *
 * Brandon (2026-09-25): «un botón "Imprimir / Excel" saca una hoja con las
 * guías que entraron, lo producido por especie y tipo, y lo despachado.
 * Ejemplo: llega el fiscalizador, abres el permiso y en un clic le entregas
 * el papel con todo».
 *
 * El papel y el Excel dicen LO MISMO que «Volumen» y «Trazabilidad»
 * (`CtpPermisoVolumen.tsx`, `CtpPermisoTablas.tsx`, `CtpPermisoTraza.tsx`), con
 * las mismas palabras — por eso las cifras de las seis tarjetas y las líneas de
 * aviso salen de las MISMAS funciones puras que pinta la pantalla
 * (`kpisDelPermiso` calca `CtpPermisoVolumen`, `avisosDelPermiso` reusa
 * `lineasDeAvisos` de `CtpPermisoAvisos.tsx`). Nada se recalcula: todo llega ya
 * armado en `VolumenDelPermiso` (`armarVolumenDelPermiso`, servidor).
 *
 * Reusa `ctp-print-shared` para el papel (ADR-409) y `exportSheetsToExcel`
 * para el Excel (memoria `export-excel-un-archivo-por-llamada`): llamar al
 * exportador de Excel dos veces baja dos archivos, no un libro de dos hojas.
 *
 * Lo que no existe se escribe «—», nunca 0 — en el papel y en las columnas de
 * texto del Excel; en las columnas numéricas de las tablas (Por especie, Por
 * tipo, Guías, Corridas, Despachos) el número va como número y lo ausente
 * queda `null` (celda vacía, nunca un cero inventado).
 */

import type { HojaExcel } from "@/lib/export-excel";
import { formatDateTime } from "@/lib/format";
import { STORE_TIMEZONE } from "@/lib/utils";
import { ESTADO_LABEL, TIPO_LABEL, vigenciaTexto } from "@/components/admin/forestal/contratos-ui";
import { lineasDeAvisos } from "@/components/admin/forestal/CtpPermisoAvisos";
import { plural, tipoCorto } from "@/components/admin/forestal/permiso-volumen-ui";
import { fmtM3, fmtPct, fmtPiezas, fmtPt } from "./cubicacion-formato";
import {
  esc,
  ctpIdentityBlock,
  ctpReportFooter,
  idRow,
  openCtpReport,
  type CtpReportFicha,
} from "./ctp-print-shared";
import type { Contrato } from "./contratos";
import type {
  AvisosDelPermiso,
  CorridaDelPermiso,
  DespachoDelPermiso,
  GuiaDelPermiso,
  TrozasDeGuia,
  VolumenDelPermiso,
} from "./volumen-del-permiso";

/** Lo que hace falta de la ficha del permiso para el papel/Excel: el resto del
 *  contrato (id, área, notas…) no se imprime. */
export type ContratoDeFicha = Pick<
  Contrato,
  "codigo" | "titularNombre" | "tipo" | "region" | "vigenciaDesde" | "vigenciaHasta" | "estado"
>;

export interface PermisoFichaExportData {
  contrato: ContratoDeFicha;
  volumen: VolumenDelPermiso;
  ficha?: CtpReportFicha | null;
}

const GUION = "—";
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/* ─────────────────────────── Los 6 totales (mismas palabras que la pantalla) ─────────────────────────── */

export interface KpiPermiso {
  label: string;
  valor: number | null;
  unidad: "m3" | "pt";
  /** El pt de ROLLIZA (techo/saldo) siempre lleva «≈»; el de aserrada, no. */
  aprox?: boolean;
  negativo?: boolean;
  detalle: string;
}

/**
 * Las seis tarjetas de `CtpPermisoVolumen.tsx`, calcadas en texto: mismas
 * condiciones (`hayIngreso`, `pctConsumido`, `saldoRollizaNeg`, `saldoPtNeg`),
 * mismas frases. Si la pantalla cambia una palabra, este archivo se desalinea
 * a propósito — no hay forma de importar JSX acá, así que el `what` de cada
 * cambio en `CtpPermisoVolumen.tsx` tiene que traer también este.
 */
export function kpisDelPermiso(volumen: VolumenDelPermiso): KpiPermiso[] {
  const t = volumen.totales;
  const hayIngreso = t.guias > 0;
  const pctConsumido = hayIngreso && t.ingresadoM3 > 0 ? (t.consumidoM3 / t.ingresadoM3) * 100 : null;
  const saldoRollizaNeg = t.saldoRollizaM3 < -0.0005;
  const saldoPtNeg = hayIngreso && t.saldoPt < -0.5;
  return [
    {
      label: "Ingresado",
      valor: hayIngreso ? r3(t.ingresadoM3) : null,
      unidad: "m3",
      detalle: hayIngreso
        ? `${plural(t.guias, "guía", "guías")} · ${plural(t.trozas, "troza", "trozas")}`
        : "Ninguna guía de ingreso bajo este permiso",
    },
    {
      label: "Consumido registrado",
      valor: r3(t.consumidoM3),
      unidad: "m3",
      detalle: pctConsumido == null ? "Sin ingreso para comparar" : `${fmtPct(pctConsumido)} % de lo ingresado`,
    },
    {
      label: "Saldo rolliza del libro",
      valor: hayIngreso ? r3(t.saldoRollizaM3) : null,
      unidad: "m3",
      negativo: saldoRollizaNeg,
      detalle: saldoRollizaNeg
        ? "Se consumió más de lo que entró"
        : t.despachadoRollizaM3 > 0
          ? `Ya descuenta ${fmtM3(t.despachadoRollizaM3)} m³ salidos en troza`
          : "Ingresado − consumido (no es el patio físico)",
    },
    {
      label: "Producido",
      valor: t.corridas > 0 ? r3(t.producidoM3) : null,
      unidad: "m3",
      detalle:
        t.corridas > 0
          ? `${fmtPt(t.producidoPt)} pt · ${plural(t.corridas, "corrida", "corridas")}${
              t.rendimientoPct == null ? "" : ` · rinde ${fmtPct(t.rendimientoPct)} %`
            }`
          : "Ninguna corrida bajo este permiso todavía",
    },
    {
      label: "Saldo aserrable",
      valor: hayIngreso ? t.saldoPt : null,
      unidad: "pt",
      aprox: true,
      negativo: saldoPtNeg,
      detalle: saldoPtNeg
        ? "Se produjo más que el techo del 56 %"
        : hayIngreso
          ? `De ≈ ${fmtPt(t.aserrablePt)} pt aserr. que da lo ingresado`
          : "Sin madera ingresada por este permiso: no hay techo que medir",
    },
    {
      label: "Despachado",
      valor: t.despachos > 0 ? r3(t.despachadoM3) : null,
      unidad: "m3",
      detalle:
        t.despachos > 0
          ? `${plural(t.despachos, "despacho", "despachos")}${
              t.despachadoRollizaM3 > 0 ? ` · ${fmtM3(t.despachadoRollizaM3)} m³ en troza` : ""
            }`
          : "Ninguna GTF de salida con esta madera",
    },
  ];
}

/** «≈ 1.234 pt aserr.» / «135,587 m³» / «—». */
function kpiTexto(k: KpiPermiso): string {
  if (k.valor == null) return GUION;
  const num = k.unidad === "pt" ? fmtPt(k.valor) : fmtM3(k.valor);
  return `${k.aprox ? "≈ " : ""}${num} ${k.unidad === "pt" ? "pt aserr." : "m³"}`;
}

/* ─────────────────────────── Avisos (misma lista que «Volumen») ─────────────────────────── */

export interface AvisoDePermiso {
  clave: string;
  grave: boolean;
  texto: string;
}

/** Reusa `lineasDeAvisos` de `CtpPermisoAvisos.tsx`: es pura (sin JSX) y es el
 *  único lugar donde vive el texto de cada aviso — importarla es la única
 *  forma de que el papel diga EXACTAMENTE lo mismo que la pantalla. */
export function avisosDelPermiso(avisos: AvisosDelPermiso): AvisoDePermiso[] {
  return lineasDeAvisos(avisos).map((l) => ({ clave: l.clave, grave: l.grave, texto: l.texto }));
}

/* ─────────────────────────── Por especie ─────────────────────────── */

export interface FilaEspecieExport {
  especie: string;
  sinIngreso: boolean;
  guias: number | null;
  piezas: number | null;
  ingresadoM3: number | null;
  consumidoM3: number | null;
  saldoRollizaM3: number | null;
  saldoRollizaNegativo: boolean;
  aserrablePt: number | null;
  producidoM3: number | null;
  producidoPt: number | null;
  despachadoM3: number | null;
  despachadoRollizaM3: number | null;
  saldoPt: number | null;
  saldoPtNegativo: boolean;
}

/** Calca `TablaPorEspecie` (`CtpPermisoTablas.tsx`): mismas condiciones de
 *  «—» por columna (`entro`, `hay` de producción, `hay` de despacho). */
export function filasPorEspecie(volumen: VolumenDelPermiso): {
  filas: FilaEspecieExport[];
  total: FilaEspecieExport;
} {
  const filas = volumen.especies.map((f): FilaEspecieExport => {
    const entro = !f.sinIngreso;
    const hayProduccion = f.corridas > 0;
    const hayDespacho = f.despachadoM3 > 0 || f.despachadoRollizaM3 > 0;
    return {
      especie: f.especie,
      sinIngreso: f.sinIngreso,
      guias: entro ? f.guias : null,
      piezas: entro && f.piezas > 0 ? f.piezas : null,
      ingresadoM3: entro ? r3(f.ingresadoM3) : null,
      consumidoM3: entro || f.consumidoM3 > 0 ? r3(f.consumidoM3) : null,
      saldoRollizaM3: entro ? r3(f.saldoRollizaM3) : null,
      saldoRollizaNegativo: entro && f.saldoRollizaM3 < -0.0005,
      aserrablePt: entro ? f.aserrablePt : null,
      producidoM3: hayProduccion ? r3(f.producidoM3) : null,
      producidoPt: hayProduccion ? f.producidoPt : null,
      despachadoM3: hayDespacho ? r3(f.despachadoM3) : null,
      /* Real 0 (nada salió en troza), no «—»: «—» es «no hay despacho», no
         «no sabemos cuánto». */
      despachadoRollizaM3: hayDespacho ? r3(f.despachadoRollizaM3) : null,
      saldoPt: entro ? f.saldoPt : null,
      saldoPtNegativo: entro && f.saldoPt < -0.5,
    };
  });
  const t = volumen.totales;
  const hayIngreso = t.guias > 0;
  const hayProduccion = t.corridas > 0;
  const hayDespacho = t.despachos > 0;
  const total: FilaEspecieExport = {
    especie: "Total del permiso",
    sinIngreso: false,
    guias: t.guias,
    piezas: t.piezas > 0 ? t.piezas : null,
    ingresadoM3: hayIngreso ? r3(t.ingresadoM3) : null,
    consumidoM3: r3(t.consumidoM3),
    saldoRollizaM3: r3(t.saldoRollizaM3),
    saldoRollizaNegativo: t.saldoRollizaM3 < -0.0005,
    aserrablePt: hayIngreso ? t.aserrablePt : null,
    producidoM3: hayProduccion ? r3(t.producidoM3) : null,
    producidoPt: hayProduccion ? t.producidoPt : null,
    despachadoM3: hayDespacho ? r3(t.despachadoM3) : null,
    despachadoRollizaM3: hayDespacho ? r3(t.despachadoRollizaM3) : null,
    saldoPt: hayIngreso ? t.saldoPt : null,
    saldoPtNegativo: hayIngreso && t.saldoPt < -0.5,
  };
  return { filas, total };
}

/* ─────────────────────────── Por tipo ─────────────────────────── */

export interface FilaTipoExport {
  especie: string;
  tipo: string;
  corridas: number;
  piezas: number | null;
  m3: number | null;
  pt: number | null;
}

export function filasPorTipo(volumen: VolumenDelPermiso): { filas: FilaTipoExport[]; total: FilaTipoExport } {
  const filas = volumen.porTipo.map(
    (f): FilaTipoExport => ({
      especie: f.especie,
      tipo: tipoCorto(f.tipo),
      corridas: f.corridas,
      piezas: f.piezas > 0 ? f.piezas : null,
      m3: f.m3 == null ? null : r3(f.m3),
      pt: f.pt,
    }),
  );
  const t = volumen.totales;
  const todoSinConvertir = volumen.porTipo.length > 0 && volumen.porTipo.every((f) => f.m3 == null);
  const total: FilaTipoExport = {
    especie: "Total producido",
    tipo: "",
    corridas: t.corridas,
    piezas: null,
    m3: todoSinConvertir ? null : r3(t.producidoM3),
    pt: todoSinConvertir ? null : t.producidoPt,
  };
  return { filas, total };
}

/* ─────────────────────────── Guías de ingreso ─────────────────────────── */

export interface FilaGuiaExport {
  gtf: string;
  fecha: string;
  especie: string;
  producto: string;
  m3: number;
  piezas: number;
  proveedor: string | null;
  consumidoM3: number;
  despachadoRollizaM3: number;
  saldoM3: number;
  trozasTexto: string;
  corridasTexto: string;
}

/** «12 libres · 3 en lote · 2 consumidas» — sólo las cubetas con algo, en el
 *  mismo orden que `TrozasDeGuia`. `null` (guía sin lista) → «—». */
export function trozasPorEstadoTexto(t: TrozasDeGuia | null): string {
  if (!t) return GUION;
  const partes: string[] = [];
  const add = (n: number, singular: string, plural_: string) => {
    if (n > 0) partes.push(`${n} ${n === 1 ? singular : plural_}`);
  };
  add(t.libres, "libre", "libres");
  add(t.enLote, "en lote", "en lote");
  add(t.porRecepcionar, "por recepcionar", "por recepcionar");
  add(t.consumidas, "consumida", "consumidas");
  add(t.despachadas, "despachada", "despachadas");
  add(t.noRecepcionadas, "sin recepcionar", "sin recepcionar");
  add(t.retrozadas, "madre retrozada", "madres retrozadas");
  return partes.length > 0 ? partes.join(" · ") : "0 trozas";
}

/** «N° 12 (0,823 m³), N° 15 (1,200 m³)» — las corridas que comieron de esta guía. */
function corridasDeGuiaTexto(g: GuiaDelPermiso): string {
  if (g.consumos.length === 0) return GUION;
  return g.consumos.map((c) => `N° ${c.lineNo ?? "s/n"} (${fmtM3(c.m3)} m³)`).join(", ");
}

export function filasDeGuias(volumen: VolumenDelPermiso): FilaGuiaExport[] {
  return volumen.guias.map((g) => ({
    gtf: g.gtf,
    fecha: g.fecha,
    especie: g.especie,
    producto: g.producto,
    m3: g.m3,
    piezas: g.piezas,
    proveedor: g.proveedor,
    consumidoM3: g.consumidoM3,
    despachadoRollizaM3: g.despachadoRollizaM3,
    saldoM3: g.saldoM3,
    trozasTexto: trozasPorEstadoTexto(g.trozas),
    corridasTexto: corridasDeGuiaTexto(g),
  }));
}

/* ─────────────────────────── Corridas ─────────────────────────── */

export interface FilaCorridaExport {
  lineNo: number | null;
  fecha: string;
  especie: string;
  tipo: string;
  cantidad: number;
  unidad: string | null;
  piezas: number | null;
  m3: number | null;
  origen: "Atada" | "Heredada";
  parte: number;
  m3DelPermiso: number | null;
  consumidoM3: number;
  guiasTexto: string;
  lote: string | null;
  despachadoM3: number;
}

export function filasDeCorridas(volumen: VolumenDelPermiso): FilaCorridaExport[] {
  return volumen.corridas.map((c) => ({
    lineNo: c.lineNo,
    fecha: c.fecha,
    especie: c.especie ?? "Sin especie",
    tipo: tipoCorto(c.tipo),
    cantidad: c.cantidad,
    unidad: c.unidad,
    piezas: c.piezas,
    m3: c.m3,
    origen: c.origen === "atada" ? "Atada" : "Heredada",
    parte: c.parte,
    m3DelPermiso: c.m3DelPermiso,
    consumidoM3: c.consumidoM3,
    guiasTexto: c.guias.length > 0 ? c.guias.join(", ") : GUION,
    lote: c.lote,
    despachadoM3: c.despachadoM3,
  }));
}

/* ─────────────────────────── Despachos ─────────────────────────── */

export interface FilaDespachoExport {
  lineNo: number | null;
  fecha: string;
  gtf: string | null;
  destino: string | null;
  especie: string | null;
  tipo: string;
  m3: number;
  rollizaM3: number;
  trozas: number;
  corridasTexto: string;
}

function filaDespachoDe(d: DespachoDelPermiso, corridaPorId: ReadonlyMap<string, CorridaDelPermiso>): FilaDespachoExport {
  return {
    lineNo: d.lineNo,
    fecha: d.fecha,
    gtf: d.gtf,
    destino: d.destino,
    especie: d.especie,
    tipo: tipoCorto(d.tipo),
    m3: d.m3,
    rollizaM3: d.rollizaM3,
    trozas: d.trozas,
    corridasTexto:
      d.corridaIds.length > 0
        ? d.corridaIds.map((id) => `N° ${corridaPorId.get(id)?.lineNo ?? "s/n"}`).join(", ")
        : GUION,
  };
}

export function filasDeDespachos(volumen: VolumenDelPermiso): FilaDespachoExport[] {
  const corridaPorId = new Map(volumen.corridas.map((c) => [c.id, c]));
  return volumen.despachos.map((d) => filaDespachoDe(d, corridaPorId));
}

/* ─────────────────────────── Nombre del archivo ─────────────────────────── */

/** El código del permiso, seguro para un nombre de archivo: sólo letras,
 *  números y guiones. `"CON-25/UCA 0142"` → `"CON-25-UCA-0142"`. */
export function sanearCodigoPermiso(codigo: string): string {
  const limpio = codigo
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return limpio || "sin-codigo";
}

/** `permiso-<código saneado>-<fecha de Lima>`, SIN «.xlsx»: `exportSheetsToExcel`
 *  ya la agrega. La fecha es la de la planta (Lima), no la de UTC. */
export function nombreArchivoPermiso(codigo: string, ahora: Date): string {
  const dia = new Intl.DateTimeFormat("en-CA", {
    timeZone: STORE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
  return `permiso-${sanearCodigoPermiso(codigo)}-${dia}`;
}

const NOTA_56 = "El 56 % es un techo (aserrable como máximo).";
const NOTA_SALDO =
  "Saldo de rolliza del libro = ingresado − consumido registrado; no es el patio pieza por pieza.";
const NOTA_DOCUMENTO =
  "Documento interno de planificación. No reemplaza el Libro de Operaciones ni ningún reporte oficial SERFOR.";

/* ═══════════════════════════════ Excel ═══════════════════════════════ */

/** `null` → «—» (texto); un número se queda número. */
const aExcel = (v: number | null): number | string => (v == null ? GUION : v);

function hojaResumen(d: PermisoFichaExportData, ahora: Date): HojaExcel {
  const { contrato, volumen } = d;
  const kpis = kpisDelPermiso(volumen);
  const avisos = avisosDelPermiso(volumen.avisos);
  const filas: { Dato: string; Valor: string }[] = [
    { Dato: "Permiso", Valor: contrato.codigo },
    { Dato: "Titular", Valor: contrato.titularNombre },
    { Dato: "Tipo", Valor: contrato.tipo ? TIPO_LABEL[contrato.tipo] : "Tipo sin definir" },
    { Dato: "Vigencia", Valor: vigenciaTexto(contrato.vigenciaDesde, contrato.vigenciaHasta) },
    { Dato: "Estado", Valor: ESTADO_LABEL[contrato.estado] },
    { Dato: "Generado", Valor: formatDateTime(ahora) },
    { Dato: "", Valor: "" },
  ];
  for (const k of kpis) filas.push({ Dato: k.label, Valor: `${kpiTexto(k)} — ${k.detalle}` });
  filas.push({ Dato: "", Valor: "" });
  filas.push({ Dato: "AVISOS", Valor: avisos.length > 0 ? `${avisos.length}` : "Ninguno" });
  if (avisos.length > 0) {
    for (const a of avisos) filas.push({ Dato: a.grave ? "Aviso" : "Nota", Valor: a.texto });
  } else {
    filas.push({ Dato: "Aviso", Valor: "Nada que corregir: lo registrado bajo este permiso cuadra." });
  }
  filas.push({ Dato: "", Valor: "" });
  filas.push({ Dato: "Nota", Valor: NOTA_56 });
  filas.push({ Dato: "Nota", Valor: NOTA_SALDO });
  return { nombre: "Resumen", filas };
}

function hojaPorEspecie(volumen: VolumenDelPermiso): HojaExcel {
  const { filas, total } = filasPorEspecie(volumen);
  const fila = (f: FilaEspecieExport) => ({
    Especie: f.sinIngreso ? `${f.especie} (sin guía de ingreso)` : f.especie,
    Guías: aExcel(f.guias),
    Piezas: aExcel(f.piezas),
    "Ingresado m³": aExcel(f.ingresadoM3),
    "Consumido m³": aExcel(f.consumidoM3),
    "Saldo rolliza m³": aExcel(f.saldoRollizaM3),
    "Aserrable ≈pt aserr.": aExcel(f.aserrablePt),
    "Producido m³": aExcel(f.producidoM3),
    "Producido pt": aExcel(f.producidoPt),
    "Despachado m³": aExcel(f.despachadoM3),
    "Despachado rolliza m³": aExcel(f.despachadoRollizaM3),
    "Saldo ≈pt aserr.": aExcel(f.saldoPt),
  });
  return { nombre: "Por especie", filas: [...filas.map(fila), fila(total)] };
}

function hojaPorTipo(volumen: VolumenDelPermiso): HojaExcel {
  const { filas, total } = filasPorTipo(volumen);
  const fila = (f: FilaTipoExport) => ({
    Especie: f.especie,
    Tipo: f.tipo || GUION,
    Corridas: f.corridas,
    Piezas: aExcel(f.piezas),
    "m³": aExcel(f.m3),
    pt: aExcel(f.pt),
  });
  return { nombre: "Por tipo", filas: [...filas.map(fila), fila(total)] };
}

function hojaGuias(volumen: VolumenDelPermiso): HojaExcel {
  return {
    nombre: "Guías",
    filas: filasDeGuias(volumen).map((g) => ({
      GTF: g.gtf,
      Fecha: g.fecha.slice(0, 10),
      Especie: g.especie,
      Producto: g.producto,
      "Ingresado m³": r3(g.m3),
      Piezas: g.piezas,
      Proveedor: g.proveedor ?? GUION,
      "Consumido m³": r3(g.consumidoM3),
      "Despachado rolliza m³": r3(g.despachadoRollizaM3),
      "Saldo m³": r3(g.saldoM3),
      "Trozas por estado": g.trozasTexto,
      "Corridas que comieron": g.corridasTexto,
    })),
  };
}

function hojaCorridas(volumen: VolumenDelPermiso): HojaExcel {
  return {
    nombre: "Corridas",
    filas: filasDeCorridas(volumen).map((c) => ({
      "N°": c.lineNo ?? GUION,
      Fecha: c.fecha.slice(0, 10),
      Especie: c.especie,
      Tipo: c.tipo,
      Cantidad: c.cantidad,
      Unidad: c.unidad ?? GUION,
      Piezas: aExcel(c.piezas),
      "m³ de la corrida": aExcel(c.m3),
      Origen: c.origen,
      "Parte del permiso": c.parte,
      "m³ del permiso": aExcel(c.m3DelPermiso),
      "Consumido de este permiso (m³)": c.consumidoM3,
      "Guías de este permiso": c.guiasTexto,
      Lote: c.lote ?? GUION,
      "Despachado m³": c.despachadoM3,
    })),
  };
}

function hojaDespachos(volumen: VolumenDelPermiso): HojaExcel {
  return {
    nombre: "Despachos",
    filas: filasDeDespachos(volumen).map((d) => ({
      "N°": d.lineNo ?? GUION,
      Fecha: d.fecha.slice(0, 10),
      "GTF de salida": d.gtf ?? GUION,
      Destino: d.destino ?? GUION,
      Especie: d.especie ?? GUION,
      Tipo: d.tipo,
      "m³": r3(d.m3),
      "Rolliza m³": r3(d.rollizaM3),
      Trozas: d.trozas,
      Corridas: d.corridasTexto,
    })),
  };
}

function hojaQueSeExporto(d: PermisoFichaExportData, ahora: Date): HojaExcel {
  const { contrato } = d;
  return {
    nombre: "Qué se exportó",
    filas: [
      { Dato: "Permiso", Valor: contrato.codigo },
      { Dato: "Titular", Valor: contrato.titularNombre },
      { Dato: "Fecha de exportación", Valor: formatDateTime(ahora) },
      { Dato: "Nota", Valor: NOTA_56 },
      { Dato: "Nota", Valor: NOTA_SALDO },
      { Dato: "Nota", Valor: NOTA_DOCUMENTO },
    ],
  };
}

/**
 * Las siete hojas del permiso, en orden. PURA: sin ella no se puede probar el
 * Excel sin bajar un archivo de verdad.
 */
export function hojasDelFichaDePermiso(d: PermisoFichaExportData, ahora: Date): HojaExcel[] {
  const { volumen } = d;
  return [
    hojaResumen(d, ahora),
    hojaPorEspecie(volumen),
    hojaPorTipo(volumen),
    hojaGuias(volumen),
    hojaCorridas(volumen),
    hojaDespachos(volumen),
    hojaQueSeExporto(d, ahora),
  ];
}

/** Baja el Excel de la ficha: un solo archivo, siete hojas. */
export async function exportarFichaDelPermiso(d: PermisoFichaExportData): Promise<void> {
  const { exportSheetsToExcel } = await import("@/lib/export-excel");
  const ahora = new Date();
  await exportSheetsToExcel(hojasDelFichaDePermiso(d, ahora), nombreArchivoPermiso(d.contrato.codigo, ahora));
}

/* ═══════════════════════════════ Papel ═══════════════════════════════ */

const CSS = `
  .kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0 14px}
  .kpi{border:1px solid #e2e9e5;border-radius:8px;padding:7px 10px}
  .kpi .kl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.2px;color:#7a8580}
  .kpi .kv{font-size:15px;font-weight:800;color:#0f5132;font-variant-numeric:tabular-nums}
  .kpi .kv.neg{color:#b91c1c}
  .kpi .ks{font-size:10.5px;color:#666;margin-top:1px}
  .avisos{margin:0 0 10px;padding-left:16px;font-size:11.5px}
  .avisos li{margin:2px 0}
  .avisos li.grave{color:#b91c1c;font-weight:700}
  .tbl-compact th,.tbl-compact td{padding:5px 7px;font-size:10.8px}
  .permiso-id{margin-top:2px}
`;

const neg = (texto: string, negativo: boolean) => `<span class="${negativo ? "neg" : ""}">${esc(texto)}</span>`;

function kpiHtml(k: KpiPermiso): string {
  return `<div class="kpi">
    <div class="kl">${esc(k.label)}</div>
    <div class="kv${k.negativo ? " neg" : ""}">${esc(kpiTexto(k))}</div>
    <div class="ks">${esc(k.detalle)}</div>
  </div>`;
}

function avisosHtml(avisos: AvisoDePermiso[]): string {
  if (avisos.length === 0) {
    return `<p class="sub2" style="margin:0 0 10px">Sin avisos: lo registrado bajo este permiso cuadra.</p>`;
  }
  return `<ul class="avisos">${avisos
    .map((a) => `<li class="${a.grave ? "grave" : ""}">${esc(a.texto)}</li>`)
    .join("")}</ul>`;
}

function tablaEspecieHtml(volumen: VolumenDelPermiso): string {
  const { filas, total } = filasPorEspecie(volumen);
  const cM3 = (v: number | null) => (v == null ? GUION : esc(fmtM3(v)));
  const cPt = (v: number | null) => (v == null ? GUION : `≈ ${esc(fmtPt(v))}`);
  const fila = (f: FilaEspecieExport, esTotal: boolean) => `<tr${esTotal ? ' style="font-weight:700;background:#f6f8f7"' : ""}>
    <td>${esc(f.especie)}${f.sinIngreso ? ' <span class="badge" style="background:#fdecea;color:#b91c1c">sin guía de ingreso</span>' : ""}</td>
    <td class="num">${f.guias == null ? GUION : f.guias}</td>
    <td class="num">${f.piezas == null ? GUION : esc(fmtPiezas(f.piezas))}</td>
    <td class="num">${cM3(f.ingresadoM3)}</td>
    <td class="num">${cM3(f.consumidoM3)}</td>
    <td class="num">${f.saldoRollizaM3 == null ? GUION : neg(fmtM3(f.saldoRollizaM3), f.saldoRollizaNegativo)}</td>
    <td class="num">${cPt(f.aserrablePt)}</td>
    <td class="num">${f.producidoM3 == null ? GUION : `${esc(fmtM3(f.producidoM3))} (${esc(fmtPt(f.producidoPt ?? 0))} pt)`}</td>
    <td class="num">${
      f.despachadoM3 == null
        ? GUION
        : `${esc(fmtM3(f.despachadoM3))}${f.despachadoRollizaM3 ? ` (+${esc(fmtM3(f.despachadoRollizaM3))} en troza)` : ""}`
    }</td>
    <td class="num">${f.saldoPt == null ? GUION : neg(`≈ ${fmtPt(f.saldoPt)}`, f.saldoPtNegativo)}</td>
  </tr>`;
  return `<table class="tbl-compact">
    <thead><tr>
      <th>Especie</th><th class="num">Guías</th><th class="num">Piezas</th>
      <th class="num">Ingresado m³</th><th class="num">Consumido m³</th><th class="num">Saldo rolliza m³</th>
      <th class="num">Aserrable ≈pt aserr.</th><th class="num">Producido m³ (pt)</th>
      <th class="num">Despachado m³</th><th class="num">Saldo ≈pt aserr.</th>
    </tr></thead>
    <tbody>${filas.map((f) => fila(f, false)).join("")}</tbody>
    <tfoot>${fila(total, true)}</tfoot>
  </table>`;
}

function tablaTipoHtml(volumen: VolumenDelPermiso): string {
  const { filas, total } = filasPorTipo(volumen);
  const fila = (f: FilaTipoExport, esTotal: boolean) => `<tr${esTotal ? ' style="font-weight:700;background:#f6f8f7"' : ""}>
    <td>${esc(f.especie)}</td>
    <td>${esc(f.tipo || GUION)}</td>
    <td class="num">${f.corridas}</td>
    <td class="num">${f.piezas == null ? GUION : esc(fmtPiezas(f.piezas))}</td>
    <td class="num">${f.m3 == null ? GUION : esc(fmtM3(f.m3))}</td>
    <td class="num">${f.pt == null ? GUION : esc(fmtPt(f.pt))}</td>
  </tr>`;
  return `<table class="tbl-compact">
    <thead><tr><th>Especie</th><th>Tipo</th><th class="num">Corridas</th><th class="num">Piezas</th><th class="num">m³</th><th class="num">pt</th></tr></thead>
    <tbody>${filas.map((f) => fila(f, false)).join("")}</tbody>
    <tfoot>${fila(total, true)}</tfoot>
  </table>`;
}

function tablaGuiasHtml(volumen: VolumenDelPermiso): string {
  const filas = filasDeGuias(volumen);
  if (filas.length === 0) return `<p class="sub2">Ninguna guía de ingreso bajo este permiso.</p>`;
  return `<table class="tbl-compact">
    <thead><tr><th>GTF</th><th>Fecha</th><th>Especie</th><th class="num">Ingresado m³</th><th>Trozas por estado</th><th class="num">Saldo m³</th><th>Corridas que comieron</th></tr></thead>
    <tbody>${filas
      .map(
        (g) => `<tr>
        <td>${esc(g.gtf)}</td>
        <td>${esc(g.fecha.slice(0, 10))}</td>
        <td>${esc(g.especie)}</td>
        <td class="num">${esc(fmtM3(g.m3))}</td>
        <td>${esc(g.trozasTexto)}</td>
        <td class="num">${neg(fmtM3(g.saldoM3), g.saldoM3 < -0.0005)}</td>
        <td>${esc(g.corridasTexto)}</td>
      </tr>`,
      )
      .join("")}</tbody>
  </table>`;
}

function tablaDespachosHtml(volumen: VolumenDelPermiso): string {
  const filas = filasDeDespachos(volumen);
  if (filas.length === 0) {
    return `<p class="sub2">Sin despachos todavía: ninguna GTF de salida lleva madera de este permiso.</p>`;
  }
  return `<table class="tbl-compact">
    <thead><tr><th>GTF de salida</th><th>Fecha</th><th>Destino</th><th class="num">m³</th></tr></thead>
    <tbody>${filas
      .map(
        (d) => `<tr>
        <td>${d.gtf ? esc(`GTF ${d.gtf}`) : "Sin GTF"}</td>
        <td>${esc(d.fecha.slice(0, 10))}</td>
        <td>${esc(d.destino ?? GUION)}</td>
        <td class="num">${esc(fmtM3(d.m3))}</td>
      </tr>`,
      )
      .join("")}</tbody>
  </table>`;
}

/** Abre el papel en una ventana imprimible (guardar como PDF). */
export function imprimirFichaDelPermiso(d: PermisoFichaExportData): void {
  const { contrato, volumen } = d;
  const fecha = formatDateTime(new Date());

  const body = `
  <h1>Ficha del permiso — ${esc(contrato.codigo)}</h1>
  <p class="sub">${esc(d.ficha?.nombreCtp || "Centro de Transformación Primaria")} · Generado: ${esc(fecha)} (hora de Lima)</p>

  ${ctpIdentityBlock(d.ficha, [
    `<div class="permiso-id">${idRow("Permiso:", contrato.codigo)}</div>`,
    idRow("Titular:", contrato.titularNombre),
    idRow("Tipo:", contrato.tipo ? TIPO_LABEL[contrato.tipo] : "Tipo sin definir"),
    idRow("Vigencia:", vigenciaTexto(contrato.vigenciaDesde, contrato.vigenciaHasta)),
    idRow("Estado:", ESTADO_LABEL[contrato.estado]),
  ])}

  <h2>Los seis totales</h2>
  <div class="kpis">${kpisDelPermiso(volumen).map(kpiHtml).join("")}</div>

  <h2>Avisos</h2>
  ${avisosHtml(avisosDelPermiso(volumen.avisos))}

  <h2>Por especie</h2>
  ${tablaEspecieHtml(volumen)}

  <h2>Producción por especie × tipo</h2>
  ${tablaTipoHtml(volumen)}

  <h2>Guías de ingreso</h2>
  ${tablaGuiasHtml(volumen)}

  <h2>Despachos</h2>
  ${tablaDespachosHtml(volumen)}

  ${ctpReportFooter(`${NOTA_56} ${NOTA_SALDO}`)}`;

  openCtpReport({ title: `Ficha del permiso ${contrato.codigo}`, css: CSS, body });
}
