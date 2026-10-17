import { useState } from "react";
import { cn } from "@/lib/utils";
import { HEALTH_CONFIG, type HealthScore } from "@/components/admin/cliente360/cliente360-compartido";

/** Insignias de la ficha 360: segmento por gasto y salud del cliente. */
// ── Mejora 9: Customer segment badge ─────────────────────────────────────────
export function CustomerSegmentBadge({ totalSpent, orderCount }: { totalSpent: number; orderCount: number }) {
  if (orderCount === 0) return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] border border-[var(--data-success-500)]/30">Nuevo</span>;
  if (totalSpent > 1000) return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--data-warning-50)] text-[var(--data-warning-500)] border border-[var(--data-warning-500)]">VIP</span>;
  if (totalSpent > 500) return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] border border-[var(--data-success-500)]/30">Premium</span>;
  return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--surface-sunken)] text-[var(--text-secondary)] border border-[var(--rule-base)]">Regular</span>;
}

// ── Health Badge ───────────────────────────────────────────────────────────

export function HealthBadge({ score }: { score?: HealthScore }) {
  const key = score ?? "desconocido";
  const cfg = HEALTH_CONFIG[key] ?? HEALTH_CONFIG.desconocido;
  const [showTip, setShowTip] = useState(false);

  return (
    <div className="relative inline-block">
      <span
        onMouseEnter={() => setShowTip(true)}
        onMouseLeave={() => setShowTip(false)}
        className={cn("text-xs font-extrabold px-2 py-0.5 rounded-full border cursor-help", cfg.bg, cfg.color, cfg.border)}
      >
        {cfg.label}
      </span>
      {showTip && (
        <div className="absolute left-0 top-full mt-1 z-50 w-64 bg-gray-900 text-white text-xs leading-relaxed rounded-lg px-3 py-2 pointer-events-none">
          <p className="font-bold mb-1">Salud del cliente</p>
          <p>Activo: compra en últimos 30 días</p>
          <p>En riesgo: 31-90 días sin comprar</p>
          <p>Perdido: +90 días sin comprar</p>
        </div>
      )}
    </div>
  );
}
