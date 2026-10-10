/**
 * Tipos, formatos y mapeo de «Cuadrar caja» (`?tab=ventas-caja&vista=arqueo`).
 *
 * Sacado de `CashAuditTab.tsx` (695 líneas) al partirlo: la lógica pura vive
 * acá, los componentes sólo dibujan.
 */
import { CheckCircle2, AlertTriangle, TrendingDown, TrendingUp } from "@buleje/design-system/icons";
import { veredictoArqueo, type ArqueoEstado } from "@/lib/caja/arqueo-veredicto";
import { leerNotasArqueo } from "@/lib/caja/leer-notas-arqueo";
import { observacionDeLaNota } from "@/lib/caja/conteo-efectivo";
import { formatNumber } from "@/lib/format";

export type AuditStatus = ArqueoEstado;

export type CashMovementRaw = {
  id: string;
  type: string;
  amount: number;
  method: string;
  description: string;
  createdAt: string;
};

export type CashRegisterRaw = {
  id: string;
  openedAt: string;
  closedAt?: string | null;
  openingAmount: number;
  closingAmount?: number | null;
  expectedAmount?: number | null;
  difference?: number | null;
  status: string;
  notes?: string | null;
  /** Sólo cajas abiertas: el efectivo que debería haber AHORA (backend, misma fórmula del cierre). */
  efectivoEsperado?: number | null;
  movements?: CashMovementRaw[];
};

/** Un conteo express hecho durante el turno (movimiento `arqueo` de la caja). */
export type ConteoExpress = {
  id: string;
  creadoEn: string;
  contado: number;
  diferencia: number | null;
  observacion: string | null;
};

/** Quién abrió y quién cerró cada caja, del registro de auditoría (`/api/cash-registers/historial`). */
export type QuienPorCaja = Record<string, { abrio?: string; cerro?: string }>;

export type CashAudit = {
  id: string;
  abierta: boolean;
  openedAt: string;
  closedAt: string | null;
  fecha: string;
  turno: string;
  /** Quien abrió la caja: el cajero del turno. Antes salía de la nota del cierre. */
  cajero: string;
  cerro: string;
  expectedAmount: number;
  countedAmount: number;
  difference: number;
  status: AuditStatus;
  notes: string;
  conteos: ConteoExpress[];
};

/** Título de una ventana armada a mano: la misma clase que el de `AdminModal`. */
export const TITULO_VENTANA = "font-display text-base sm:text-lg font-semibold text-[var(--text-primary)] tracking-tight";

export const fmt = (n: number) => "S/ " + formatNumber(n, { min: 2 });
/** «+S/ 3.00» · «−S/ 50.00» (el signo delante: «S/ -50.00» se leía como un monto raro). */
export const fmtSigno = (n: number) => (n < 0 ? "−" : n > 0 ? "+" : "") + fmt(Math.abs(n));

export const STATUS_MAP: Record<AuditStatus, { label: string; color: string; bg: string; icon: typeof CheckCircle2 }> = {
  pendiente: { label: "Abierta", color: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]", bg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30", icon: AlertTriangle },
  conforme: { label: "Conforme", color: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]", bg: "bg-primary/10 dark:bg-primary/15", icon: CheckCircle2 },
  sobrante: { label: "Sobrante", color: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]", bg: "bg-primary/10 dark:bg-primary/15", icon: TrendingUp },
  faltante: { label: "Faltante", color: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]", bg: "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30", icon: TrendingDown },
  // Lo cerró el cron o el «Cerrar turno» sin contar: el monto es el calculado.
  sin_conteo: { label: "Cerrada sin conteo", color: "text-[var(--text-secondary)]", bg: "bg-[var(--surface-sunken)]", icon: AlertTriangle },
  // Un esperado negativo no existe en una caja física: hay que revisar los movimientos.
  imposible: { label: "Revisar movimientos", color: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]", bg: "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30", icon: AlertTriangle },
};

// ── Fechas en hora de Lima (UTC−5 fijo, sin horario de verano) ───────────────

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;
const LIMA_MS = 5 * 60 * 60 * 1000;

function enLima(iso: string): Date | null {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? new Date(t - LIMA_MS) : null;
}

/** «jueves 10/09» */
export function diaYFecha(iso: string): string {
  const d = enLima(iso);
  if (!d) return iso;
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${DIAS[d.getUTCDay()]} ${dd}/${mm}`;
}

/** «14:32» */
export function horaLima(iso: string): string {
  const d = enLima(iso);
  if (!d) return "—";
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export function turnoDe(iso: string): string {
  const d = enLima(iso);
  if (!d) return "—";
  const h = d.getUTCHours();
  if (h >= 6 && h < 14) return "mañana";
  if (h >= 14 && h < 20) return "tarde";
  return "noche";
}

// ── Mapeo ─────────────────────────────────────────────────────────────────────

export function conteosDe(r: CashRegisterRaw): ConteoExpress[] {
  return (r.movements ?? [])
    .filter((m) => m.type === "arqueo")
    .map((m) => ({
      id: m.id,
      creadoEn: m.createdAt,
      contado: m.amount,
      diferencia: leerNotasArqueo(m.description).diferencia,
      observacion: observacionDeLaNota(m.description),
    }))
    .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
}

export function mapRegisterToAudit(r: CashRegisterRaw, quien: QuienPorCaja = {}): CashAudit {
  const diff = r.difference ?? (r.closingAmount != null && r.expectedAmount != null ? r.closingAmount - r.expectedAmount : null);
  // Caja abierta: su esperado vivo; cerrada: el que se congeló al cerrar.
  const esperado = r.expectedAmount ?? r.efectivoEsperado ?? r.openingAmount;
  const status = veredictoArqueo({
    expectedAmount: esperado,
    countedAmount: r.closingAmount,
    difference: diff,
    notes: r.notes,
    closedAt: r.closedAt,
  });
  return {
    id: r.id,
    abierta: r.status === "abierta",
    openedAt: r.openedAt,
    closedAt: r.closedAt ?? null,
    fecha: diaYFecha(r.openedAt),
    turno: turnoDe(r.openedAt),
    // La apertura escribe «Nombre (detalle)» en la nota; el cierre la pisa, así
    // que sólo sirve de respaldo mientras la caja sigue abierta.
    cajero: quien[r.id]?.abrio ?? ((r.status === "abierta" && (r.notes ?? "").split(" (")[0].trim()) || "—"),
    cerro: quien[r.id]?.cerro ?? "",
    expectedAmount: esperado,
    countedAmount: r.closingAmount ?? 0,
    difference: diff ?? 0,
    status,
    notes: status === "pendiente" ? "" : (r.notes ?? ""),
    conteos: conteosDe(r),
  };
}

// ── Filtros de la tabla ───────────────────────────────────────────────────────

export type FiltroCuadre = "todos" | "faltantes" | "revisar" | "conformes";

export const FILTROS: { id: FiltroCuadre; label: string; pasa: (a: CashAudit) => boolean }[] = [
  { id: "todos", label: "Todos", pasa: () => true },
  { id: "faltantes", label: "Faltantes", pasa: (a) => a.status === "faltante" },
  { id: "revisar", label: "A revisar", pasa: (a) => a.status === "sin_conteo" || a.status === "imposible" || a.status === "pendiente" },
  { id: "conformes", label: "Conformes", pasa: (a) => a.status === "conforme" || a.status === "sobrante" },
];

/** Texto del cuadre para mandarlo por WhatsApp al dueño. */
export function textoWhatsApp(a: CashAudit): string {
  const lineas = [
    `Cuadre de caja · ${a.fecha} (${a.turno})`,
    a.cajero !== "—" ? `Abrió: ${a.cajero}${a.cerro ? ` · Cerró: ${a.cerro}` : ""}` : "",
    `Esperado: ${fmt(a.expectedAmount)}`,
    a.status !== "pendiente" ? `Contado: ${fmt(a.countedAmount)}` : "Caja abierta",
    a.status !== "pendiente" ? `Diferencia: ${fmtSigno(a.difference)} · ${STATUS_MAP[a.status].label}` : "",
    a.conteos[0] ? `Último conteo: ${fmt(a.conteos[0].contado)} a las ${horaLima(a.conteos[0].creadoEn)}` : "",
  ];
  return lineas.filter(Boolean).join("\n");
}
