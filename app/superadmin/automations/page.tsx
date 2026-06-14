"use client";

/**
 * /superadmin/automations — Automatizaciones (Brandon 2026-06-14). Reglas preset
 * con match en vivo, toggle persistente y "ejecutar ahora" (avisa a los dueños
 * que matchean). Ejecución automática por cron = follow-up.
 */

import { useCallback, useEffect, useState } from "react";
import { Webhook, RefreshCw, Clock, Zap, Loader2, ArrowRight } from "@buleje/design-system/icons";
import { AdminTabShell } from "../_components/_shared";
import { fetchSuperadmin } from "@/lib/superadmin/fetch-auth";
import { csrfHeaders } from "@/lib/csrf-client";

type Rule = { key: string; title: string; trigger: string; action: string; enabled: boolean; lastRunAt: string | null; matchCount: number };

export default function AutomationsPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchSuperadmin("/api/superadmin/automations");
      if (res.ok) setRules(((await res.json()) as { rules: Rule[] }).rules ?? []);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const post = useCallback(async (key: string, op: "toggle" | "run", enabled?: boolean) => {
    setBusy(`${key}-${op}`);
    try {
      const res = await fetch("/api/superadmin/automations", {
        method: "POST", credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ key, op, enabled }),
      });
      if (res.ok) {
        const d = await res.json().catch(() => ({}));
        if (op === "run") window.alert(`Listo. Se notificó a ${d.notified ?? 0} tienda(s).`);
        await load();
      } else {
        window.alert("No se pudo completar la acción.");
      }
    } finally { setBusy(null); }
  }, [load]);

  const run = useCallback((r: Rule) => {
    if (r.matchCount === 0) { window.alert("Ninguna tienda matchea esta regla ahora."); return; }
    if (window.confirm(`¿Notificar ahora a las ${r.matchCount} tiendas que matchean "${r.title}"?`)) void post(r.key, "run");
  }, [post]);

  return (
    <AdminTabShell
      title="Automatizaciones"
      kicker="Plataforma · Operaciones"
      description="Reglas que detectan tiendas y disparan un aviso. Activá, mirá a cuántas afecta y ejecutá."
      icon={Webhook}
      actions={
        <button onClick={() => void load()} disabled={loading} className="inline-flex h-11 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualizar
        </button>
      }
    >
      <p className="text-xs text-[var(--text-tertiary)] mb-4">
        La ejecución automática programada (cron) es un próximo paso; por ahora cada regla se ejecuta manualmente con &quot;Ejecutar ahora&quot;.
      </p>

      {loading && rules.length === 0 ? (
        <div className="space-y-3">{[0,1,2,3].map((i) => <div key={i} className="h-28 animate-pulse bg-[var(--surface-sunken)] border border-[var(--rule-soft)]" />)}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rules.map((r) => (
            <div key={r.key} className="border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">{r.title}</h3>
                  <p className="text-xs text-[var(--text-secondary)] mt-1 flex items-center gap-1.5 flex-wrap">
                    <span>{r.trigger}</span>
                    <ArrowRight className="h-3 w-3 text-[var(--text-tertiary)]" />
                    <span>{r.action}</span>
                  </p>
                </div>
                {/* Toggle */}
                <button
                  onClick={() => void post(r.key, "toggle", !r.enabled)}
                  disabled={busy === `${r.key}-toggle`}
                  aria-pressed={r.enabled}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${r.enabled ? "bg-[var(--accent)]" : "bg-[var(--surface-sunken)] border border-[var(--rule-base)]"}`}
                >
                  <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${r.enabled ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>

              <div className="mt-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${r.matchCount > 0 ? "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-600,#d97706)]" : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"}`}>
                    <Zap className="h-3 w-3" /> {r.matchCount} {r.matchCount === 1 ? "tienda" : "tiendas"}
                  </span>
                  {r.lastRunAt && (
                    <span className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                      <Clock className="h-3 w-3" /> última: {new Date(r.lastRunAt).toLocaleDateString("es-PE")}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => run(r)}
                  disabled={busy === `${r.key}-run`}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[var(--accent)] px-3 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50"
                >
                  {busy === `${r.key}-run` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />} Ejecutar ahora
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminTabShell>
  );
}
