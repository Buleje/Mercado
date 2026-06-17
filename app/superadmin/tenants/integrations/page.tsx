"use client";

/**
 * /superadmin/tenants/integrations — Estado de integraciones por tienda
 * (Brandon 2026-06-14). Matriz WhatsApp · Yape · Plin · SUNAT para diagnóstico.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Zap, ArrowLeft, RefreshCw, Check, X, MessageSquare } from "@buleje/design-system/icons";
import { AdminTabShell } from "../../_components/_shared";
import { SuperAdminModuleTabs, TENANTS_TABS } from "@/components/superadmin/_shared/ModuleTabs";
import { fetchSuperadmin } from "@/lib/superadmin/fetch-auth";

type Integ = { whatsapp: boolean; yape: boolean; plin: boolean; sunat: boolean };
type Row = { slug: string; name: string; integrations: Integ; active: number; missing: number };
type Summary = { total: number; whatsapp: number; yape: number; plin: number; sunat: number };

const COLS: { key: keyof Integ; label: string }[] = [
  { key: "whatsapp", label: "WhatsApp" },
  { key: "yape", label: "Yape" },
  { key: "plin", label: "Plin" },
  { key: "sunat", label: "SUNAT" },
];

function Cell({ on }: { on: boolean }) {
  return on ? (
    <span className="inline-flex h-6 w-6 items-center justify-center bg-[var(--data-success-500)]/15 text-[var(--data-success-600,#059669)]"><Check className="h-4 w-4" strokeWidth={3} /></span>
  ) : (
    <span className="inline-flex h-6 w-6 items-center justify-center bg-[var(--data-error-500)]/10 text-[var(--data-error-500)]"><X className="h-4 w-4" strokeWidth={3} /></span>
  );
}

export default function IntegrationsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchSuperadmin("/api/superadmin/tenants/integrations");
      if (res.ok) {
        const d = (await res.json()) as { rows: Row[]; summary: Summary };
        setRows(d.rows ?? []); setSummary(d.summary ?? null);
      }
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <SuperAdminModuleTabs tabs={TENANTS_TABS} />
    <AdminTabShell
      title="Integraciones"
      kicker="Plataforma · Tiendas"
      description="Qué tiene configurado cada tienda: WhatsApp, Yape, Plin y facturación SUNAT."
      icon={Zap}
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {COLS.map((c) => (
            <div key={c.key} className="border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-3">
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">{c.label}</p>
              <p className="mt-1 font-display text-2xl font-extrabold tabular-nums text-[var(--text-primary)]">
                {summary[c.key]}<span className="text-sm text-[var(--text-tertiary)] font-bold">/{summary.total}</span>
              </p>
            </div>
          ))}
        </div>
      )}

      {loading && rows.length === 0 ? (
        <div className="space-y-2">{[0,1,2,3,4].map((i) => <div key={i} className="h-12 animate-pulse bg-[var(--surface-sunken)] border border-[var(--rule-soft)]" />)}</div>
      ) : (
        <div className="overflow-x-auto border border-[var(--rule-base)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--surface-sunken)] text-left text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
                <th className="px-3 py-2.5">Tienda</th>
                {COLS.map((c) => <th key={c.key} className="px-3 py-2.5 text-center">{c.label}</th>)}
                <th className="px-3 py-2.5 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--rule-base)]">
              {rows.map((r) => (
                <tr key={r.slug} className={r.missing >= 3 ? "bg-[var(--data-error-500)]/5" : ""}>
                  <td className="px-3 py-2.5 font-bold text-[var(--text-primary)] truncate max-w-[220px]">{r.name}</td>
                  {COLS.map((c) => <td key={c.key} className="px-3 py-2.5 text-center"><div className="flex justify-center"><Cell on={r.integrations[c.key]} /></div></td>)}
                  <td className="px-3 py-2.5 text-right">
                    {r.missing > 0 ? (
                      <Link href={`/superadmin/chat?tenant=${r.slug}`} className="inline-flex items-center gap-1 text-xs font-bold text-[var(--accent)] hover:underline">
                        <MessageSquare className="h-3.5 w-3.5" /> Ayudar
                      </Link>
                    ) : <span className="text-xs text-[var(--data-success-600,#059669)] font-bold">Completo</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminTabShell>
    </>
  );
}
