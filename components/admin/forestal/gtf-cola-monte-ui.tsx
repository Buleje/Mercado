/**
 * Piezas chicas de la cola «Por imprimir» del monte (16-10), compartidas por la
 * pastilla de la tabla GTF, el detalle de la oficina y las tarjetas del monte.
 */

import type { ReactNode } from "react";
import { Camera, CheckCircle2, Clock, Printer, TriangleAlert } from "@buleje/design-system/icons";
import type { EstadoTrabajo } from "@/lib/forestal/gtf-salida-tipos";
import { ETIQUETA_ESTADO } from "@/lib/forestal/gtf-cola-monte";

/** Tono de cada estado: por imprimir (info), impresa (marca), confirmada (verde), observada (rojo). */
export const TONO_ESTADO: Record<EstadoTrabajo, string> = {
  pendiente: "bg-[var(--data-info-50)] text-[var(--data-info-700)] dark:bg-[var(--data-info-500)]/15 dark:text-[var(--data-info-500)]",
  impresa: "bg-[var(--accent)]/12 text-[var(--accent-ink)] dark:text-[var(--accent)]",
  confirmada: "bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]",
  observada: "bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]",
  anulado: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
};

const ICONO_ESTADO = { pendiente: Clock, impresa: Printer, confirmada: CheckCircle2, observada: TriangleAlert, anulado: Clock } as const;

/** La pastilla del estado. Con `onClick` es botón (la fila de la oficina); sin él, una etiqueta. */
export function PastillaEstadoMonte({
  estado,
  conFoto = false,
  onClick,
  titulo,
  className = "",
}: {
  estado: EstadoTrabajo;
  conFoto?: boolean;
  onClick?: () => void;
  titulo?: string;
  className?: string;
}) {
  const Icono = ICONO_ESTADO[estado];
  const contenido: ReactNode = (
    <>
      <Icono className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {ETIQUETA_ESTADO[estado]}
      {conFoto && <Camera className="h-3.5 w-3.5 shrink-0 opacity-80" aria-label="con foto" />}
    </>
  );
  const clase = `inline-flex min-h-6 items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-bold ${TONO_ESTADO[estado]} ${className}`;
  if (!onClick) return <span className={clase} data-qa="estado-monte">{contenido}</span>;
  return (
    <button type="button" onClick={onClick} title={titulo} data-qa="pastilla-monte" className={`${clase} transition hover:opacity-80`}>
      {contenido}
    </button>
  );
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const dos = (n: number) => String(n).padStart(2, "0");

/** «jueves 16/10 · 14:05» en hora de Lima (Perú no cambia de hora: UTC−5 fijo). */
export function cuandoLima(iso: string | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const d = new Date(t - 5 * 3_600_000);
  return `${DIAS[d.getUTCDay()]} ${dos(d.getUTCDate())}/${dos(d.getUTCMonth() + 1)} · ${dos(d.getUTCHours())}:${dos(d.getUTCMinutes())}`;
}

/** La foto de la hoja: un documento de la guía (ADR-482), visto por su ruta con sesión. */
export const srcFotoHoja = (numeroGuia: string, docId: string): string =>
  `/api/admin/forestal/guias/documentos/ver?gtf=${encodeURIComponent(numeroGuia)}&id=${encodeURIComponent(docId)}`;

const BOTON_BASE =
  "inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl px-2 text-center text-sm font-bold leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 disabled:cursor-not-allowed disabled:opacity-50";
const BOTON_TONO = {
  marca: "bg-[var(--accent-dark)] text-white shadow-sm hover:brightness-110",
  oscuro: "bg-[var(--brand-ink)] text-white shadow-sm hover:opacity-90",
  claro: "border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]",
} as const;

/** Botón del celular del monte: 56 px de alto, ancho de su celda, el texto parte en dos líneas antes que desbordar a 400 px. */
export const botonMonte = (tono: keyof typeof BOTON_TONO = "claro"): string => `${BOTON_BASE} ${BOTON_TONO[tono]}`;
