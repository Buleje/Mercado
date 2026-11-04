/**
 * Lo que comparten las piezas del cuaderno de combustible (ADR-533): formatos,
 * clases de los campos y la fecha de un renglón nuevo (la misma regla que usa
 * el servidor en `app/api/admin/combustible/esquemas.ts`).
 */

import { CAMPO_INPUT } from "@/components/admin/shared/campos-personalizados-ui";
import { button } from "@/components/ui-system/button-variants";
import type { NivelAlmacen } from "@/lib/combustible/cuaderno";

export const CAMPO = CAMPO_INPUT;
export const AREA = `${CAMPO_INPUT} h-auto min-h-20 py-2.5 resize-y`;
export const PRIMARIO = button({ variant: "primary", size: "xl", className: "rounded-xl whitespace-normal px-4" });
export const SECUNDARIO =
  "inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-[var(--rule-base)] px-4 text-base font-semibold text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-[var(--text-primary)] disabled:opacity-50";

const LIMA_MS = 5 * 3600_000;

/** «aaaa-mm-dd» de hoy en Lima. */
export const hoyLima = (): string => new Date(Date.now() - LIMA_MS).toISOString().slice(0, 10);

/** «aaaa-mm» del mes en curso en Lima. */
export const mesActualLima = (): string => hoyLima().slice(0, 7);

/**
 * ISO de un renglón nuevo: con hora, esa hora de Lima; sin hora, ahora si es
 * hoy y el mediodía si es otro día (igual que el servidor).
 */
export function fechaIsoDe(fecha: string, hora: string): string {
  if (hora) return new Date(Date.parse(`${fecha}T${hora}:00Z`) + LIMA_MS).toISOString();
  if (fecha === hoyLima()) return new Date().toISOString();
  return new Date(Date.parse(`${fecha}T12:00:00Z`) + LIMA_MS).toISOString();
}

const nf = (d: number) => new Intl.NumberFormat("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: d });
const NF2 = nf(2);
const NF1 = nf(1);
const SOLES = new Intl.NumberFormat("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const gal = (n: number): string => `${NF2.format(n)} gal`;
/** «1 cilindro» / «3 cilindros» (el mismo del papel). */
export { cilindrosTxt as cil } from "@/lib/combustible/reporte-formato";
export const num1 = (n: number): string => NF1.format(n);
export const soles = (n: number): string => `S/ ${SOLES.format(n)}`;

/** «04/11» o «04/11/2026» de un «aaaa-mm-dd». */
export function diaCorto(dia: string, conAnio = false): string {
  const [a, m, d] = dia.split("-");
  return conAnio ? `${d}/${m}/${a}` : `${d}/${m}`;
}

/** «04/11 14:30» de un ISO, en hora de Lima. */
export function fechaHora(iso: string): string {
  const t = new Date(Date.parse(iso) - LIMA_MS).toISOString();
  return `${diaCorto(t.slice(0, 10))} ${t.slice(11, 16)}`;
}

/** Texto y tono de cómo está lo guardado (el aviso del resumen y el saldo diario). */
export const NIVEL: Record<NivelAlmacen, { corto: string; largo: string; tono: "ok" | "aviso" | "error" }> = {
  ok: { corto: "OK", largo: "Dentro de lo declarado.", tono: "ok" },
  tope: { corto: "En el tope", largo: "Estás en el máximo declarado: no compres más hasta gastar.", tono: "aviso" },
  excede: { corto: "Excede", largo: "Hay más cilindros guardados de lo declarado a SUNAT.", tono: "error" },
  osinergmin: { corto: "≥ 264 gal", largo: "264 gal o más guardados: eso pide Registro de Hidrocarburos de OSINERGMIN.", tono: "error" },
  negativo: { corto: "Negativo", largo: "El saldo salió negativo: falta anotar una compra o un vale tiene galones de más.", tono: "error" },
};

export const TONO_TEXTO = {
  ok: "text-[var(--text-secondary)]",
  aviso: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  error: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
} as const;

export const TONO_CAJA = {
  ok: "border-[var(--rule-base)] bg-[var(--surface-raised)]",
  aviso: "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] dark:border-[var(--data-warning-500)]/30 dark:bg-[var(--data-warning-500)]/10",
  error: "border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] dark:border-[var(--data-error-500)]/30 dark:bg-[var(--data-error-500)]/10",
} as const;

/** Número de un input (vacío → null). Acepta coma decimal. */
export function numDe(v: string): number | null {
  const t = v.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
