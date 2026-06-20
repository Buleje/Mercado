"use client";

/**
 * TenantDetailConsole — Ficha 360 del negocio (Brandon 2026-06-19, idea #2). Una
 * sola pantalla con TODO de un tenant: identidad/plan, health + engagement,
 * conteos, integraciones, pedidos, errores del panel y actividad. Acciones:
 * Impersonar, Contactar, Ver tienda. Datos reales de /tenants/[slug]/overview.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, LogIn, MessageSquare, ExternalLink, RefreshCw, ShoppingBag, Users,
  Package, ShieldAlert, Activity, CheckCircle2, MinusCircle, Store, Sparkles, Loader2,
} from "@buleje/design-system/icons";
import { SAKpiCard } from "@/components/superadmin/_shared/SAKpiCard";
import { useVisiblePolling } from "@/components/superadmin/_shared/useVisiblePolling";
import { csrfHeaders } from "@/lib/csrf-client";

type AiResult = { summary: string; action: string; draft: string; ai: boolean };
type Health = { score: number; riskLevel: string; loginsLast7d: number; loginsLast30d: number; ordersLast7d: number; ordersLast30d: number; featuresUsed: number; daysSinceLastOrder: number; daysSinceLastLogin: number; trialDaysLeft: number | null; calculatedAt: string };
type Overview = {
  tenant: { id: string; name: string; slug: string; active: boolean; plan: string; trialEndsAt: string | null; createdAt: string; logoUrl: string | null; customDomain: string | null; address: string | null };
  health: Health | null;
  counts: { products: number; customers: number; orders: number; errors: number };
  integrations: { whatsapp: boolean; yape: boolean; plin: boolean; sunat: boolean };
  recentOrders: { id: string; total: number; status: string; createdAt: string }[];
  errors: { id: string; message: string; source: string; count: number; lastSeenAt: string }[];
  activity: { action: string; entity: string; detail: string; user: string; createdAt: string }[];
};

const soles = (n: number) => `S/ ${Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2 })}`;
const date = (iso: string) => new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
const timeAgo = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "recién"; if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
};
const RISK: Record<string, { label: string; cls: string }> = {
  low: { label: "Saludable", cls: "text-[var(--data-success-600,#059669)] bg-[var(--data-success-500)]/10" },
  medium: { label: "Atención", cls: "text-[#0d9488] bg-[#0d9488]/10" },
  high: { label: "En riesgo", cls: "text-[var(--data-error-600,#dc2626)] bg-[var(--data-error-500)]/10" },
  critical: { label: "Crítico", cls: "text-white bg-[var(--data-error-600,#dc2626)]" },
};

function IntegChip({ on, label }: { on: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 py-2">
      {on ? <CheckCircle2 className="h-4 w-4 text-[var(--data-success-600,#059669)] shrink-0" /> : <MinusCircle className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />}
      <span className="text-sm font-bold text-[var(--text-primary)]">{label}</span>
      <span className={`ml-auto text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider ${on ? "text-[var(--data-success-600,#059669)]" : "text-[var(--text-tertiary)]"}`}>{on ? "ok" : "no"}</span>
    </div>
  );
}

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
      <header className="flex items-center justify-between gap-2 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-4 py-3">
        <h3 className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">{title}</h3>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function TenantDetailConsole({ slug }: { slug: string }) {
  const [d, setD] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState<AiResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/superadmin/tenants/${encodeURIComponent(slug)}/overview`, { credentials: "include", cache: "no-store" });
      if (res.status === 404) { setNotFound(true); return; }
      if (res.ok) setD((await res.json()) as Overview);
    } finally { if (!silent) setLoading(false); }
  }, [slug]);
  useEffect(() => { void load(); }, [load]);
  useVisiblePolling(() => void load(true), 30_000);

  const impersonate = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/superadmin/impersonate", { method: "POST", credentials: "include", headers: csrfHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ slug }) });
      if (res.ok) window.open(`/t/${encodeURIComponent(slug)}/admin`, "_blank");
    } finally { setBusy(false); }
  }, [slug]);

  const askCopilot = useCallback(async () => {
    if (!d) return;
    setAiLoading(true); setCopied(false);
    try {
      const res = await fetch("/api/superadmin/ai-assist", {
        method: "POST", credentials: "include", headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ task: "tenant-copilot", context: {
          name: d.tenant.name, plan: d.tenant.plan,
          score: d.health?.score ?? null, riskLevel: d.health?.riskLevel,
          daysSinceLastOrder: d.health?.daysSinceLastOrder, daysSinceLastLogin: d.health?.daysSinceLastLogin,
          trialDaysLeft: d.health?.trialDaysLeft ?? null, ordersTotal: d.counts.orders, errorsCount: d.counts.errors,
        } }),
      });
      if (res.ok) setAi((await res.json()) as AiResult);
    } finally { setAiLoading(false); }
  }, [d]);

  if (loading && !d) return <div className="h-96 animate-pulse rounded-2xl bg-[var(--surface-sunken)] border border-[var(--rule-base)]" />;
  if (notFound) return <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] p-10 text-center"><p className="text-sm font-bold text-[var(--text-primary)]">Negocio no encontrado: <span className="font-mono">{slug}</span></p></div>;
  if (!d) return null;

  const t = d.tenant;
  const h = d.health;
  const risk = h ? (RISK[h.riskLevel] ?? RISK.medium) : null;
  const msg = `Hola, te escribo del equipo Buleje para ver cómo va ${t.name} y si necesitás una mano con algo.`;

  return (
    <div className="space-y-4">
      {/* Header del negocio */}
      <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4 sm:p-5">
        <div className="flex items-start gap-4 flex-wrap">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] overflow-hidden shrink-0">
            {t.logoUrl ? <img src={t.logoUrl} alt="" className="h-full w-full object-cover" /> : <Store className="h-6 w-6 text-[var(--text-tertiary)]" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-display text-xl sm:text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">{t.name}</h2>
              <span className="rounded-full bg-[var(--accent)]/10 px-2.5 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--accent)]">{t.plan}</span>
              <span className={`rounded-full px-2.5 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider ${t.active ? "bg-[var(--data-success-500)]/10 text-[var(--data-success-600,#059669)]" : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"}`}>{t.active ? "activa" : "inactiva"}</span>
              {risk && <span className={`rounded-full px-2.5 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider ${risk.cls}`}>{risk.label}</span>}
            </div>
            <p className="text-xs text-[var(--text-tertiary)] mt-1 font-mono">{t.slug}{t.customDomain ? ` · ${t.customDomain}` : ""} · alta {date(t.createdAt)}</p>
            {t.address && <p className="text-xs text-[var(--text-secondary)] mt-0.5">{t.address}</p>}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={() => void impersonate()} disabled={busy} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[var(--accent)] px-3.5 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50"><LogIn className="h-4 w-4" /> Impersonar</button>
            <Link href={`/superadmin/chat?tenant=${encodeURIComponent(t.slug)}&msg=${encodeURIComponent(msg)}`} className="inline-flex h-10 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] px-3.5 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40"><MessageSquare className="h-4 w-4" /> Contactar</Link>
            <Link href={`/marketplace/${encodeURIComponent(t.slug)}`} target="_blank" className="inline-flex h-10 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] px-3.5 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40"><ExternalLink className="h-4 w-4" /> Ver tienda</Link>
            <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border-2 border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)]/40"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
          </div>
        </div>
      </section>

      {/* Health & engagement */}
      {h && (
        <Card title={`Salud & engagement · medido ${timeAgo(h.calculatedAt)}`}>
          <div className="flex items-start gap-5 flex-wrap">
            <div className="text-center shrink-0">
              <p className={`font-display text-5xl font-extrabold tabular-nums ${h.score >= 70 ? "text-[var(--data-success-600,#059669)]" : h.score >= 40 ? "text-[#0d9488]" : "text-[var(--data-error-600,#dc2626)]"}`}>{h.score}</p>
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">health /100</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 flex-1 min-w-[260px]">
              <SAKpiCard label="Logins 7d" value={h.loginsLast7d} sub={`30d: ${h.loginsLast30d}`} tone={h.loginsLast7d > 0 ? "good" : "warn"} />
              <SAKpiCard label="Pedidos 7d" value={h.ordersLast7d} sub={`30d: ${h.ordersLast30d}`} tone={h.ordersLast7d > 0 ? "good" : "warn"} />
              <SAKpiCard label="Funciones" value={`${h.featuresUsed}/47`} sub="recursos usados" />
              <SAKpiCard label="Sin pedido" value={`${h.daysSinceLastOrder}d`} tone={h.daysSinceLastOrder >= 7 ? "bad" : "default"} />
              <SAKpiCard label="Sin login" value={`${h.daysSinceLastLogin}d`} tone={h.daysSinceLastLogin >= 7 ? "bad" : "default"} />
              <SAKpiCard label="Trial" value={h.trialDaysLeft == null ? "—" : `${h.trialDaysLeft}d`} sub={h.trialDaysLeft == null ? "no aplica" : "restantes"} tone={h.trialDaysLeft != null && h.trialDaysLeft <= 7 ? "warn" : "default"} />
            </div>
          </div>
        </Card>
      )}

      {/* Conteos del negocio */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SAKpiCard icon={Package} label="Productos" value={d.counts.products} />
        <SAKpiCard icon={Users} label="Clientes" value={d.counts.customers} />
        <SAKpiCard icon={ShoppingBag} label="Pedidos" value={d.counts.orders} />
        <SAKpiCard icon={ShieldAlert} label="Errores panel" value={d.counts.errors} sub={d.counts.errors > 0 ? "sin resolver" : "ninguno"} tone={d.counts.errors > 0 ? "bad" : "good"} />
      </div>

      {/* Co-piloto IA */}
      <Card title="Co-piloto IA" action={ai && <button type="button" onClick={() => void askCopilot()} disabled={aiLoading} className="inline-flex items-center gap-1 text-xs font-bold text-[var(--accent)] hover:underline disabled:opacity-50">{aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Regenerar</button>}>
        {!ai ? (
          <div className="flex items-center gap-3 flex-wrap">
            <button type="button" onClick={() => void askCopilot()} disabled={aiLoading} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50">
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {aiLoading ? "Analizando el negocio…" : "Pedir análisis IA"}
            </button>
            <span className="text-xs text-[var(--text-tertiary)]">La IA resume la situación, sugiere una acción y redacta el mensaje para el dueño.</span>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--accent)] mb-0.5">Resumen</p>
              <p className="text-sm text-[var(--text-secondary)]">{ai.summary}</p>
            </div>
            <div>
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[#0d9488] mb-0.5">Acción recomendada</p>
              <p className="text-sm text-[var(--text-secondary)]">{ai.action}</p>
            </div>
            <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-3">
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">Mensaje sugerido para el dueño</p>
              <p className="text-sm text-[var(--text-primary)] italic">&ldquo;{ai.draft}&rdquo;</p>
              <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                <button type="button" onClick={() => { void navigator.clipboard?.writeText(ai.draft); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">{copied ? <CheckCircle2 className="h-3.5 w-3.5 text-[var(--data-success-600,#059669)]" /> : null} {copied ? "Copiado" : "Copiar"}</button>
                <Link href={`/superadmin/chat?tenant=${encodeURIComponent(t.slug)}&msg=${encodeURIComponent(ai.draft)}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-2.5 text-xs font-bold text-white hover:brightness-110"><MessageSquare className="h-3.5 w-3.5" /> Contactar con este mensaje</Link>
                {!ai.ai && <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">IA no configurada — borrador por plantilla</span>}
              </div>
            </div>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Integraciones */}
        <Card title="Integraciones">
          <div className="grid grid-cols-2 gap-2">
            <IntegChip on={d.integrations.whatsapp} label="WhatsApp" />
            <IntegChip on={d.integrations.yape} label="Yape" />
            <IntegChip on={d.integrations.plin} label="Plin" />
            <IntegChip on={d.integrations.sunat} label="SUNAT" />
          </div>
        </Card>

        {/* Pedidos recientes */}
        <Card title="Pedidos recientes">
          {d.recentOrders.length === 0 ? <p className="text-xs text-[var(--text-tertiary)]">Sin pedidos.</p> : (
            <ul className="space-y-1.5">
              {d.recentOrders.map((o) => (
                <li key={o.id} className="flex items-center gap-3 text-sm">
                  <span className="rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-secondary)]">{o.status}</span>
                  <span className="flex-1 text-[var(--text-tertiary)] text-xs">{timeAgo(o.createdAt)}</span>
                  <span className="font-bold tabular-nums text-[var(--text-primary)]">{soles(o.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Errores del panel */}
      {d.errors.length > 0 && (
        <Card title="Errores del panel admin" action={<Link href="/superadmin/tenant-errors" className="inline-flex items-center gap-1 text-xs font-bold text-[var(--accent)] hover:underline">Ver consola <ExternalLink className="h-3 w-3" /></Link>}>
          <ul className="space-y-1.5">
            {d.errors.map((e) => (
              <li key={e.id} className="flex items-center gap-3 text-sm">
                <ShieldAlert className="h-4 w-4 text-[var(--data-error-600,#dc2626)] shrink-0" />
                <span className="flex-1 truncate text-[var(--text-secondary)] text-xs font-mono">{e.message}</span>
                {e.count > 1 && <span className="rounded-full bg-[var(--data-error-500)]/10 px-1.5 text-[length:var(--ts-2xs)] font-extrabold text-[var(--data-error-600,#dc2626)] tabular-nums">×{e.count}</span>}
                <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] shrink-0">{timeAgo(e.lastSeenAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Actividad reciente */}
      <Card title="Actividad reciente">
        {d.activity.length === 0 ? <p className="text-xs text-[var(--text-tertiary)]">Sin actividad registrada.</p> : (
          <ul className="space-y-1.5">
            {d.activity.map((a, i) => (
              <li key={i} className="flex items-center gap-2.5 text-sm">
                <Activity className="h-3.5 w-3.5 text-[var(--text-tertiary)] shrink-0" />
                <span className="text-[var(--text-primary)]"><span className="font-bold">{a.user}</span> {a.action} {a.entity}</span>
                {a.detail && <span className="text-xs text-[var(--text-tertiary)] truncate flex-1">— {a.detail}</span>}
                <span className="ml-auto text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] shrink-0">{timeAgo(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Link href="/superadmin/tenants" className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><ArrowLeft className="h-4 w-4" /> Volver a tiendas</Link>
    </div>
  );
}
