"use client";

/**
 * Insignias de una fila de fiado: semáforo de vencimiento, racha de pagos a
 * tiempo, estrellas de confiabilidad y el avatar con iniciales.
 * Salieron de FiadosModule al partirlo (sin cambiar qué calculan).
 */
import { CheckCircle2, Flame, Star } from "@buleje/design-system/icons";
import StatusBadge from "@/components/admin/shared/StatusBadge";
import { cn, limaDateKey } from "@/lib/utils";
import { diaDe, diasEntre } from "@/lib/fiados/gestion-cobranza";
import { computeReliabilityScore, type ReliabilityScore } from "@/lib/fiados/reliability";
import { yaVencio } from "./cifras-me-deben";
import type { Fiado } from "./tipos";

const DIA_MS = 24 * 60 * 60 * 1000;

export function FiadoSemaphore({ fiado }: { fiado: { status: string; fechaVence?: string } }) {
  if (fiado.status === "PAGADO") return <StatusBadge variant="success" label="Pagado" icon={CheckCircle2} size="sm" />;
  if (fiado.status === "CANCELADO") return null;

  /* Días de Lima, como Indicadores y «Por vencer» (10-10): el que vence hoy no está vencido. */
  const hoy = limaDateKey();
  const dia = diaDe(fiado.fechaVence);
  const faltan = dia ? diasEntre(hoy, dia) : null;

  // Bloqueado: vencido hace más de 60 días
  if (faltan != null && faltan < -60) {
    return <StatusBadge variant="error" label="Bloqueado" dot size="sm" pulse />;
  }
  if (yaVencio(fiado, hoy)) {
    const diasVencido = faltan != null ? -faltan : 0;
    return <StatusBadge variant="error" label={`Vencido${diasVencido > 0 ? ` hace ${diasVencido}d` : ""}`} dot size="sm" />;
  }
  if (faltan != null && faltan <= 7) {
    return <StatusBadge variant="warning" label={faltan === 0 ? "Vence hoy" : `Vence en ${faltan}d`} dot size="sm" pulse />;
  }
  // Sin fecha no hay contra qué estar «al día» (H03/M31): antes salía verde.
  if (!dia) return <span title="No tiene fecha de vencimiento: ponle una en la columna Vencimiento"><StatusBadge variant="neutral" label="Sin plazo" dot size="sm" /></span>;
  return <StatusBadge variant="success" label="Al día" dot size="sm" />;
}

/** Racha de fiados pagados a tiempo (3 o más seguidos). */
export function FiadoStreakBadge({ customerId, fiados }: { customerId: string; fiados: Fiado[] }) {
  const clientFiados = fiados.filter((f) => f.customerId === customerId && f.status === "PAGADO");
  if (clientFiados.length < 3) return null;

  const sorted = [...clientFiados].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  let streak = 0;
  for (const f of sorted) {
    const pagado = new Date(f.updatedAt).getTime();
    const vence = f.fechaVence ? new Date(f.fechaVence).getTime() : new Date(f.createdAt).getTime() + 30 * DIA_MS;
    if (pagado <= vence) streak++;
    else break;
  }
  if (streak < 3) return null;
  const Icono = streak >= 5 ? Star : Flame;
  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-sm font-bold",
      streak >= 5 ? "bg-[var(--data-warning-100)] text-[var(--data-warning-700)]" : "bg-[var(--data-success-100)] text-[var(--data-success-700)]",
    )}>
      <Icono className="h-3 w-3" aria-hidden /> {streak} pagos a tiempo
    </span>
  );
}

// Cache de scores por cliente para no recalcular en cada fila
const reliabilityCache = new Map<string, ReliabilityScore>();

const COLOR_ESTRELLAS: Record<number, string> = {
  5: "text-[var(--data-success-500)]",
  4: "text-[var(--data-success-500)]",
  3: "text-[var(--data-warning-500)]",
  2: "text-[var(--data-error-500)]",
  1: "text-[var(--data-error-500)]",
};

export function FiadoReliabilityBadge({ customerId, fiados }: { customerId: string; fiados: Fiado[] }) {
  const cacheKey = `${customerId}-${fiados.length}`;
  let score = reliabilityCache.get(cacheKey);
  if (!score) {
    score = computeReliabilityScore(fiados.filter((f) => f.customerId === customerId));
    reliabilityCache.set(cacheKey, score);
  }
  if (!score.sufficientHistory) return <span className="ml-1 text-sm italic text-[var(--text-secondary)]">Sin historial</span>;
  return (
    <span
      className={cn("ml-1 text-sm font-bold", COLOR_ESTRELLAS[score.score] ?? "text-[var(--text-tertiary)]")}
      title={`Calificación por pagos a tiempo. 5 estrellas = siempre puntual. A tiempo: ${score.pagosATiempo}/${score.pagosTotal} · Promedio: ${Math.round(score.diasPromedioPago)} días`}
    >
      {score.label}
    </span>
  );
}

const COLORES_AVATAR = [
  "var(--accent)",
  "var(--data-info-500)",
  "var(--data-warning-500)",
  "var(--data-error-500)",
  "var(--accent-dark)",
  "var(--data-success-700)",
];

/** Círculo con las iniciales; el color sale del nombre (siempre el mismo). */
export function FiadoAvatar({ nombre, className }: { nombre: string; className?: string }) {
  let h = 0;
  for (let i = 0; i < nombre.length; i++) h = nombre.charCodeAt(i) + ((h << 5) - h);
  const color = COLORES_AVATAR[Math.abs(h) % COLORES_AVATAR.length];
  const iniciales = nombre.split(" ").map((w) => w[0]).join("").substring(0, 2).toUpperCase();
  return (
    <div aria-hidden className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white", className)} style={{ backgroundColor: color }}>
      {iniciales}
    </div>
  );
}
