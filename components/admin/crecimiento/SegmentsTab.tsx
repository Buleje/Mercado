"use client";

import { CardTitle } from "@buleje/design-system";
import { useState, useEffect } from "react";
import {
  Users, Crown, Clock, Cake, AlertTriangle, Send, Loader2, Bot,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Segmentos accionables ───────────────────────────────────────────────────────
// Conteo en vivo (via /api/campaigns/audience-count) + qué automatización ya corre
// + CTA para crear una campaña dirigida (reusa el flujo de la pestaña Campañas).

type Segment = "todos" | "vip" | "inactivos" | "cumpleanos" | "deudores";

const SEGMENTS: Array<{
  id: Segment;
  label: string;
  icon: typeof Users;
  desc: string;
  auto: string | null;
}> = [
  {
    id: "inactivos",
    label: "Inactivos (30 días)",
    icon: Clock,
    desc: "No compran hace un mes. El grupo con más riesgo de perderse.",
    auto: "Ya reciben un recordatorio de recompra automático a los ~15 días.",
  },
  {
    id: "cumpleanos",
    label: "Cumpleañeros del mes",
    icon: Cake,
    desc: "Cumplen años este mes. Un saludo vende más que un descuento frío.",
    auto: "Ya reciben saludo + cupón automático el día de su cumpleaños.",
  },
  {
    id: "deudores",
    label: "Con deuda (fiado)",
    icon: AlertTriangle,
    desc: "Tienen saldo de fiado pendiente.",
    auto: "Ya reciben un recordatorio de pago automático.",
  },
  {
    id: "vip",
    label: "VIP (oro + diamante)",
    icon: Crown,
    desc: "Tus mejores clientes por nivel de lealtad. Cuídalos.",
    auto: null,
  },
  {
    id: "todos",
    label: "Todos los clientes",
    icon: Users,
    desc: "Toda tu base registrada con permiso de promociones.",
    auto: null,
  },
];

export default function SegmentsTab({ onCreateCampaign }: { onCreateCampaign: (segment: string) => void }) {
  const [counts, setCounts] = useState<Record<string, number | null>>({});

  useEffect(() => {
    let active = true;
    Promise.all(
      SEGMENTS.map((s) =>
        fetch(`/api/campaigns/audience-count?segment=${s.id}`)
          .then((r) => (r.ok ? r.json() : { count: null }))
          .then((d) => [s.id, d.count ?? null] as const)
          .catch(() => [s.id, null] as const),
      ),
    ).then((pairs) => {
      if (active) setCounts(Object.fromEntries(pairs));
    });
    return () => { active = false; };
  }, []);

  return (
    <div className="space-y-3 sm:space-y-5">
      <div>
        <CardTitle className="text-lg font-extrabold text-[var(--text-primary)] flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" /> Segmentos de clientes
        </CardTitle>
        <p className="text-sm text-[var(--text-secondary)] mt-0.5">
          Cuántos clientes hay en cada grupo y qué automatización ya trabaja por ti. Crea una campaña dirigida en un clic.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {SEGMENTS.map((s) => {
          const Icon = s.icon;
          const count = counts[s.id];
          return (
            <div key={s.id} className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-primary flex items-center justify-center shrink-0">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-[var(--text-primary)]">{s.label}</p>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">{s.desc}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-2xl font-extrabold text-[var(--text-primary)] leading-none">
                    {count === null || count === undefined ? <Loader2 className="h-5 w-5 animate-spin text-[var(--text-tertiary)]" /> : count}
                  </p>
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-1">clientes</p>
                </div>
              </div>

              {s.auto && (
                <p className="text-[length:var(--ts-2xs)] text-[var(--data-success-500)] inline-flex items-center gap-1 bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] rounded-lg px-2 py-1">
                  <Bot className="h-3 w-3 shrink-0" /> {s.auto}
                </p>
              )}

              <button
                onClick={() => onCreateCampaign(s.id)}
                disabled={count === 0}
                className={cn(
                  "mt-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold transition-colors",
                  count === 0
                    ? "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] cursor-not-allowed"
                    : "bg-primary text-white hover:bg-primary/90",
                )}
              >
                <Send className="h-4 w-4" /> Crear campaña
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-[var(--text-tertiary)]">
        Los conteos solo incluyen clientes que aceptaron recibir promociones (Ley 29733).
      </p>
    </div>
  );
}
