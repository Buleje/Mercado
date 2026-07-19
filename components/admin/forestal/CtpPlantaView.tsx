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
import { AlertCircle, RefreshCw, Map as MapIcon, Layers, Boxes, PackageCheck, Truck, Printer, PieChart } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { applyCtpPeriodParams, type CtpPeriod } from "@/lib/forestal/ctp-period";
import { ZONA_TIPOS, zonaTipoMeta, type PlantaZona } from "@/lib/forestal/planta-zona-types";
import { printPlantaPlano } from "@/lib/forestal/planta-plano-print";
import CtpPlantaMapa from "./CtpPlantaMapa";

interface PlantaSaldos {
  materiaPrima: { ingresoM3: number; consumidoM3: number; saldoM3: number };
  productoStock: number;
  despachado: number;
}
export type ItemKind = "troza" | "producto" | "despacho";
export interface Item { id: string; kind: ItemKind; label: string; sub: string | null; cantidad: number; unidad: string; cites: boolean }
export interface ZonaInv { trozas: number; m3: number; productos: number; despachos: number }

const KIND_META: Record<ItemKind, { label: string; icon: typeof Boxes }> = {
  troza: { label: "Trozas · materia prima", icon: Boxes },
  producto: { label: "Producto terminado", icon: PackageCheck },
  despacho: { label: "Despachos · salidas", icon: Truck },
};

/** Resumen legible del inventario ubicado en una zona (por tipo, sin mezclar unidades). */
function invSummary(inv?: ZonaInv): string | null {
  if (!inv) return null;
  const p: string[] = [];
  if (inv.trozas) p.push(`${inv.trozas} troza${inv.trozas === 1 ? "" : "s"} · ${inv.m3.toFixed(2)} m³`);
  if (inv.productos) p.push(`${inv.productos} producto${inv.productos === 1 ? "" : "s"}`);
  if (inv.despachos) p.push(`${inv.despachos} despacho${inv.despachos === 1 ? "" : "s"}`);
  return p.length ? p.join(" · ") : null;
}

const n2 = (v: number) => v.toFixed(2);

export default function CtpPlantaView({ period }: { period: CtpPeriod }) {
  const [zonas, setZonas] = useState<PlantaZona[]>([]);
  const [items, setItems] = useState<Item[]>([]);
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
      setItems(pz.items ?? []);
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

  // Ubicar EN LOTE: todos los ítems de un tipo (troza/producto/despacho) a una
  // zona de un click. PUTs en paralelo (filas por-entry, sin carrera); recarga
  // ante cualquier fallo para no dejar el estado optimista inconsistente.
  const asignarLote = useCallback(async (kind: ItemKind, zonaId: string | null) => {
    const targets = items.filter((it) => it.kind === kind);
    if (targets.length === 0) return;
    setAsignando(`lote:${kind}`);
    setAsignaciones((prev) => {
      const next = { ...prev };
      for (const it of targets) { if (zonaId) next[it.id] = zonaId; else delete next[it.id]; }
      return next;
    });
    try {
      await Promise.all(targets.map((it) =>
        fetch("/api/admin/forestal/ctp/planta", {
          method: "PUT", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include",
          body: JSON.stringify({ entryId: it.id, zonaId }),
        }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); }),
      ));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); void load(); }
    finally { setAsignando(null); }
  }, [items, load]);

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
  // Inventario ubicado por zona, por tipo (trozas m³ + conteo de productos/despachos).
  const invPorZona = useMemo(() => {
    const m = new Map<string, ZonaInv>();
    for (const it of items) {
      const zid = asignaciones[it.id];
      if (zid && zonaById.has(zid)) {
        const cur = m.get(zid) ?? { trozas: 0, m3: 0, productos: 0, despachos: 0 };
        if (it.kind === "troza") { cur.trozas += 1; cur.m3 += it.cantidad; }
        else if (it.kind === "producto") cur.productos += 1;
        else cur.despachos += 1;
        m.set(zid, cur);
      }
    }
    return m;
  }, [items, asignaciones, zonaById]);
  const invObj = useMemo(() => Object.fromEntries([...invPorZona].map(([k, v]) => [k, { ...v, m3: Math.round(v.m3 * 100) / 100 }])), [invPorZona]);
  // Ocupación de la planta: cómo se reparte el área mapeada por tipo de zona
  // (+ m³ ubicados por tipo). Ordenado por área desc. Solo tipos con área.
  const ocupacion = useMemo(() => zonasByTipo
    .map(({ tipo, list }) => {
      const area = list.reduce((a, z) => a + (z.areaM2 ?? 0), 0);
      const m3 = list.reduce((a, z) => a + (invPorZona.get(z.id)?.m3 ?? 0), 0);
      return { tipo, count: list.length, area, m3, pct: areaTotal > 0 ? (area / areaTotal) * 100 : 0 };
    })
    .filter((o) => o.area > 0)
    .sort((a, b) => b.area - a.area), [zonasByTipo, invPorZona, areaTotal]);
  const isPlaced = useCallback((id: string) => { const z = asignaciones[id]; return !!z && zonaById.has(z); }, [asignaciones, zonaById]);
  const sinUbicar = useMemo(() => items.filter((it) => !isPlaced(it.id)), [items, isPlaced]);
  const itemsByKind = useMemo(
    () => (["troza", "producto", "despacho"] as const).map((k) => ({ kind: k, list: items.filter((i) => i.kind === k) })).filter((g) => g.list.length > 0),
    [items],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-[var(--text-tertiary)]">
          <strong className="text-[var(--text-secondary)]">Mapa de tu aserradero.</strong> Dibujá las zonas de la planta (entrada, patio de trozas, aserrado, despacho…) sobre el satélite: el mapa muestra <em>dónde</em> está la madera y el Libro, <em>cuánta</em> se mueve.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => { try { printPlantaPlano({ zonas, invByZona: invObj, areaTotalM2: areaTotal, periodLabel: period.label }); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }}
            title="Imprimir el plano de la planta (satélite + zonas + inventario) para la visita de la ARFFS"
            className="inline-flex h-10 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
          ><Printer className="h-4 w-4" /><span className="hidden sm:inline">Imprimir plano</span></button>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Recargar</button>
        </div>
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

      {/* Ocupación de la planta: reparto del área mapeada por tipo de zona. */}
      {ocupacion.length > 0 && (
        <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
          <CardTitle as="h3" className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"><PieChart className="h-4 w-4" /> Ocupación de la planta</CardTitle>
          <div className="flex h-4 w-full overflow-hidden rounded-full border border-[var(--rule-base)]">
            {ocupacion.map((o) => (
              <div key={o.tipo.tipo} style={{ width: `${o.pct}%`, background: o.tipo.ring }} title={`${o.tipo.label} · ${o.pct.toFixed(0)}%`} />
            ))}
          </div>
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ocupacion.map((o) => (
              <li key={o.tipo.tipo} className="flex items-center justify-between gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: o.tipo.ring }} />
                  <span className="truncate font-bold text-[var(--text-primary)]">{o.tipo.label}</span>
                  <span className="shrink-0 text-[var(--text-tertiary)]">· {o.count}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="font-mono font-bold text-[var(--text-secondary)]">{o.pct.toFixed(0)}%</span>
                  {o.m3 > 0 && <span className="ml-2 text-xs text-[var(--text-tertiary)]">{o.m3.toFixed(1)} m³</span>}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-[var(--text-tertiary)]">Área total mapeada: <strong className="text-[var(--text-secondary)]">{areaTotal >= 10000 ? `${(areaTotal / 10000).toFixed(2)} ha` : `${Math.round(areaTotal).toLocaleString("es-PE")} m²`}</strong> · el % es sobre el área dibujada, no sobre el terreno real.</p>
        </div>
      )}

      {/* Ubicar el flujo físico: troza → producto terminado → despacho, cada uno a su zona. */}
      {items.length > 0 && (
        <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <CardTitle as="h3" className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"><Boxes className="h-4 w-4" /> Ubicar el flujo de la planta</CardTitle>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${sinUbicar.length === 0 ? "bg-[var(--data-success-50)] text-[var(--data-success-700)]" : "bg-[var(--data-warning-50)] text-[var(--data-warning-700)]"}`}>
              {items.length - sinUbicar.length} de {items.length} ubicados
            </span>
          </div>
          <p className="mb-3 text-xs text-[var(--text-tertiary)]">Troza (materia prima), producto terminado y despachos — elegí en qué zona está cada uno para que el mapa muestre dónde está todo. {zonas.length === 0 && <strong className="text-[var(--data-warning-700)]">Dibujá zonas primero para poder ubicar.</strong>}</p>
          <div className="space-y-3">
            {itemsByKind.map(({ kind, list }) => {
              const KI = KIND_META[kind].icon;
              const ordered = [...list].sort((a, b) => Number(isPlaced(a.id)) - Number(isPlaced(b.id)));
              return (
                <div key={kind}>
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]"><KI className="h-3.5 w-3.5" />{KIND_META[kind].label} · {list.length}</p>
                    {zonas.length > 0 && list.length > 1 && (
                      <select
                        value=""
                        disabled={asignando != null}
                        onChange={(e) => { if (e.target.value) void asignarLote(kind, e.target.value === "__none__" ? null : e.target.value); }}
                        title={`Ubicar los ${list.length} ítems de este tipo en una zona de un click`}
                        className="h-8 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-xs font-bold text-[var(--text-secondary)] outline-none focus:border-[var(--accent)] disabled:opacity-60"
                      >
                        <option value="">Ubicar todas en…</option>
                        {zonas.map((z) => <option key={z.id} value={z.id}>{z.codigo} · {zonaTipoMeta(z.tipo).label}</option>)}
                        <option value="__none__">— Quitar de todas —</option>
                      </select>
                    )}
                  </div>
                  <ul className="space-y-1.5">
                    {ordered.map((it) => {
                      const zid = isPlaced(it.id) ? asignaciones[it.id] : "";
                      return (
                        <li key={it.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2">
                          <div className="flex min-w-0 items-center gap-2 text-sm">
                            <span className="font-bold text-[var(--text-primary)]">{it.label}</span>
                            {it.sub && <span className="truncate text-[var(--text-tertiary)]">· {it.sub}</span>}
                            {it.cites && <span className="rounded-full bg-[var(--data-error-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]">CITES</span>}
                            <span className="font-mono text-xs font-bold text-[var(--text-secondary)]">{n2(it.cantidad)} {it.unidad}</span>
                          </div>
                          <select
                            value={zid}
                            disabled={asignando === it.id || zonas.length === 0}
                            onChange={(e) => void asignar(it.id, e.target.value || null)}
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
              );
            })}
          </div>
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
                        {invSummary(inv) ? (
                          <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-bold text-[var(--accent-dark)]"><Boxes className="h-3 w-3" />{invSummary(inv)}</p>
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
