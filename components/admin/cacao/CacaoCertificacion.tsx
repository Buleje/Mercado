"use client";

/**
 * CacaoCertificacion — tablero de cumplimiento para exportación (EUDR + certs).
 * EUDR (Reglamento UE 1115/2023): exportar cacao a la UE exige geolocalización
 * de cada parcela + libre de deforestación. Acá se cruza el padrón existente
 * (certificación + lat/long ya capturados) para ver quién está listo, qué falta
 * y exportar el insumo del Due Diligence Statement. Schema-free. Brandon 2026-07-02.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ShieldCheck, Leaf, Globe, Award, FileCheck, Search, RefreshCw, AlertCircle, CheckCircle2, AlertTriangle, MapPin,
} from "@buleje/design-system/icons";
import { StatCard } from "@buleje/design-system";

interface PStats { kg: number; pagado: number; lotes: number }
interface Producer {
  id: string; codigo: string | null; nombre: string; sector: string | null;
  certificacion: string | null; latitud: string | null; longitud: string | null;
  status: string; stats: PStats;
}

const n2 = (v: number) => v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const hasGeo = (p: Producer) => {
  const la = Number(p.latitud), lo = Number(p.longitud);
  return p.latitud != null && p.longitud != null && Number.isFinite(la) && Number.isFinite(lo);
};
const CERTS = [
  { key: "organico", label: "Orgánico" },
  { key: "comercio_justo", label: "Comercio justo" },
  { key: "convencional", label: "Convencional" },
  { key: "__none__", label: "Sin declarar" },
];
const certKey = (c: string | null) => (c === "organico" || c === "comercio_justo" || c === "convencional" ? c : "__none__");
const CERT_LABEL: Record<string, string> = { organico: "Orgánico", comercio_justo: "Comercio justo", convencional: "Convencional" };

export default function CacaoCertificacion() {
  const [producers, setProducers] = useState<Producer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/admin/cacao?view=producers-stats&all=1", { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setProducers(d.producers ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const view = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return producers;
    return producers.filter((p) => p.nombre.toLowerCase().includes(q) || (p.codigo ?? "").toLowerCase().includes(q) || (p.sector ?? "").toLowerCase().includes(q));
  }, [producers, search]);

  const stats = useMemo(() => {
    const total = producers.length;
    const conGeo = producers.filter(hasGeo).length;
    const byCert: Record<string, number> = { organico: 0, comercio_justo: 0, convencional: 0, __none__: 0 };
    for (const p of producers) byCert[certKey(p.certificacion)]++;
    return { total, conGeo, certificados: byCert.organico + byCert.comercio_justo, byCert };
  }, [producers]);

  function exportDDS() {
    const head = ["Codigo", "Productor", "Sector", "Certificacion", "Latitud", "Longitud", "Geolocalizado", "Kg acopiado", "Lotes"];
    const esc = (v: unknown) => { const s = String(v ?? ""); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const rows = view.map((p) => [p.codigo, p.nombre, p.sector, p.certificacion, p.latitud, p.longitud, hasGeo(p) ? "si" : "no", n2(p.stats.kg), p.stats.lotes].map(esc).join(","));
    const csv = "﻿" + [head.join(","), ...rows].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a"); a.href = url; a.download = `cacao-eudr-dds-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  const sinGeo = view.filter((p) => !hasGeo(p));

  return (
    <div className="space-y-5">
      {/* Contexto EUDR para el dueño */}
      <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 text-sm text-[var(--text-secondary)]">
        <Globe className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" />
        <p><strong className="text-[var(--text-primary)]">EUDR (Reglamento UE 1115/2023):</strong> para exportar cacao a la Unión Europea cada parcela necesita <strong className="text-[var(--text-primary)]">geolocalización</strong> y prueba de estar libre de deforestación. Este tablero cruza tu padrón para ver quién ya está listo y prepara el insumo del Due Diligence Statement.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Listos para EUDR" value={`${stats.conGeo}/${stats.total}`} subValue={`${pct(stats.conGeo, stats.total)}% con geolocalización`} icon={ShieldCheck} emphasis={stats.total > 0 && stats.conGeo === stats.total ? "success" : stats.conGeo > 0 ? "warning" : "neutral"} />
        <StatCard label="Orgánico" value={String(stats.byCert.organico)} icon={Leaf} emphasis={stats.byCert.organico > 0 ? "success" : "neutral"} />
        <StatCard label="Comercio justo" value={String(stats.byCert.comercio_justo)} icon={Award} emphasis={stats.byCert.comercio_justo > 0 ? "success" : "neutral"} />
        <StatCard label="Sin certificar" value={String(stats.byCert.convencional + stats.byCert.__none__)} subValue="convencional o sin declarar" icon={AlertTriangle} emphasis={stats.byCert.convencional + stats.byCert.__none__ > 0 ? "warning" : "neutral"} />
      </div>

      {error && <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>Error:</strong> {error}</div></div>}

      {/* Readiness EUDR + distribución de certificaciones */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"><ShieldCheck className="h-4 w-4 text-[var(--accent)]" />Geolocalización de parcelas (EUDR)</h3>
          <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
            <div className="h-full rounded-full bg-[var(--data-success-500)] transition-all" style={{ width: `${pct(stats.conGeo, stats.total)}%` }} />
          </div>
          <p className="mt-2 text-sm text-[var(--text-secondary)]"><strong className="text-[var(--text-primary)]">{stats.conGeo}</strong> de {stats.total} productores con ubicación cargada.</p>
          {sinGeo.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-bold text-[var(--text-tertiary)]">Faltan geolocalizar ({sinGeo.length}):</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {sinGeo.slice(0, 12).map((p) => (
                  <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-[var(--data-warning-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-700)]"><MapPin className="h-3 w-3" />{p.nombre}</span>
                ))}
                {sinGeo.length > 12 && <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">+{sinGeo.length - 12} más</span>}
              </div>
            </div>
          )}
        </div>
        <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"><Award className="h-4 w-4 text-[var(--accent)]" />Certificaciones</h3>
          <ul className="mt-3 space-y-2">
            {CERTS.map((c) => {
              const count = stats.byCert[c.key];
              return (
                <li key={c.key}>
                  <div className="flex items-center justify-between text-sm"><span className="text-[var(--text-secondary)]">{c.label}</span><span className="font-mono font-bold text-[var(--text-primary)]">{count} · {pct(count, stats.total)}%</span></div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]"><div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${pct(count, stats.total)}%` }} /></div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-12 min-w-[200px] flex-1 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4">
          <Search className="h-4 w-4 text-[var(--text-tertiary)]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar productor por nombre, código o sector…" className="w-full bg-transparent text-base text-[var(--text-primary)] outline-none" />
        </div>
        <button type="button" onClick={exportDDS} disabled={view.length === 0} className="inline-flex h-12 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-50"><FileCheck className="h-4 w-4" />Export DDS</button>
        <button type="button" onClick={load} className="inline-flex h-12 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"><RefreshCw className="h-4 w-4" />Actualizar</button>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--surface-sunken)] text-left">
            <tr><Th>Productor</Th><Th>Certificación</Th><Th>Geolocalización</Th><Th className="text-right">Kg acopiado</Th><Th className="text-right">Estado export</Th></tr>
          </thead>
          <tbody>
            {view.map((p) => {
              const geo = hasGeo(p);
              return (
                <tr key={p.id} className="border-t border-[var(--rule-soft)]">
                  <Td>
                    <span className="font-medium text-[var(--text-primary)]">{p.nombre}</span>
                    <span className="block text-xs text-[var(--text-tertiary)]"><span className="font-mono">{p.codigo ?? "—"}</span>{p.sector ? ` · ${p.sector}` : ""}</span>
                  </Td>
                  <Td>
                    {p.certificacion && p.certificacion !== "convencional"
                      ? <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--accent)]"><Leaf className="h-3 w-3" />{CERT_LABEL[p.certificacion] ?? p.certificacion}</span>
                      : <span className="text-xs text-[var(--text-tertiary)]">{p.certificacion === "convencional" ? "Convencional" : "Sin declarar"}</span>}
                  </Td>
                  <Td>
                    {geo
                      ? <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--data-success-700)]"><CheckCircle2 className="h-4 w-4" />Cargada</span>
                      : <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--data-warning-700)]"><AlertTriangle className="h-4 w-4" />Falta</span>}
                  </Td>
                  <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{p.stats.lotes ? n2(p.stats.kg) : "—"}</Td>
                  <Td className="text-right">
                    {geo
                      ? <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-success-50)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-700)]"><ShieldCheck className="h-3 w-3" />Listo</span>
                      : <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-warning-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-700)]">Falta geo</span>}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {loading && producers.length === 0 ? (
          <div className="p-8 text-center text-[var(--text-tertiary)]"><RefreshCw className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2 text-sm">Cargando…</p></div>
        ) : view.length === 0 && (
          <div className="p-12 text-center text-[var(--text-tertiary)]">
            <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]"><ShieldCheck className="h-7 w-7" /></span>
            <p className="text-base font-bold text-[var(--text-primary)]">{search ? "Sin resultados" : "Aún no tienes productores"}</p>
            <p className="mx-auto mt-1 max-w-sm text-sm">{search ? "Ningún productor coincide con tu búsqueda." : "Registrá productores y cargá su certificación y ubicación para preparar tu exportación."}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) { return <th className={`px-4 py-3 font-bold text-[var(--text-primary)] ${className ?? ""}`}>{children}</th>; }
function Td({ children, className }: { children: React.ReactNode; className?: string }) { return <td className={`px-4 py-3 align-top ${className ?? ""}`}>{children}</td>; }
