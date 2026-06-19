"use client";

/**
 * /superadmin/tenants/map — Mapa de operaciones EN VIVO (Brandon 2026-06-19):
 * tiendas (con logo) + repartidores con su posición GPS casi en tiempo real
 * (polling 15s del heartbeat) + tráfico por zona + KPIs de monitoreo. Conserva
 * el picker para ubicar las tiendas que faltan. Datos reales del endpoint live.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  MapPin, ArrowLeft, RefreshCw, Check, X, Store, Truck, Activity, Gauge,
} from "@buleje/design-system/icons";
import { AdminTabShell } from "../../_components/_shared";
import { SuperAdminModuleTabs, TENANTS_TABS } from "@/components/superadmin/_shared/ModuleTabs";
import { fetchSuperadmin } from "@/lib/superadmin/fetch-auth";
import { csrfHeaders } from "@/lib/csrf-client";

type MapStore = { slug: string; name: string; lat: number; lng: number; active: boolean; logoUrl: string | null; address: string | null; source: "negocio" | "superadmin" };
type MapRider = { id: string; name: string; lat: number; lng: number; isOnline: boolean; vehicleType: string; zone: string; lastPingAt: string | null; onDelivery: boolean };
type MapZone = { zone: string; count: number; online: number; lat: number; lng: number };
type Kpis = { storesLocated: number; storesTotal: number; ridersLocated: number; ridersOnline: number; onDelivery: number; activeDeliveries: number; zones: number };
type Live = { stores: MapStore[]; unlocated: { slug: string; name: string }[]; riders: MapRider[]; zones: MapZone[]; kpis: Kpis };

const LiveOpsMap = dynamic(() => import("@/components/superadmin/LiveOpsMap"), {
  ssr: false,
  loading: () => <div className="h-[520px] animate-pulse bg-[var(--surface-sunken)] border border-[var(--rule-base)]" />,
});
const LeafletMap = dynamic(() => import("@/components/LeafletMap"), {
  ssr: false,
  loading: () => <div className="h-[260px] animate-pulse bg-[var(--surface-sunken)] border border-[var(--rule-base)]" />,
});

function pingAgo(iso: string | null): string {
  if (!iso) return "sin ping";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "hace segundos";
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
}

function Kpi({ icon: Icon, label, value, sub, tone = "default" }: { icon: typeof Store; label: string; value: string; sub?: string; tone?: "default" | "good" | "warn" }) {
  const c = tone === "good" ? "text-[var(--data-success-600,#059669)]" : tone === "warn" ? "text-[#0d9488]" : "text-[var(--text-primary)]";
  return (
    <div className="border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-3">
      <div className="flex items-center gap-1.5 mb-1 text-[var(--text-tertiary)]"><Icon className="h-3.5 w-3.5" /><span className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider">{label}</span></div>
      <p className={`font-display text-2xl font-extrabold tabular-nums ${c}`}>{value}</p>
      {sub && <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5">{sub}</p>}
    </div>
  );
}

function Toggle({ on, onClick, icon: Icon, label }: { on: boolean; onClick: () => void; icon: typeof Store; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={["inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-bold transition-colors", on ? "bg-[var(--accent)] text-white" : "border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"].join(" ")}>
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}

export default function TenantsMapPage() {
  const [data, setData] = useState<Live | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastAt, setLastAt] = useState<string | null>(null);
  const [showStores, setShowStores] = useState(true);
  const [showRiders, setShowRiders] = useState(true);
  const [showZones, setShowZones] = useState(true);
  // Picker
  const [locating, setLocating] = useState<{ slug: string; name: string } | null>(null);
  const [pending, setPending] = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetchSuperadmin("/api/superadmin/map/live");
      if (res.ok) { setData((await res.json()) as Live); setLastAt(new Date().toISOString()); }
    } finally { if (!silent) setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // Polling en vivo cada 15s (pausa en background).
  useEffect(() => {
    const id = setInterval(() => { if (!(typeof document !== "undefined" && document.hidden)) void load(true); }, 15_000);
    return () => clearInterval(id);
  }, [load]);

  const save = useCallback(async () => {
    if (!locating || !pending) return;
    setSaving(true);
    try {
      const res = await fetch("/api/superadmin/tenants/geo", {
        method: "POST", credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ slug: locating.slug, lat: pending.lat, lng: pending.lng }),
      });
      if (res.ok) { setLocating(null); setPending(null); await load(); }
    } finally { setSaving(false); }
  }, [locating, pending, load]);

  const stores = data?.stores ?? [];
  const riders = data?.riders ?? [];
  const zones = data?.zones ?? [];
  const unlocated = data?.unlocated ?? [];
  const k = data?.kpis;
  const onlineRiders = useMemo(() => (data?.riders ?? []).filter((r) => r.isOnline).sort((a, b) => a.zone.localeCompare(b.zone)), [data]);
  const maxZone = Math.max(1, ...zones.map((z) => z.count));

  return (
    <>
      <SuperAdminModuleTabs tabs={TENANTS_TABS} />
      <AdminTabShell
        info={{
          what: "Mapa en vivo con la ubicación de todas las tiendas y repartidores activos. Se actualiza cada 15 segundos vía heartbeat GPS. Incluye KPIs de monitoreo y tráfico por zona.",
          affects: "El picker de ubicación sí escribe: permite al superadmin asignar coordenadas GPS a tiendas que no las tienen (se guarda vía /api/superadmin/tenants/geo).",
          example: "Si ves 0 repartidores online a las 7 pm, hay un problema de disponibilidad en la flota. Puedes ver qué zonas tienen más pedidos activos para reasignar.",
        }}
        title="Mapa de operaciones en vivo"
        kicker="Plataforma · Tiendas"
        description="Tiendas, repartidores y su movimiento en tiempo real. Tráfico por zona."
        icon={MapPin}
        actions={
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-bold text-[var(--data-success-600,#059669)]">
              <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--data-success-500)] opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--data-success-500)]" /></span>
              EN VIVO · 15s{lastAt ? ` · ${pingAgo(lastAt)}` : ""}
            </span>
            <button onClick={() => void load()} disabled={loading} className="inline-flex h-11 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40 disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualizar
            </button>
            <Link href="/superadmin/tenants" className="inline-flex h-11 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40">
              <ArrowLeft className="h-4 w-4" /> Tiendas
            </Link>
          </div>
        }
      >
        {/* KPIs de monitoreo */}
        {k && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            <Kpi icon={Truck} label="Repartidores online" value={`${k.ridersOnline}/${k.ridersLocated}`} sub="con GPS activo" tone={k.ridersOnline > 0 ? "good" : "warn"} />
            <Kpi icon={Activity} label="En entrega" value={String(k.onDelivery)} sub="con pedido asignado" />
            <Kpi icon={Gauge} label="Entregas activas" value={String(k.activeDeliveries)} sub="sin entregar" />
            <Kpi icon={Store} label="Tiendas en mapa" value={`${k.storesLocated}/${k.storesTotal}`} sub="geolocalizadas" tone={k.storesLocated > 0 ? "good" : "warn"} />
            <Kpi icon={Truck} label="Repartidores" value={String(k.ridersLocated)} sub="ubicados" />
            <Kpi icon={MapPin} label="Zonas activas" value={String(k.zones)} sub="con repartidores" />
          </div>
        )}

        {/* Capas */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider">Capas:</span>
          <Toggle on={showStores} onClick={() => setShowStores((v) => !v)} icon={Store} label="Tiendas" />
          <Toggle on={showRiders} onClick={() => setShowRiders((v) => !v)} icon={Truck} label="Repartidores" />
          <Toggle on={showZones} onClick={() => setShowZones((v) => !v)} icon={MapPin} label="Zonas" />
          <span className="ml-auto inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-tertiary)]">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#00A0A0] border border-white shadow-sm" /> Tienda</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#10b981] border border-white shadow-sm" /> Repartidor online</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#9ca3af] border border-white shadow-sm" /> Offline</span>
          </span>
        </div>

        <LiveOpsMap stores={stores} riders={riders} zones={zones} showStores={showStores} showRiders={showRiders} showZones={showZones} />

        {/* Repartidores online + Tráfico por zona */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4">
            <h3 className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-3">Repartidores online ({onlineRiders.length})</h3>
            {onlineRiders.length === 0 ? <p className="text-xs text-[var(--text-tertiary)]">Ninguno online ahora.</p> : (
              <ul className="space-y-2">
                {onlineRiders.map((r) => (
                  <li key={r.id} className="flex items-center gap-2.5">
                    <span className="h-2 w-2 rounded-full bg-[var(--data-success-500)] shrink-0" />
                    <span className="text-sm font-bold text-[var(--text-primary)] truncate flex-1">{r.name}</span>
                    <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] shrink-0">{r.zone} · {r.vehicleType}{r.onDelivery ? " · en entrega" : ""} · {pingAgo(r.lastPingAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4">
            <h3 className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-3">Tráfico por zona</h3>
            {zones.length === 0 ? <p className="text-xs text-[var(--text-tertiary)]">Sin datos de zona.</p> : (
              <div className="space-y-2.5">
                {zones.map((z) => (
                  <div key={z.zone} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-sm font-semibold text-[var(--text-primary)] truncate">{z.zone}</span>
                    <div className="flex-1 h-3 rounded bg-[var(--surface-sunken)] overflow-hidden"><div className="h-full bg-[var(--accent)]" style={{ width: `${Math.round((z.count / maxZone) * 100)}%` }} /></div>
                    <span className="w-20 shrink-0 text-right text-[length:var(--ts-2xs)] tabular-nums text-[var(--text-tertiary)]"><span className="text-[var(--data-success-500)] font-bold">{z.online}</span>/{z.count} online</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Ubicar tiendas que faltan */}
        {unlocated.length > 0 && (
          <div className="mt-5">
            <h3 className="text-sm font-bold text-[var(--text-primary)] mb-2">Tiendas sin ubicación ({unlocated.length})</h3>
            <div className="border border-[var(--rule-base)] divide-y divide-[var(--rule-base)]">
              {unlocated.map((r) => (
                <div key={r.slug}>
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <MapPin className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
                    <span className="flex-1 text-sm font-bold text-[var(--text-primary)] truncate">{r.name}</span>
                    {locating?.slug === r.slug ? (
                      <button onClick={() => { setLocating(null); setPending(null); }} className="inline-flex items-center gap-1 text-xs font-bold text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"><X className="h-3.5 w-3.5" /> Cancelar</button>
                    ) : (
                      <button onClick={() => { setLocating(r); setPending(null); }} className="inline-flex items-center gap-1 text-xs font-bold text-[var(--accent)] hover:underline"><MapPin className="h-3.5 w-3.5" /> Ubicar</button>
                    )}
                  </div>
                  {locating?.slug === r.slug && (
                    <div className="px-3 pb-3 space-y-2">
                      <p className="text-xs text-[var(--text-tertiary)]">Hacé clic en el mapa para marcar la ubicación de <strong>{r.name}</strong>.</p>
                      <LeafletMap lat={pending?.lat ?? -8.38} lon={pending?.lng ?? -74.53} zoom={6} height={260} onPick={(lat, lng) => setPending({ lat, lng })} />
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-[var(--text-secondary)] tabular-nums">{pending ? `GPS: ${pending.lat.toFixed(5)}, ${pending.lng.toFixed(5)}` : "Sin marcar"}</span>
                        <button onClick={() => void save()} disabled={!pending || saving} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[var(--accent)] px-3 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50"><Check className="h-4 w-4" /> Guardar ubicación</button>
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
