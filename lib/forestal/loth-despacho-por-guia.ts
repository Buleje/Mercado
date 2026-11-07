/**
 * loth-despacho-por-guia — el Despacho de trozas leído «por guía» (Brandon
 * 08-10): una fila por GTF con su fecha, especie, trozas, m³, destino y si ya
 * entró al CTP; al desplegarla, cada troza con D1/D2/Largo/m³ y el total.
 *
 * Agrupa las líneas que ya dejó pasar el autofiltro de la tabla (las mismas
 * que suma el pie) y les pone al lado los datos de la guía emitida
 * (`/api/admin/forestal/gtf?conCtp=1`). Sólo presentación: no decide qué es
 * vigente ni recalcula nada que la API publique.
 *
 * PURO y client-safe.
 */

import { leerGtfDatos } from "./ctp-gtf-datos";
import { mismoNumeroGtf } from "./gtf-talonario";
import type { LothEntryDTO } from "./loth-constants";
import { especieDeLinea, volumenDeLinea } from "./loth-despacho-medidas";

/** Dónde está la guía respecto del Libro CTP (lo calcula el servidor con `?conCtp=1`). */
export type CtpDeLaGuia = "ingresada" | "por_ingresar" | "otra_empresa";

/** Lo que la vista de despacho lee de una guía emitida. */
export interface GuiaDelDespacho {
  id: string;
  gtfNumber: string;
  gtfDate: string | null;
  planId: string | null;
  anulada: boolean;
  /** A quién se entrega (casillero del destinatario) o el destino de la guía corta. */
  destino: string | null;
  /** Distrito y provincia de llegada. */
  llegada: string | null;
  placa: string | null;
  transportista: string | null;
  conductor: string | null;
  ctp: CtpDeLaGuia | null;
}

/** La guía como llega de `/api/admin/forestal/gtf` (sólo lo que se lee acá). */
export interface GtfDeLaApi {
  id: string;
  gtfNumber: string;
  gtfDate: string | null;
  planId?: string | null;
  status: string;
  tipo?: string;
  destino?: string | null;
  placaVehiculo?: string | null;
  transportista?: string | null;
  conductor?: string | null;
  gtfDatos?: unknown;
  ctp?: CtpDeLaGuia | null;
}

const limpio = (v: string | null | undefined) => v?.trim() || null;

/** De la guía de la API a lo que se muestra. Los casilleros (2)–(38) primero; la guía corta, de respaldo. */
export function datosDeGuia(g: GtfDeLaApi): GuiaDelDespacho {
  const d = g.gtfDatos == null ? null : leerGtfDatos(g.gtfDatos);
  const llegada = d ? [d.destinatario.distrito, d.destinatario.provincia].map(limpio).filter(Boolean).join(", ") : "";
  return {
    id: g.id,
    gtfNumber: g.gtfNumber,
    gtfDate: g.gtfDate,
    planId: g.planId ?? null,
    anulada: g.status === "anulada",
    destino: limpio(d?.destinatario.nombre) ?? limpio(g.destino),
    llegada: llegada || null,
    placa: limpio(d?.vehiculo.placa) ?? limpio(g.placaVehiculo),
    transportista: limpio(d?.transportista.nombre) ?? limpio(g.transportista),
    conductor: limpio(d?.vehiculo.conductor) ?? limpio(g.conductor),
    ctp: g.status === "anulada" ? null : (g.ctp ?? null),
  };
}

/**
 * La guía de un despacho: mismo N° (sin mirar ceros ni espacios) y, entre las
 * del mismo N°, la del mismo permiso y la vigente antes que la anulada. Dos
 * guías del mismo N° de otro permiso no se adivinan: `null`.
 */
export function guiaDeLineas(
  gtfNumber: string | null | undefined,
  planId: string | null | undefined,
  guias: readonly GuiaDelDespacho[],
): GuiaDelDespacho | null {
  if (!gtfNumber?.trim()) return null;
  const mismas = guias.filter((g) => mismoNumeroGtf(g.gtfNumber, gtfNumber));
  if (mismas.length === 0) return null;
  const delPlan = mismas.filter((g) => (g.planId ?? null) === (planId ?? null));
  const pool = delPlan.length > 0 ? delPlan : mismas.length === 1 || mismas.every((g) => g.planId == null) ? mismas : [];
  return [...pool].sort((a, b) => Number(a.anulada) - Number(b.anulada))[0] ?? null;
}

export interface FilaPorGuia {
  /** `<plan>|<N° GTF>`: el mismo N° en dos permisos son dos guías. */
  clave: string;
  gtfNumber: string | null;
  planId: string | null;
  /** El día del despacho (el primero, si se asentó en varios). */
  fecha: string | null;
  especies: string[];
  /** Trozas vigentes. */
  trozas: number;
  anuladas: number;
  /** m³ de las vigentes según su trozado (4 decimales). */
  m3: number;
  /** m³ de las anuladas: se ve tachado, no suma. */
  m3Anuladas: number;
  /** Trozas vigentes sin trozado encontrado: su m³ falta en la suma. */
  sinMedida: number;
  lineas: LothEntryDTO[];
  guia: GuiaDelDespacho | null;
}

const r4 = (n: number) => Math.round(n * 10000) / 10000;
const num = (v: string | null) => (v == null ? 0 : Number(v) || 0);

/** Las líneas de despacho agrupadas por guía: vigentes primero, la más reciente arriba. */
export function despachosPorGuia(lineas: readonly LothEntryDTO[], guias: readonly GuiaDelDespacho[]): FilaPorGuia[] {
  const grupos = new Map<string, FilaPorGuia>();
  for (const e of lineas) {
    const gtf = e.gtfNumber?.trim() || null;
    const clave = `${e.planId ?? ""}|${gtf ?? ""}`;
    let f = grupos.get(clave);
    if (!f) {
      f = { clave, gtfNumber: gtf, planId: e.planId ?? null, fecha: null, especies: [], trozas: 0, anuladas: 0, m3: 0, m3Anuladas: 0, sinMedida: 0, lineas: [], guia: null };
      grupos.set(clave, f);
    }
    f.lineas.push(e);
    const dia = e.entryDate?.slice(0, 10) ?? null;
    if (dia && (!f.fecha || dia < f.fecha)) f.fecha = dia;
    const especie = especieDeLinea(e);
    if (especie && !f.especies.some((x) => x.toLocaleUpperCase("es") === especie.toLocaleUpperCase("es"))) f.especies.push(especie);
    const vol = volumenDeLinea(e);
    if (e.status === "anulado") {
      f.anuladas += 1;
      f.m3Anuladas = r4(f.m3Anuladas + num(vol));
    } else {
      f.trozas += 1;
      f.m3 = r4(f.m3 + num(vol));
      if (vol == null) f.sinMedida += 1;
    }
  }
  const filas = [...grupos.values()];
  for (const f of filas) {
    f.guia = guiaDeLineas(f.gtfNumber, f.planId, guias);
    f.lineas.sort((a, b) => (a.trozaCode ?? "").localeCompare(b.trozaCode ?? "", "es", { numeric: true }));
  }
  /* Las vigentes arriba (lo que se mira), las anuladas debajo; dentro, la más reciente primero. */
  return filas.sort(
    (a, b) =>
      Number(filaAnulada(a)) - Number(filaAnulada(b)) ||
      (b.fecha ?? "").localeCompare(a.fecha ?? "") ||
      (b.gtfNumber ?? "").localeCompare(a.gtfNumber ?? "", "es", { numeric: true }),
  );
}

/** ¿La fila es de una guía anulada? (la guía lo dice; si no se encontró, todas sus líneas anuladas). */
export const filaAnulada = (f: FilaPorGuia): boolean => f.guia?.anulada ?? (f.trozas === 0 && f.anuladas > 0);

/** El texto de «Copiar datos» de un despacho: una línea por dato, para pegar en un WhatsApp. */
export function textoDelDespacho(e: LothEntryDTO, guia: GuiaDelDespacho | null, m: {
  especie: string | null; arbol: string | null; d1: string | null; d2: string | null; largo: string | null; m3: string | null;
}): string {
  const cm = (v: string | null) => (v == null ? "—" : `${Math.round(Number(v) * 100)} cm`);
  const filas = [
    `Troza ${e.trozaCode ?? "—"}${m.arbol ? ` (árbol ${m.arbol})` : ""}`,
    `Especie: ${m.especie ?? "—"}`,
    `D1 ${cm(m.d1)} · D2 ${cm(m.d2)} · Largo ${m.largo == null ? "—" : `${Number(m.largo).toFixed(2)} m`}`,
    `Volumen: ${m.m3 == null ? "—" : `${Number(m.m3).toFixed(4)} m³`}`,
    `GTF ${e.gtfNumber ?? "—"}${e.entryDate ? ` del ${e.entryDate.slice(8, 10)}/${e.entryDate.slice(5, 7)}/${e.entryDate.slice(0, 4)}` : ""}`,
  ];
  if (guia?.destino) filas.push(`Destino: ${guia.destino}${guia.llegada ? ` (${guia.llegada})` : ""}`);
  if (guia?.placa) filas.push(`Placa: ${guia.placa}`);
  if (guia?.transportista) filas.push(`Transportista: ${guia.transportista}`);
  if (guia?.conductor) filas.push(`Conductor: ${guia.conductor}`);
  return filas.join("\n");
}
