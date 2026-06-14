"use client";

/**
 * /superadmin/tenants/map — Mapa de tiendas (Brandon 2026-06-14). Plotea las
 * tiendas con ubicación; las que no tienen, se ubican con el picker (LeafletMap)
 * y se guarda lat/lng. Tenant no tenía coordenadas — se agregaron en esta tanda.
 */

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { MapPin, ArrowLeft, RefreshCw, Check, X } from "@buleje/design-system/icons";
import { AdminTabShell } from "../../_components/_shared";
import { fetchSuperadmin } from "@/lib/superadmin/fetch-auth";
import { csrfHeaders } from "@/lib/csrf-client";

type Row = { slug: string; name: string; lat: number | null; lng: number | null; active: boolean };

const TenantsMap = dynamic(() => import("@/components/superadmin/TenantsMap"), {
  ssr: false,
  loading: () => <div className="h-[480px] animate-pulse bg-[var(--surface-sunken)] border border-[var(--rule-base)]" />,
});
const LeafletMap = dynamic(() => import("@/components/LeafletMap"), {
  ssr: false,
  loading: () => <div className="h-[260px] animate-pulse bg-[var(--surface-sunken)] border border-[var(--rule-base)]" />,
});

export default function TenantsMapPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState<Row | null>(null);
  const [pending, setPending] = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);

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

  const located = rows.filter((r) => r.lat != null && r.lng != null);
  const unlocated = rows.filter((r) => r.lat == null || r.lng == null);
  const mapTenants = located.map((r) => ({ slug: r.slug, name: r.name, lat: r.lat as number, lng: r.lng as number, active: r.active }));

  return (
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
      <p className="text-sm text-[var(--text-secondary)] mb-3">
        <span className="font-bold text-[var(--text-primary)]">{located.length}</span> de {rows.length} tiendas ubicadas
        {unlocated.length > 0 && <span className="text-[var(--text-tertiary)]"> · {unlocated.length} sin ubicación</span>}
      </p>

      <TenantsMap tenants={mapTenants} />

      {/* Ubicar las que faltan */}
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
  );
}
