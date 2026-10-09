"use client";

/**
 * Insignias de una fila de fiado: semáforo de vencimiento, racha de pagos a
 * tiempo, estrellas de confiabilidad y el avatar con iniciales.
 * Salieron de FiadosModule al partirlo (sin cambiar qué calculan).
 */
import { CheckCircle2, Flame, Star } from "@buleje/design-system/icons";
import StatusBadge from "@/components/admin/shared/StatusBadge";
import { cn } from "@/lib/utils";
import { computeReliabilityScore, type ReliabilityScore } from "@/lib/fiados/reliability";
import type { Fiado } from "./tipos";

const DIA_MS = 24 * 60 * 60 * 1000;

export function FiadoSemaphore({ fiado }: { fiado: { status: string; fechaVence?: string } }) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (fiado.status === "PAGADO") return <StatusBadge variant="success" label="Pagado" icon={CheckCircle2} size="sm" />;
  if (fiado.status === "CANCELADO") return null;

  const vence = fiado.fechaVence ? new Date(fiado.fechaVence) : null;
  if (vence) vence.setHours(0, 0, 0, 0);

  // Bloqueado: vencido hace más de 60 días
  if (vence && vence.getTime() < now.getTime() - 60 * DIA_MS) {
    return <StatusBadge variant="error" label="Bloqueado" dot size="sm" pulse />;
  }
  if (fiado.status === "VENCIDO" || (vence && vence < now)) {
    const diasVencido = vence ? Math.floor((now.getTime() - vence.getTime()) / DIA_MS) : 0;
    return <StatusBadge variant="error" label={`Vencido${diasVencido > 0 ? ` hace ${diasVencido}d` : ""}`} dot size="sm" />;
  }
  if (vence) {
    const diasRestantes = Math.floor((vence.getTime() - now.getTime()) / DIA_MS);
    if (diasRestantes <= 7) return <StatusBadge variant="warning" label={`Vence en ${diasRestantes}d`} dot size="sm" pulse />;
  }
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
      "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-bold",
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
  if (!score.sufficientHistory) return <span className="ml-1 text-xs italic text-[var(--text-tertiary)]">Sin historial</span>;
  return (
    <span
      className={cn("ml-1 text-xs font-bold", COLOR_ESTRELLAS[score.score] ?? "text-[var(--text-tertiary)]")}
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
    <div aria-hidden className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white", className)} style={{ backgroundColor: color }}>
      {iniciales}
    </div>
  );
}
