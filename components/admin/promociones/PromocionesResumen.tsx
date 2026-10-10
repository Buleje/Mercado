"use client";

import { TrendingUp, Zap, Flame, BadgePercent, type LucideIcon } from "@buleje/design-system/icons";
import { formatNumber } from "@/lib/format";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { Promociones } from "@/components/admin/promociones/hooks/use-promociones";

type Indicador = { label: string; corto: string; value: string; sub?: string; icon: LucideIcon; tint: string; estimado?: boolean };

/**
 * Indicadores de Promociones, plegables y recordados (ley de la vista). Plegados siguen diciendo sus
 * cifras en una línea. Usos e ingreso son ESTIMADOS (la promo no queda en el pedido): se dice con «~» y ⓘ.
 */
export default function PromocionesResumen({ prm, abierto, id }: { prm: Promociones; abierto: boolean; id: string }) {
  const { promos, active, inactive, campaigns, topPromo, totalUses, totalRevenue } = prm;
  if (promos.length === 0) return null;
  const items: Indicador[] = [
    {
      label: "Activas", corto: "Activas", value: String(active.length),
      sub: `${inactive.length} inactiva${inactive.length === 1 ? "" : "s"} · ${campaigns.length} campaña${campaigns.length === 1 ? "" : "s"}`,
      icon: Zap, tint: "var(--data-success-500)",
    },
    { label: "Usos estimados", corto: "Usos", value: `~${totalUses}`, icon: TrendingUp, tint: "var(--accent)", estimado: true },
    { label: "Ingreso estimado", corto: "Ingreso", value: `~S/${formatNumber(totalRevenue, { max: 0 })}`, icon: BadgePercent, tint: "var(--data-info-500)", estimado: true },
    { label: "Más usada", corto: "Más usada", value: topPromo?.name || "—", sub: topPromo ? `~${topPromo.estimatedUses} usos` : "", icon: Flame, tint: "var(--data-warning-500)", estimado: true },
  ];

  if (!abierto) {
    return (
      <p id={id} className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-[var(--text-secondary)]">
        {items.map((s) => (
          <span key={s.label} title={s.sub || undefined}>
            {s.corto} <strong className="font-bold tabular-nums text-[var(--text-primary)]">{s.value}</strong>
          </span>
        ))}
        <span className="text-[var(--text-tertiary)]">{inactive.length} inactiva{inactive.length === 1 ? "" : "s"} · {campaigns.length} campaña{campaigns.length === 1 ? "" : "s"}</span>
      </p>
    );
  }

  return (
    <div id={id} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((s) => (
        <div key={s.label} className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
          <div className="flex items-center gap-2">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-lg"
              style={{ backgroundColor: `color-mix(in srgb, ${s.tint} 14%, transparent)`, color: s.tint }}
            >
              <s.icon className="h-4 w-4" strokeWidth={2} aria-hidden />
            </span>
            <p className="text-sm font-semibold text-[var(--text-secondary)]">{s.label}</p>
            {s.estimado && (
              <InfoTip
                title={s.label}
                what="Es un cálculo aproximado, no sale de tus ventas: el pedido todavía no guarda qué promoción usó."
                affects="Usos: 2 por día desde que creaste la promo (tope 50); si está inactiva, 1 por día (tope 10). Ingreso: usos × compra mínima (o S/ 50 si no tiene)."
                example="Una promo activa creada hace 7 días con compra mínima S/ 40 cuenta ~14 usos y ~S/560."
              />
            )}
          </div>
          <p className="mt-1.5 truncate font-display text-2xl font-extrabold tabular-nums text-[var(--text-primary)]">{s.value}</p>
          {s.sub && <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">{s.sub}</p>}
        </div>
      ))}
    </div>
  );
}
