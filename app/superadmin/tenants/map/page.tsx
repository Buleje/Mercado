"use client";

/**
 * /superadmin/tenants/map — Mapa de tiendas (Brandon 2026-06-14). Plotea las
 * tiendas con ubicación; las que no tienen, se ubican con el picker (LeafletMap).
 *
 * v2 (Brandon 2026-06-19): KPIs de cobertura geográfica, filtro (activas / de
 * pago), búsqueda que enfoca el mapa, leyenda. Datos reales del endpoint geo.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { MapPin, ArrowLeft, RefreshCw, Check, X, Search } from "@buleje/design-system/icons";
import { AdminTabShell } from "../../_components/_shared";
import { SuperAdminModuleTabs, TENANTS_TABS } from "@/components/superadmin/_shared/ModuleTabs";
import { fetchSuperadmin } from "@/lib/superadmin/fetch-auth";
import { csrfHeaders } from "@/lib/csrf-client";

type Row = { slug: string; name: string; lat: number | null; lng: number | null; active: boolean; plan: string };
type Filter = "all" | "active" | "paid";

const TenantsMap = dynamic(() => import("@/components/superadmin/TenantsMap"), {
  ssr: false,
  loading: () => <div className="h-[480px] animate-pulse bg-[var(--surface-sunken)] border border-[var(--rule-base)]" />,
});
const LeafletMap = dynamic(() => import("@/components/LeafletMap"), {
  ssr: false,
  loading: () => <div className="h-[260px] animate-pulse bg-[var(--surface-sunken)] border border-[var(--rule-base)]" />,
});

function Kpi({ label, value, sub, tone = "default" }: { label: string; value: string; sub?: string; tone?: "default" | "good" | "warn" }) {
  const c = tone === "good" ? "text-[var(--data-success-600,#059669)]" : tone === "warn" ? "text-[#0d9488]" : "text-[var(--text-primary)]";
  return (
    <div className="border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-3">
      <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">{label}</p>
      <p className={`mt-1 font-display text-2xl font-extrabold tabular-nums ${c}`}>{value}</p>
      {sub && <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5">{sub}</p>}
    </div>
  );
}

export default function TenantsMapPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState<Row | null>(null);
  const [pending, setPending] = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchSuperadmin("/api/superadmin/tenants/geo");
      if (res.ok) setRows(((await res.json()) as { rows: Row[] }).rows ?? []);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const save = useCallback(async () => {
    if (!locating || !pending) return;
    setSaving(true);
    try {
      const res = await fetch("/api/superadmin/tenants/geo", {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ slug: locating.slug, lat: pending.lat, lng: pending.lng }),
      });
      if (res.ok) {
        setLocating(null); setPending(null);
        await load();
      }
    } finally { setSaving(false); }
  }, [locating, pending, load]);

  const located = useMemo(() => rows.filter((r) => r.lat != null && r.lng != null), [rows]);
  const unlocated = useMemo(() => rows.filter((r) => r.lat == null || r.lng == null), [rows]);

  const matchFilter = useCallback((r: Row) => {
    if (filter === "active" && !r.active) return false;
    if (filter === "paid" && r.plan === "free") return false;
    const q = search.trim().toLowerCase();
    if (q && !`${r.name} ${r.slug}`.toLowerCase().includes(q)) return false;
    return true;
  }, [filter, search]);

  // Marcadores que se muestran en el mapa (búsqueda + filtro enfocan/recortan).
  const mapTenants = useMemo(
    () => located.filter(matchFilter).map((r) => ({ slug: r.slug, name: r.name, lat: r.lat as number, lng: r.lng as number, active: r.active })),
    [located, matchFilter],
  );
  const filteredUnlocated = useMemo(() => unlocated.filter(matchFilter), [unlocated, matchFilter]);

  const kpis = useMemo(() => ({
    located: located.length,
    coverage: rows.length ? Math.round((located.length / rows.length) * 100) : 0,
    activeOnMap: located.filter((r) => r.active).length,
    unlocated: unlocated.length,
  }), [located, unlocated, rows]);

  return (
    <>
      <SuperAdminModuleTabs tabs={TENANTS_TABS} />
      <AdminTabShell
        title="Mapa de tiendas"
        kicker="Plataforma · Tiendas"
        description="Ubicación de las tiendas en el mapa. Ubica las que falten para verlas acá."
        icon={MapPin}
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
        {/* KPIs de cobertura */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <Kpi label="Ubicadas" value={`${kpis.located}/${rows.length}`} sub="con coordenadas" tone="good" />
          <Kpi label="Cobertura" value={`${kpis.coverage}%`} sub="del total geolocalizado" tone={kpis.coverage >= 70 ? "good" : "warn"} />
          <Kpi label="Activas en mapa" value={String(kpis.activeOnMap)} sub="puntos teal" />
          <Kpi label="Sin ubicación" value={String(kpis.unlocated)} sub="por ubicar" tone={kpis.unlocated > 0 ? "warn" : "good"} />
        </div>

        {/* Búsqueda + filtro (enfocan el mapa) */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar tienda → enfoca el mapa…" className="h-11 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] pl-10 pr-9 text-sm font-medium text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)]" />
            {search && <button type="button" onClick={() => setSearch("")} aria-label="Limpiar" className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"><X className="h-4 w-4" /></button>}
          </div>
          <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} aria-label="Filtrar tiendas" className="h-11 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)] cursor-pointer">
            <option value="all">Todas</option>
            <option value="active">Solo activas</option>
            <option value="paid">Solo de pago</option>
          </select>
        </div>

        <p className="text-sm text-[var(--text-secondary)] mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span><span className="font-bold text-[var(--text-primary)]">{mapTenants.length}</span> en el mapa</span>
          {/* Leyenda */}
          <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]"><span className="h-2.5 w-2.5 rounded-full bg-[#00A0A0] border border-white shadow-sm" /> Activa</span>
          <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]"><span className="h-2.5 w-2.5 rounded-full bg-[#9ca3af] border border-white shadow-sm" /> Inactiva</span>
        </p>

        <TenantsMap tenants={mapTenants} />

        {/* Ubicar las que faltan */}
        {filteredUnlocated.length > 0 && (
          <div className="mt-5">
            <h3 className="text-sm font-bold text-[var(--text-primary)] mb-2">Tiendas sin ubicación ({filteredUnlocated.length})</h3>
            <div className="border border-[var(--rule-base)] divide-y divide-[var(--rule-base)]">
              {filteredUnlocated.map((r) => (
                <div key={r.slug}>
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <MapPin className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
                    <span className="flex-1 text-sm font-bold text-[var(--text-primary)] truncate">{r.name}</span>
                    {locating?.slug === r.slug ? (
                      <button onClick={() => { setLocating(null); setPending(null); }} className="inline-flex items-center gap-1 text-xs font-bold text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
                        <X className="h-3.5 w-3.5" /> Cancelar
                      </button>
                    ) : (
                      <button onClick={() => { setLocating(r); setPending(null); }} className="inline-flex items-center gap-1 text-xs font-bold text-[var(--accent)] hover:underline">
                        <MapPin className="h-3.5 w-3.5" /> Ubicar
                      </button>
                    )}
                  </div>
                  {locating?.slug === r.slug && (
                    <div className="px-3 pb-3 space-y-2">
                      <p className="text-xs text-[var(--text-tertiary)]">Hacé clic en el mapa para marcar la ubicación de <strong>{r.name}</strong>.</p>
                      <LeafletMap lat={pending?.lat ?? -8.38} lon={pending?.lng ?? -74.53} zoom={6} height={260} onPick={(lat, lng) => setPending({ lat, lng })} />
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-[var(--text-secondary)] tabular-nums">{pending ? `GPS: ${pending.lat.toFixed(5)}, ${pending.lng.toFixed(5)}` : "Sin marcar"}</span>
                        <button onClick={() => void save()} disabled={!pending || saving} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[var(--accent)] px-3 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50">
                          <Check className="h-4 w-4" /> Guardar ubicación
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </AdminTabShell>
    </>
  );
}
