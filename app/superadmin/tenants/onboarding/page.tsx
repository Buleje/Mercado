"use client";

/**
 * /superadmin/tenants/onboarding — Activación de tiendas (gestión de tiendas,
 * Brandon 2026-06-14). Muestra qué hitos completó cada tienda y resalta las
 * estancadas para reactivarlas (clave para convertir trials).
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Rocket, ArrowLeft, RefreshCw, Check, MessageSquare, Image, Package, ShoppingBag, Banknote } from "@buleje/design-system/icons";
import { AdminTabShell } from "../../_components/_shared";
import { fetchSuperadmin } from "@/lib/superadmin/fetch-auth";

type Step = "logo" | "productos" | "pedido" | "venta";
type Row = {
  slug: string; name: string; createdAt: string;
  steps: Record<Step, boolean>; done: number; total: number; pct: number;
  stuckAt: Step | null; complete: boolean;
};

const STEP_META: Record<Step, { label: string; icon: typeof Image }> = {
  logo: { label: "Logo", icon: Image },
  productos: { label: "Productos", icon: Package },
  pedido: { label: "1er pedido", icon: ShoppingBag },
  venta: { label: "1ra venta POS", icon: Banknote },
};
const STEPS: Step[] = ["logo", "productos", "pedido", "venta"];

export default function TenantsOnboardingPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<{ total: number; complete: number; stuck: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchSuperadmin("/api/superadmin/tenants/onboarding");
      if (res.ok) {
        const d = (await res.json()) as { rows: Row[]; summary: typeof summary };
        setRows(d.rows ?? []);
        setSummary(d.summary ?? null);
      }
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <AdminTabShell
      title="Activación de tiendas"
      kicker="Plataforma · Tiendas"
      description="Hitos de setup completados por cada tienda. Reactiva las estancadas."
      icon={Rocket}
      actions={
        <div className="flex items-center gap-2">
          <button onClick={() => void load()} disabled={loading} className="inline-flex h-11 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualizar
          </button>
          <Link href="/superadmin/tenants" className="inline-flex h-11 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40">
            <ArrowLeft className="h-4 w-4" /> Tiendas
          </Link>
        </div>
      }
    >
      {summary && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-3">
            <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">Total</p>
            <p className="mt-1 font-display text-2xl font-extrabold tabular-nums text-[var(--text-primary)]">{summary.total}</p>
          </div>
          <div className="border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-3">
            <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">Activadas</p>
            <p className="mt-1 font-display text-2xl font-extrabold tabular-nums text-[var(--data-success-600,#059669)]">{summary.complete}</p>
          </div>
          <div className="border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-3">
            <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">Estancadas</p>
            <p className="mt-1 font-display text-2xl font-extrabold tabular-nums text-[var(--data-warning-600,#d97706)]">{summary.stuck}</p>
          </div>
        </div>
      )}

      {loading && rows.length === 0 ? (
        <div className="space-y-2">{[0,1,2,3,4].map((i) => <div key={i} className="h-16 animate-pulse bg-[var(--surface-sunken)] border border-[var(--rule-soft)]" />)}</div>
      ) : (
        <div className="border border-[var(--rule-base)] divide-y divide-[var(--rule-base)]">
          {rows.map((r) => (
            <div key={r.slug} className={`flex flex-wrap items-center gap-4 px-3 py-3 ${r.complete ? "" : "bg-[var(--data-warning-500)]/5"}`}>
              <div className="min-w-[160px] flex-1">
                <p className="text-sm font-bold text-[var(--text-primary)] truncate">{r.name}</p>
                <p className="text-xs text-[var(--text-tertiary)]">
                  {r.complete ? "Activada ✓" : `Estancada en: ${r.stuckAt ? STEP_META[r.stuckAt].label : "—"}`}
                </p>
              </div>
              {/* Pasos */}
              <div className="flex items-center gap-1.5">
                {STEPS.map((s) => {
                  const done = r.steps[s];
                  const Icon = STEP_META[s].icon;
                  return (
                    <span
                      key={s}
                      title={`${STEP_META[s].label}: ${done ? "hecho" : "pendiente"}`}
                      className={`inline-flex h-8 w-8 items-center justify-center border ${done ? "bg-[var(--data-success-500)]/15 border-[var(--data-success-500)]/40 text-[var(--data-success-600,#059669)]" : "bg-[var(--surface-sunken)] border-[var(--rule-soft)] text-[var(--text-tertiary)]"}`}
                    >
                      {done ? <Check className="h-4 w-4" strokeWidth={3} /> : <Icon className="h-4 w-4" />}
                    </span>
                  );
                })}
              </div>
              <span className="tabular-nums text-sm font-bold text-[var(--text-secondary)] w-14 text-right">{r.done}/{r.total}</span>
              {!r.complete && (
                <Link href={`/superadmin/chat?tenant=${r.slug}`} className="inline-flex items-center gap-1 text-xs font-bold text-[var(--accent)] hover:underline shrink-0">
                  <MessageSquare className="h-3.5 w-3.5" /> Reactivar
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </AdminTabShell>
  );
}
