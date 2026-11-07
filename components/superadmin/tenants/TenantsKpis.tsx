"use client";

import { Building2, DollarSign, Sparkles, Bell, BarChart3, ChevronDown } from "@buleje/design-system/icons";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { SAStatChip } from "@/components/superadmin/_shared/SAStatChip";
import type { TenantsStats } from "@/components/superadmin/tenants/useTenantsFiltros";

/** Se recuerda entre visitas (mismo patrón que los indicadores del Libro TH). */
const CLAVE_KPIS = "sa-tenants-kpis-abiertos";

/**
 * Los 4 indicadores de la lista de tiendas, plegables y recordados. Plegados
 * siguen diciendo sus cifras en una línea: plegar no esconde el dato. Mientras
 * carga muestra «—» en vez de ceros.
 */
export function TenantsKpis({ loading, stats }: { loading: boolean; stats: TenantsStats }) {
  const [abierto, setAbierto] = useLocalStorage<boolean>(CLAVE_KPIS, false);
  const cifra = (n: number | string) => (loading ? "—" : n);
  const ventas = `S/ ${stats.mrr.toLocaleString("es-PE", { maximumFractionDigits: 0 })}`;
  return (
    <section aria-label="Indicadores de tiendas" className="space-y-3">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-controls="sa-tenants-kpis"
        title={abierto ? "Plegar indicadores" : "Ver indicadores en tarjetas"}
        className="flex w-full items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 min-h-10 text-left text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
      >
        <BarChart3 className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden="true" />
        {/* Plegada, la línea baja de renglón a 400 px en vez de cortarse:
            «en prueba» y «pendientes» siguen a la vista (como LothSeccionKpis). */}
        <span className="flex min-w-0 flex-1 flex-wrap gap-x-2 gap-y-0.5 tabular-nums">
          <span><strong className="text-[var(--text-primary)]">{cifra(stats.total)}</strong> negocios</span>
          <span><strong className="text-[var(--text-primary)]">{cifra(ventas)}</strong> en ventas del mes</span>
          <span><strong className="text-[var(--text-primary)]">{cifra(stats.trial)}</strong> en prueba</span>
          <span><strong className="text-[var(--text-primary)]">{cifra(stats.pendingTotal)}</strong> pendientes</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {abierto && (
      <div id="sa-tenants-kpis" className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SAStatChip
          icon={Building2}
          label="Negocios"
          value={loading ? "—" : String(stats.total)}
          hint={loading ? "Cargando…" : `${stats.active} activos`}
          tone="teal"
        />
        <SAStatChip
          icon={DollarSign}
          // Brandon 2026-05-21 audit fix #5: antes "MRR consolidado" confundía
          // con el MRR del dashboard ejecutivo (que es la SUSCRIPCIÓN SaaS
          // que pagan los tenants a Buleje). ESTE valor es GMV: la suma del
          // revenue REAL que generaron las tiendas vendiendo en el mes.
          // Son cosas distintas — clarificado en label y hint.
          label="Ventas"
          value={loading ? "—" : `S/ ${stats.mrr.toLocaleString("es-PE", { maximumFractionDigits: 0 })}`}
          hint={loading ? "Cargando…" : "este mes"}
          tone="emerald"
        />
        <SAStatChip
          icon={Sparkles}
          label="En prueba"
          value={loading ? "—" : String(stats.trial)}
          hint={loading ? "Cargando…" : stats.trial > 0 ? "activas, aún sin cobro" : "ninguna"}
          tone="violet"
        />
        <SAStatChip
          icon={Bell}
          label="Pendientes"
          value={loading ? "—" : String(stats.pendingTotal)}
          hint={loading ? "Cargando…" : `En ${stats.tenantsWithPending} tienda${stats.tenantsWithPending === 1 ? "" : "s"}`}
          tone={stats.pendingTotal > 0 ? "amber" : "sky"}
        />
      </div>
      )}
    </section>
  );
}
