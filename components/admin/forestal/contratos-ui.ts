/**
 * contratos-ui — cómo se escriben y se pintan los contratos en pantalla (ADR-421).
 *
 * Presentación pura, compartida por la lista, la banda de candidatos y el
 * balance. Está aparte para que las tres digan lo mismo: si «vencido» es coral
 * en la lista, tiene que serlo en la ficha.
 */

import { fmtSoles } from "@/lib/forestal/cubicacion-formato";
import type { BalanceContrato, EstadoContrato, TipoContrato } from "@/lib/forestal/contratos";

/** Lo que dice el papel, en el idioma del patio. */
export const TIPO_LABEL: Record<TipoContrato, string> = {
  "PER-FMP": "Permiso predio privado",
  "PER-FMC": "Permiso comunidad nativa",
  "REG-PLT": "Plantación registrada",
  CONCESION: "Concesión forestal",
  CONTRATO: "Contrato",
  DEMA: "DEMA",
  PMFI: "PMFI",
  PO: "Plan operativo",
  otro: "Otro papel",
};

export const ESTADO_LABEL: Record<EstadoContrato, string> = {
  vigente: "Vigente",
  vencido: "Vencido",
  cerrado: "Cerrado",
  suspendido: "Suspendido",
};

/**
 * El color del estado. Vigente en teal (el acento de la marca), vencido en
 * coral —es lo único que pide una acción— y cerrado/suspendido en gris: un
 * contrato terminado no es un problema, es historia.
 */
export const ESTADO_CLASE: Record<EstadoContrato, string> = {
  vigente:
    "bg-[var(--data-success-500)]/15 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  vencido:
    "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  cerrado: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
  suspendido:
    "bg-[var(--data-error-500)]/15 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
};

/**
 * Soles, o «—» cuando el número no existe. Un 0 acá sería un costo inventado.
 *
 * El `-0` se normaliza a `0`: la columna de abonos resta, y un «S/ -0.00» se
 * lee como un error de cuenta cuando lo único que dice es «no hubo abonos»
 * (mismo criterio que el redondeo de pie tablar del cubicador).
 */
export const soles = (v: number | null | undefined): string =>
  v == null ? "—" : `S/ ${fmtSoles(Math.abs(v) < 0.005 ? 0 : v)}`;

/**
 * ¿Hay algo registrado en estos bloques?
 *
 * Sin un solo documento, el bloque no vale «S/ 0»: vale «acá no se imputó
 * nada». La diferencia importa — en este negocio hay S/ 20 942 de adelantos que
 * existen y no cuelgan de ningún contrato, y un «S/ 0.00» los daría por
 * inexistentes en vez de por no imputados.
 */
export const hayMovimiento = (...bloques: { documentos: number }[]): boolean =>
  bloques.some((b) => b.documentos > 0);

/**
 * Fecha date-only en UTC: la vigencia de un permiso se guarda a las 00:00 UTC y
 * en Lima (−5) se leería como el día anterior.
 */
export const fmtFechaCorta = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleDateString("es-PE", {
        timeZone: "UTC",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "—";

/** «Del 01/01/2026 al 31/12/2026», con los extremos que haya. */
export function vigenciaTexto(desde: string | null, hasta: string | null): string {
  if (!desde && !hasta) return "Sin vigencia cargada";
  if (desde && hasta) return `${fmtFechaCorta(desde)} → ${fmtFechaCorta(hasta)}`;
  return desde ? `Desde ${fmtFechaCorta(desde)}` : `Hasta ${fmtFechaCorta(hasta)}`;
}

/** Plural del patio: «1 documento» / «3 documentos». */
export const documentos = (n: number): string => `${n} ${n === 1 ? "documento" : "documentos"}`;

/**
 * ¿Hay UN sol imputado a este contrato?
 *
 * No alcanza con que existan ingresos de madera: si los 24 están sin precio, la
 * suma da 0 y ese 0 diría «bajo este permiso no se puso plata», cuando lo cierto
 * es «todavía nadie cargó lo que costó». Esa distinción es la razón de ser de
 * esta pantalla — un balance que se calla los ingresos sin valorizar miente por
 * omisión.
 */
export function hayEgresosImputados(b: BalanceContrato): boolean {
  const sinValorizar = b.madera.sinValorizar ?? 0;
  const maderaConPrecio = b.madera.documentos > 0 && sinValorizar < b.madera.documentos;
  return maderaConPrecio || hayMovimiento(b.gastos, b.fletes, b.adelantos);
}
