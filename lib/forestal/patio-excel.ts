/**
 * patio-excel — el patio por permiso en UN Excel (ADR-431).
 *
 * Lo usan Consumos («Descargar el patio por permiso») y Saldos (sus 4 hojas de
 * siempre más éstas), y las dos bajan UN archivo en UNA llamada a
 * `exportSheetsToExcel`: llamar `exportToExcel` N veces da N archivos y el
 * navegador bloquea el segundo.
 *
 * Los nombres de hoja salen de acá YA saneados, sin repetirse (sin distinguir
 * mayúsculas, contra todas las hojas del libro) y de ≤31 caracteres: exceljs
 * lanza «Worksheet name already exists» o «can't be empty», y `exportSheetsToExcel`
 * corta a 31 DESPUÉS de cualquier sufijo, así que un « (2)» agregado afuera se
 * perdía y el Excel entero fallaba en el clic.
 *
 * Los números van como NÚMERO: un «135,587» en texto no se suma en Excel.
 *
 * PURO y client-safe (`HojaExcel` es sólo un tipo).
 */

import type { HojaExcel } from "@/lib/export-excel";
import { formatDateNumeric, formatDateTime } from "@/lib/format";
import { STORE_TIMEZONE } from "@/lib/utils";
import { LABEL_BLOQUEO, diametroDe, motivoBloqueo, type TrozaConsumible } from "./consumo-trozas";
import { diasDelAsiento, diasEnPatio } from "./patio-dias";
import type { ResumenPorPermiso } from "./patio-por-permiso";

/** Lo que Excel admite: 31 caracteres y sin `[ ] : * ? / \`. */
const LARGO_HOJA = 31;

export const HOJA_POR_PERMISO = "Por permiso";
export const HOJA_QUE_SE_EXPORTO = "Qué se exportó";
/** El nombre de la hoja de la madera sin permiso declarado (nunca vacío). */
export const HOJA_SIN_PERMISO = "Sin permiso";

/**
 * Sanea un nombre como lo haría `exportSheetsToExcel`, más lo que exceljs
 * también rechaza: el apóstrofo al principio o al final y el nombre vacío.
 */
export function sanearNombreHoja(nombre: string): string {
  const limpio = nombre
    .replace(/[[\]:*?/\\]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^'+|'+$/g, "")
    .slice(0, LARGO_HOJA)
    .trim();
  return limpio || HOJA_SIN_PERMISO;
}

/**
 * Un nombre de hoja que no choca con ninguno de `ocupados` (sin distinguir
 * mayúsculas, como compara exceljs). Si choca, corta ANTES de agregar el
 * sufijo « (2)», « (3)»…: así el sufijo sobrevive al tope de 31.
 */
export function nombreDeHojaUnico(nombre: string, ocupados: ReadonlySet<string>): string {
  const base = sanearNombreHoja(nombre);
  if (!ocupados.has(base.toLowerCase())) return base;
  for (let n = 2; ; n += 1) {
    const sufijo = ` (${n})`;
    const candidato = `${base.slice(0, LARGO_HOJA - sufijo.length).trimEnd()}${sufijo}`;
    if (!ocupados.has(candidato.toLowerCase())) return candidato;
  }
}

/**
 * `patio-por-permiso-AAAA-MM-DD`, SIN «.xlsx»: `exportSheetsToExcel` ya la
 * agrega. La fecha es la de la planta (Lima): a las 20:00 del 24 en UTC ya es
 * 25, y el archivo saldría fechado mañana.
 */
export function nombreArchivoPatio(ahora: Date): string {
  const dia = new Intl.DateTimeFormat("en-CA", {
    timeZone: STORE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
  return `patio-por-permiso-${dia}`;
}

export interface EntradaExcelPatio {
  /** `resumenPorPermiso(...)` de la pila ENTERA del alcance. */
  porPermiso: ResumenPorPermiso;
  /** Lo visible/filtrado en la pantalla: va pieza por pieza, una hoja por permiso. */
  trozas: readonly TrozaConsumible[];
  ahora: Date;
  /** Los filtros aplicados, ya en texto (`notaDeFiltros`). */
  filtros: readonly string[];
  /** Código del permiso activo de «Solo este permiso»; `null` = toda la planta. */
  alcance: string | null;
  /**
   * Hojas que el MISMO libro ya tiene (Saldos manda sus 4 fijas): los nombres
   * nuevos no pueden chocar con ellas.
   */
  hojasExistentes?: readonly string[];
  /** Si el patio vino cortado por el tope: un Excel truncado no puede parecer completo. */
  truncado?: { total: number; devueltas: number } | null;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const fecha = (iso: string | null | undefined) => (iso ? formatDateNumeric(iso, { soloFecha: true }) : null);

function estadoDe(t: TrozaConsumible, ahora: Date): string {
  if (t.guiaRecepcionada === false) {
    const dias = diasDelAsiento(t, ahora);
    return dias == null
      ? "Por recepcionar (la guía no tiene fecha de asiento)"
      : `Por recepcionar: guía asentada hace ${dias} días (sin recepcionar)`;
  }
  const motivo = motivoBloqueo(t);
  if (motivo) return LABEL_BLOQUEO[motivo];
  if (t.loteAserrioId) return `Apartada en el lote ${t.loteAserrioCode ?? ""}`.trim();
  return "Libre";
}

function filaDeTroza(t: TrozaConsumible, ahora: Date): Record<string, unknown> {
  const diametro = diametroDe(t);
  return {
    "Código planta": t.codigoPlanta ?? "",
    Codificación: t.codificacion ?? "",
    Especie: t.especieComun ?? "",
    Guía: t.gtfNumber ?? "",
    "Largo m": t.largoM ?? null,
    "Diámetro cm": diametro,
    "m³": t.volumenM3 == null ? null : r3(Number(t.volumenM3)),
    /* Vacío para lo por recepcionar: no está en el patio (su estado lo dice). */
    "Días en patio": diasEnPatio(t, ahora),
    Estado: estadoDe(t, ahora),
  };
}

function hojaPorPermiso(porPermiso: ResumenPorPermiso): HojaExcel {
  return {
    nombre: HOJA_POR_PERMISO,
    filas: porPermiso.filas.map((f) => ({
      Permiso: f.permiso ?? HOJA_SIN_PERMISO,
      "Trozas en patio": f.enPatio.trozas,
      "m³ en patio": r3(f.enPatio.m3),
      "≈pt aserrable (derivado 56 %)": f.enPatio.ptAserrable,
      Libres: f.libres.trozas,
      "En lote": f.enLote.trozas,
      "Por recepcionar (trozas)": f.porRecepcionar.trozas,
      "Por recepcionar (m³)": r3(f.porRecepcionar.m3),
      Guías: f.guias,
      Especies: f.especies,
      "Más vieja en patio": fecha(f.masVieja?.fecha),
      "Días en patio": f.masVieja?.dias ?? null,
      /* No son días en el patio: la madera no bajó (ADR-431, C7). */
      "Por recepcionar: guía asentada hace (días)": f.porRecepcionar.asientoMasViejo?.dias ?? null,
    })),
  };
}

function hojaQueSeExporto(input: EntradaExcelPatio): HojaExcel {
  const { porPermiso, ahora, filtros, alcance, truncado } = input;
  const filas: { Dato: string; Valor: string | number }[] = [
    { Dato: "Fecha", Valor: formatDateTime(ahora) },
    { Dato: "Alcance", Valor: alcance ? `Solo este permiso: ${alcance}` : "Toda la planta" },
    { Dato: "Filtros", Valor: filtros.length > 0 ? filtros.join(" · ") : "Ninguno" },
    { Dato: "Trozas en patio", Valor: porPermiso.totales.enPatio.trozas },
    { Dato: "m³ en patio", Valor: r3(porPermiso.totales.enPatio.m3) },
    { Dato: "Por recepcionar (trozas)", Valor: porPermiso.totales.porRecepcionar.trozas },
    { Dato: "Por recepcionar (m³)", Valor: r3(porPermiso.totales.porRecepcionar.m3) },
    {
      Dato: "Qué es",
      Valor: "m³ del patio pieza por pieza; no es el saldo declarado ante SERFOR",
    },
    {
      Dato: "≈pt aserrable",
      Valor: "Derivado: m³ en patio × 56 % de rendimiento × 424 pt/m³. No es madera aserrada.",
    },
    {
      Dato: "Por recepcionar",
      Valor: "Madera anotada cuya guía no se recepcionó: no está en el patio ni cuenta días en él.",
    },
  ];
  if (truncado && truncado.devueltas < truncado.total) {
    filas.push({
      Dato: "¡Incompleto!",
      Valor: `El patio tiene ${truncado.total} trozas y este archivo trae ${truncado.devueltas}: las hojas por permiso no están completas.`,
    });
  }
  return { nombre: HOJA_QUE_SE_EXPORTO, filas };
}

/**
 * Las hojas, en orden: «Por permiso», una por permiso con sus trozas (en el
 * orden de las filas del resumen; lo que no tiene fila va después) y «Qué se
 * exportó». Una hoja sin filas la salta `exportSheetsToExcel`.
 */
export function hojasDelPatioPorPermiso(input: EntradaExcelPatio): HojaExcel[] {
  const ocupados = new Set((input.hojasExistentes ?? []).map((h) => sanearNombreHoja(h).toLowerCase()));
  const reservar = (nombre: string) => {
    const unico = nombreDeHojaUnico(nombre, ocupados);
    ocupados.add(unico.toLowerCase());
    return unico;
  };

  const resumen = hojaPorPermiso(input.porPermiso);
  resumen.nombre = reservar(resumen.nombre);
  /* Se reserva ya: una hoja de permiso no puede quedarse con este nombre. */
  const nombreFinal = reservar(HOJA_QUE_SE_EXPORTO);

  const porPermiso = new Map<string, TrozaConsumible[]>();
  for (const t of input.trozas) {
    const k = (t.permiso ?? "").trim() || HOJA_SIN_PERMISO;
    const lista = porPermiso.get(k) ?? [];
    lista.push(t);
    porPermiso.set(k, lista);
  }
  const orden = input.porPermiso.filas.map((f) => f.permiso ?? HOJA_SIN_PERMISO);
  const claves = [...orden.filter((k) => porPermiso.has(k)), ...[...porPermiso.keys()].filter((k) => !orden.includes(k))];

  const hojasPermiso: HojaExcel[] = claves.map((k) => ({
    nombre: reservar(k),
    filas: (porPermiso.get(k) ?? []).map((t) => filaDeTroza(t, input.ahora)),
  }));

  return [resumen, ...hojasPermiso, { ...hojaQueSeExporto(input), nombre: nombreFinal }];
}
