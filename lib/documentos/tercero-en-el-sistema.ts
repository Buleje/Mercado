/**
 * «De <comunidad> en el sistema» (Esenciales, Brandon 24-10): lo que el
 * tercero ligado a una carpeta ya tiene en otros módulos —su cuenta, sus
 * permisos, sus guías, sus compras, sus papeles— en cifras y con el enlace
 * para ir a verlo. Puro: el servidor lo arma (`TerceroEnElSistemaDB`) y el
 * panel lo dibuja.
 */
import { formatCurrency } from "@/lib/currency";
import type { TipoTercero } from "@/lib/documentos/terceros-vinculo";

export type TonoBloque = "bien" | "atencion" | "neutro";

export interface BloqueEnElSistema {
  /** Estable: `cuenta`, `permisos`, `guias`, `papeles`, `compras`, `fiado`, `puesto`. */
  id: string;
  titulo: string;
  /** La cifra en una línea («Te debe S/ 1,250.00», «3 guías»). */
  cifra: string;
  detalle?: string;
  tono?: TonoBloque;
  /** Ruta del panel (`/admin?tab=…`) del módulo que lo tiene. */
  href?: string;
  enlace?: string;
}

export interface TerceroEnElSistema {
  clave: string;
  tipo: TipoTercero;
  nombre: string;
  /** DNI/RUC: sólo para dueño, admin y encargado. */
  detalle: string | null;
  ficha: { href: string; texto: string } | null;
  bloques: BloqueEnElSistema[];
  /** Lo que el rol de quien mira no ve («su cuenta»): se dice en una línea, sin cifras. */
  sinPermiso: string[];
}

/** Bajo medio céntimo es cero: la cuenta no queda «te debe S/ 0.00». */
const CERO = 0.005;
const soles = (n: number) => formatCurrency(Math.abs(n));

/**
 * El neto de la cuenta con la convención de `unificarCuentas`: positivo = TE
 * debe, negativo = le debes.
 */
export function textoDeNeto(neto: number): { cifra: string; tono: TonoBloque } {
  if (!Number.isFinite(neto) || Math.abs(neto) < CERO) return { cifra: "Al día", tono: "bien" };
  return neto > 0 ? { cifra: `Te debe ${soles(neto)}`, tono: "atencion" } : { cifra: `Le debes ${soles(neto)}`, tono: "atencion" };
}

/**
 * Las dos partes de la cuenta de una comunidad (`GuiaPlataDB.resumenPersona`):
 * `deAdelantos` positivo = te debe; `porGuias` positivo = le debes.
 */
export function detalleDeCuenta(deAdelantos: number | null, porGuias: number): string | undefined {
  const partes: string[] = [];
  if (deAdelantos !== null && Math.abs(deAdelantos) >= CERO) {
    partes.push(`Adelantos: ${deAdelantos > 0 ? "te debe" : "le debes"} ${soles(deAdelantos)}`);
  }
  if (Math.abs(porGuias) >= CERO) partes.push(`Guías: ${porGuias > 0 ? "le debes" : "te debe"} ${soles(porGuias)}`);
  return partes.length > 0 ? partes.join(" · ") : undefined;
}

/** «1 guía» / «3 guías». */
export function cuantos(n: number, uno: string, varios: string): string {
  return `${n.toLocaleString("es-PE")} ${n === 1 ? uno : varios}`;
}

/** m³ con 2 decimales («1,234.50 m³», el mismo formato que la plata). */
export function m3(n: number): string {
  return `${(Math.round(n * 100) / 100).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m³`;
}

/**
 * «10/09/2026» de un ISO o Date (día de Lima); vacío si no hay fecha. Un día
 * sin hora («2026-10-15», vigencias y fechas de ingreso) se lee tal cual: como
 * instante sería la medianoche UTC y en Lima caería el día anterior.
 */
export function fechaDia(f: string | Date | null | undefined): string {
  if (!f) return "";
  const solo = typeof f === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(f) : null;
  if (solo) return `${solo[3]}/${solo[2]}/${solo[1]}`;
  const t = new Date(f).getTime();
  if (Number.isNaN(t)) return "";
  const d = new Date(t - 5 * 60 * 60 * 1000);
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${dos(d.getUTCDate())}/${dos(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

/** El enlace del Archivo que trae todos los papeles con esa etiqueta, cruzando carpetas (ADR-502). */
export function hrefDeEtiqueta(tag: string, rotulo: string): string {
  const q = new URLSearchParams({ tab: "documentos", vista: "drive", etiqueta: tag, et: rotulo });
  return `/admin?${q.toString()}`;
}
