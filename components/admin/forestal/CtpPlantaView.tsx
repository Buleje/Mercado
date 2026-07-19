"use client";

/**
 * CtpPlantaView — pestaña "Planta" del Libro CTP: el mapa del aserradero (ADR-142).
 *
 * Junta el gemelo espacial (zonas dibujadas sobre el satélite, CtpPlantaMapa) con
 * lo que dice el Libro AHORA: cuánta materia prima hay en patio, cuánto se
 * consumió y cuánto producto terminado espera despacho. Así el operador ve DÓNDE
 * están las cosas (mapa) y CUÁNTO hay moviéndose (Libro) en una sola vista.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { CardTitle, StatCard } from "@buleje/design-system";
import { AlertCircle, RefreshCw, Map as MapIcon, Layers, Boxes, PackageCheck, Truck } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { applyCtpPeriodParams, type CtpPeriod } from "@/lib/forestal/ctp-period";
import { ZONA_TIPOS, zonaTipoMeta, type PlantaZona } from "@/lib/forestal/planta-zona-types";
import CtpPlantaMapa from "./CtpPlantaMapa";

interface PlantaSaldos {
  materiaPrima: { ingresoM3: number; consumidoM3: number; saldoM3: number };
  productoStock: number;
  despachado: number;
}
export interface Troza { id: string; gtf: string | null; species: string | null; cites: boolean; disponible: number; entryDate: string }
export interface ZonaInv { count: number; m3: number }

const n2 = (v: number) => v.toFixed(2);

export default function CtpPlantaView({ period }: { period: CtpPeriod }) {
  const [zonas, setZonas] = useState<PlantaZona[]>([]);
  const [trozas, setTrozas] = useState<Troza[]>([]);
  const [asignaciones, setAsignaciones] = useState<Record<string, string>>({});
  const [saldos, setSaldos] = useState<PlantaSaldos | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [asignando, setAsignando] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const sp = applyCtpPeriodParams(new URLSearchParams({ saldos: "1" }), period);
      const [rz, rs] = await Promise.all([
        fetch("/api/admin/forestal/ctp/planta", { credentials: "include" }),
        fetch(`/api/admin/forestal/ctp?${sp}`, { credentials: "include" }),
      ]);
      if (!rz.ok) throw new Error((await rz.json().catch(() => ({}))).message ?? `HTTP ${rz.status}`);
      const pz = await rz.json();
      setZonas(pz.zonas ?? []);
      setTrozas(pz.trozas ?? []);
      setAsignaciones(pz.asignaciones ?? {});
      if (rs.ok) {
        const s = (await rs.json()).saldos;
        const mp = s?.materiaPrima ?? { ingresoM3: 0, consumidoM3: 0, saldoM3: 0 };
        const productos = (s?.productos ?? []) as { producido: number; despachado: number; stock: number }[];
        setSaldos({
          materiaPrima: { ingresoM3: Number(mp.ingresoM3 ?? 0), consumidoM3: Number(mp.consumidoM3 ?? 0), saldoM3: Number(mp.saldoM3 ?? 0) },
          productoStock: productos.reduce((a, p) => a + Number(p.stock ?? 0), 0),
          despachado: productos.reduce((a, p) => a + Number(p.despachado ?? 0), 0),
        });
      }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [period]);
  useEffect(() => { void load(); }, [load]);

  // Ubicar (o quitar) una troza en una zona — optimista con recarga.
  const asignar = useCallback(async (entryId: string, zonaId: string | null) => {
    setAsignando(entryId);
    setAsignaciones((prev) => { const next = { ...prev }; if (zonaId) next[entryId] = zonaId; else delete next[entryId]; return next; });
    try {
      const r = await fetch("/api/admin/forestal/ctp/planta", {
        method: "PUT", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include",
        body: JSON.stringify({ entryId, zonaId }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); void load(); }
    finally { setAsignando(null); }
  }, [load]);

  const porTipo = useMemo(() => {
    const m = new Map<string, number>();
    for (const z of zonas) m.set(z.tipo, (m.get(z.tipo) ?? 0) + 1);
    return ZONA_TIPOS.filter((t) => m.has(t.tipo)).map((t) => ({ ...t, count: m.get(t.tipo) ?? 0 }));
  }, [zonas]);
  const areaTotal = useMemo(() => zonas.reduce((a, z) => a + (z.areaM2 ?? 0), 0), [zonas]);
  const zonasByTipo = useMemo(
    () => ZONA_TIPOS.map((t) => ({ tipo: t, list: zonas.filter((z) => z.tipo === t.tipo) })).filter((g) => g.list.length > 0),
    [zonas],
  );

  const zonaById = useMemo(() => new Map(zonas.map((z) => [z.id, z])), [zonas]);
  // Inventario ubicado por zona (trozas asignadas a una zona existente).
  const invPorZona = useMemo(() => {
    const m = new Map<string, ZonaInv>();
    for (const t of trozas) {
      const zid = asignaciones[t.id];
      if (zid && zonaById.has(zid)) {
        const cur = m.get(zid) ?? { count: 0, m3: 0 };
        cur.count += 1; cur.m3 += t.disponible;
        m.set(zid, cur);
      }
    }
    return m;
  }, [trozas, asignaciones, zonaById]);
  const invObj = useMemo(() => Object.fromEntries([...invPorZona].map(([k, v]) => [k, { count: v.count, m3: Math.round(v.m3 * 100) / 100 }])), [invPorZona]);
  const sinUbicar = useMemo(() => trozas.filter((t) => { const z = asignaciones[t.id]; return !z || !zonaById.has(z); }), [trozas, asignaciones, zonaById]);
  const sinUbicarM3 = useMemo(() => sinUbicar.reduce((a, t) => a + t.disponible, 0), [sinUbicar]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-[var(--text-tertiary)]">
          <strong className="text-[var(--text-secondary)]">Mapa de tu aserradero.</strong> Dibujá las zonas de la planta (entrada, patio de trozas, aserrado, despacho…) sobre el satélite: el mapa muestra <em>dónde</em> está la madera y el Libro, <em>cuánta</em> se mueve.
        </p>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Recargar</button>
      </div>

      {error && <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>Error:</strong> {error}</div></div>}

      {/* Qué se mueve en la planta AHORA (del Libro) — el contexto del mapa. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Zonas mapeadas" value={String(zonas.length)} subValue={areaTotal > 0 ? `${areaTotal >= 10000 ? `${(areaTotal / 10000).toFixed(2)} ha` : `${Math.round(areaTotal).toLocaleString("es-PE")} m²`} en total` : "sin dibujar"} icon={MapIcon} emphasis="neutral" />
        <StatCard label="Materia prima en patio" value={saldos ? `${n2(saldos.materiaPrima.saldoM3)} m³` : "—"} subValue="troza sin consumir" icon={Boxes} emphasis={saldos && saldos.materiaPrima.saldoM3 < 0 ? "error" : "success"} />
        <StatCard label="Producto terminado" value={saldos ? n2(saldos.productoStock) : "—"} subValue="aserrada lista" icon={PackageCheck} emphasis="neutral" />
        <StatCard label="Despachado en el período" value={saldos ? n2(saldos.despachado) : "—"} subValue={period.label} icon={Truck} emphasis="neutral" />
      </div>

      {/* Distribución de zonas por tipo (chips). */}
      {porTipo.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {porTipo.map((t) => (
            <span key={t.tipo} className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-1 text-sm font-bold text-[var(--text-secondary)]">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.ring }} />{t.label}
              <span className="rounded-full bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] tabular-nums">{t.count}</span>
            </span>
          ))}
        </div>
      )}

      {/* El mapa (las etiquetas muestran el inventario ubicado en cada zona). */}
      <CtpPlantaMapa zonas={zonas} inventario={invObj} onChanged={load} />

      {/* Ubicar madera: llevar cada troza con saldo a su zona (o dejarla sin ubicar). */}
      {trozas.length > 0 && (
        <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <CardTitle as="h3" className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"><Boxes className="h-4 w-4" /> Ubicar madera en la planta</CardTitle>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${sinUbicar.length === 0 ? "bg-[var(--data-success-50)] text-[var(--data-success-700)]" : "bg-[var(--data-warning-50)] text-[var(--data-warning-700)]"}`}>
              {trozas.length - sinUbicar.length} de {trozas.length} ubicadas{sinUbicar.length > 0 ? ` · ${n2(sinUbicarM3)} m³ sin ubicar` : ""}
            </span>
          </div>
          <p className="mb-3 text-xs text-[var(--text-tertiary)]">Cada troza con saldo sin consumir. Elegí en qué zona está apilada — así el mapa muestra dónde está cada madera. {zonas.length === 0 && <strong className="text-[var(--data-warning-700)]">Dibujá zonas primero para poder ubicar.</strong>}</p>
          <ul className="space-y-1.5">
            {[...trozas].sort((a, b) => Number(!!asignaciones[a.id] && zonaById.has(asignaciones[a.id])) - Number(!!asignaciones[b.id] && zonaById.has(asignaciones[b.id]))).map((t) => {
              const zid = asignaciones[t.id] && zonaById.has(asignaciones[t.id]) ? asignaciones[t.id] : "";
              return (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2 text-sm">
                    <span className="font-bold text-[var(--text-primary)]">GTF {t.gtf || "—"}</span>
                    <span className="truncate text-[var(--text-tertiary)]">· {t.species ?? "—"}</span>
                    {t.cites && <span className="rounded-full bg-[var(--data-error-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]">CITES</span>}
                    <span className="font-mono text-xs font-bold text-[var(--text-secondary)]">{n2(t.disponible)} m³</span>
                  </div>
                  <select
                    value={zid}
                    disabled={asignando === t.id || zonas.length === 0}
                    onChange={(e) => void asignar(t.id, e.target.value || null)}
                    className="h-9 shrink-0 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)] disabled:opacity-60"
                  >
                    <option value="">Sin ubicar</option>
                    {zonas.map((z) => <option key={z.id} value={z.id}>{z.codigo} · {zonaTipoMeta(z.tipo).label}</option>)}
                  </select>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Lista de zonas por tipo (overview no-mapa). */}
      {zonasByTipo.length > 0 && (
        <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
          <CardTitle as="h3" className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"><Layers className="h-4 w-4" /> Zonas de la planta</CardTitle>
          <div className="space-y-4">
            {zonasByTipo.map(({ tipo, list }) => (
              <div key={tipo.tipo}>
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]"><span className="h-2.5 w-2.5 rounded-full" style={{ background: tipo.ring }} />{tipo.label} · {list.length}</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {list.map((z) => {
                    const inv = invPorZona.get(z.id);
                    return (
                      <div key={z.id} className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-[var(--text-primary)]">{z.codigo}</span>
                          {z.areaM2 != null && <span className="font-mono text-xs text-[var(--text-tertiary)]">{z.areaM2 >= 10000 ? `${(z.areaM2 / 10000).toFixed(2)} ha` : `${Math.round(z.areaM2).toLocaleString("es-PE")} m²`}</span>}
                        </div>
                        {z.nombre && <p className="truncate text-sm text-[var(--text-secondary)]">{z.nombre}</p>}
                        {inv ? (
                          <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-bold text-[var(--accent-dark)]"><Boxes className="h-3 w-3" />{inv.count} {inv.count === 1 ? "troza" : "trozas"} · {n2(inv.m3)} m³</p>
                        ) : (
                          <p className="mt-1 text-xs text-[var(--text-tertiary)]">sin madera ubicada</p>
                        )}
                        {z.notas && <p className="mt-0.5 line-clamp-2 text-xs text-[var(--text-tertiary)]">{z.notas}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-[var(--text-tertiary)]">Tocá una zona en el mapa para editar su ficha o borrarla.</p>
        </div>
      )}
    </div>
  );
}
