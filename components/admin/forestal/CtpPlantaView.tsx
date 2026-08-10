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
import { AlertCircle, RefreshCw, Map as MapIcon, Layers, Boxes, PackageCheck, Truck, Printer, PieChart, X } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { applyCtpPeriodParams, type CtpPeriod } from "@/lib/forestal/ctp-period";
import { ZONA_TIPOS, zonaTipoMeta, type Item, type ItemKind, type PlantaZona, type ZonaInv } from "@/lib/forestal/planta-zona-types";
import { fichaItemHtml, fichaZonaHtml } from "@/lib/forestal/planta-iconos";
import { fmtSubtotal, fmtSubtotales, normalizarUnidad, resumirItems } from "@/lib/forestal/planta-resumen";
import { printPlantaPlano } from "@/lib/forestal/planta-plano-print";
import CtpPlantaMapa from "./CtpPlantaMapa";
import CtpPlantaPanel from "./CtpPlantaPanel";
import CtpPlantaEspecies from "./CtpPlantaEspecies";

export type { Item, ItemKind, ZonaInv };

interface PlantaSaldos {
  materiaPrima: { ingresoM3: number; consumidoM3: number; saldoM3: number };
  productoStock: number;
  despachado: number;
}

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

/** Área legible: el aserradero se mide en m², el terreno grande en ha. */
const fmtArea = (m2: number) => (m2 >= 10000 ? `${(m2 / 10000).toFixed(2)} ha` : `${Math.round(m2).toLocaleString("es-PE")} m²`);

const KIND_LABEL: Record<ItemKind, string> = {
  troza: "Troza en patio",
  producto: "Aserrada lista",
  despacho: "Despacho armado",
};

export default function CtpPlantaView({ period }: { period: CtpPeriod }) {
  const [zonas, setZonas] = useState<PlantaZona[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [asignaciones, setAsignaciones] = useState<Record<string, string>>({});
  const [saldos, setSaldos] = useState<PlantaSaldos | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [asignando, setAsignando] = useState<string | null>(null);
  /** El ítem tomado de la barra lateral, esperando que se toque una zona. */
  const [enMano, setEnMano] = useState<Item | null>(null);
  /** Zona destacada mientras el puntero pasa por su ítem en la lista. */
  const [resaltada, setResaltada] = useState<string | null>(null);
  const [irA, setIrA] = useState<{ zonaId: string; n: number } | null>(null);
  /** Aviso de operación (soltar afuera, ubicado OK) — efímero, no es un error. */
  const [aviso, setAviso] = useState<string | null>(null);
  /** El último ubicado: su chapita entra al mapa con la animación de caída. */
  const [recien, setRecien] = useState<string | null>(null);
  /** entryId → punto exacto dentro de su zona (el operador movió el icono). */
  const [posiciones, setPosiciones] = useState<Record<string, { lat: number; lng: number }>>({});

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
      // Las posiciones sueltas viajan aparte: el mapa reparte solo las que no tienen.
      const pos: Record<string, { lat: number; lng: number }> = {};
      for (const [id, u] of Object.entries((pz.ubicaciones ?? {}) as Record<string, { lat?: number; lng?: number }>)) {
        if (typeof u?.lat === "number" && typeof u?.lng === "number") pos[id] = { lat: u.lat, lng: u.lng };
      }
      setPosiciones(pos);
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

  /**
   * El ítem que estaba en la mano cayó en una zona. Confirma con el nombre de
   * la zona: en un mapa con seis polígonos parecidos, «listo» no alcanza para
   * saber si fue donde el operador quería.
   */
  const soltarEnZona = useCallback((zonaId: string) => {
    const it = enMano;
    if (!it) return;
    setEnMano(null);
    const z = zonas.find((x) => x.id === zonaId);
    setAviso(`${it.label} → ${z ? `${z.codigo}${z.nombre ? ` · ${z.nombre}` : ""}` : "la zona"}`);
    setRecien(it.id);
    void asignar(it.id, zonaId);
  }, [enMano, zonas, asignar]);

  // Escape suelta lo que se tenga en la mano: quedarse con un ítem pegado al
  // cursor sin saber cómo soltarlo es la forma más rápida de trabarse.
  useEffect(() => {
    if (!enMano) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setEnMano(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enMano]);

  // El aviso se va solo: es un acuse, no algo que haya que cerrar a mano.
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 4000);
    return () => clearTimeout(t);
  }, [aviso]);

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
  /** zonaId → qué hay ahí, para que el mapa le ponga su chapita a cada uno. */
  const itemsPorZona = useMemo(() => {
    const m: Record<string, Item[]> = {};
    for (const it of items) {
      const zid = asignaciones[it.id];
      if (!zid || !zonaById.has(zid)) continue;
      (m[zid] ??= []).push(it);
    }
    return m;
  }, [items, asignaciones, zonaById]);

  const ubicadosPorZona = useMemo(() => {
    const m: Record<string, { id: string; kind: ItemKind; label: string; cites: boolean; cantidad: string }[]> = {};
    for (const [zid, list] of Object.entries(itemsPorZona)) {
      m[zid] = list.map((it) => ({
        id: it.id, kind: it.kind, label: it.label, cites: it.cites,
        cantidad: fmtSubtotal({ unidad: normalizarUnidad(it.unidad), cantidad: it.cantidad, lineas: 1 }),
      }));
    }
    return m;
  }, [itemsPorZona]);

  /** Ficha emergente de un ítem: qué es, cuánto queda y dónde está. */
  const fichaDeItem = useCallback((entryId: string): string | null => {
    const it = items.find((x) => x.id === entryId);
    if (!it) return null;
    const z = zonaById.get(asignaciones[entryId] ?? "");
    return fichaItemHtml({
      kind: it.kind,
      titulo: it.label,
      especie: it.especie ?? it.sub,
      cantidad: fmtSubtotal({ unidad: normalizarUnidad(it.unidad), cantidad: it.cantidad, lineas: 1 }),
      zona: z ? `${z.codigo}${z.nombre ? ` · ${z.nombre}` : ""}` : "—",
      cites: it.cites,
      entryId,
    });
  }, [items, asignaciones, zonaById]);

  /** Ficha emergente de una zona: el terreno + qué hay parado, por especie. */
  const fichaDeZona = useCallback((zonaId: string): string | null => {
    const z = zonaById.get(zonaId);
    if (!z) return null;
    const meta = zonaTipoMeta(z.tipo);
    const r = resumirItems(itemsPorZona[zonaId] ?? [], (it) => it.especie ?? it.sub);
    return fichaZonaHtml({
      codigo: z.codigo,
      nombre: z.nombre,
      tipoLabel: meta.label,
      color: meta.ring,
      area: z.areaM2 != null ? fmtArea(z.areaM2) : null,
      notas: z.notas,
      porKind: r.porKind.map((k) => ({ label: KIND_LABEL[k.kind], valor: fmtSubtotales(k.subtotales), lineas: k.lineas })),
      porEspecie: r.porEspecie.map((e) => ({ especie: e.especie, valor: fmtSubtotales(e.subtotales), lineas: e.lineas })),
      vacia: r.lineas === 0,
    });
  }, [zonaById, itemsPorZona]);

  /** Mover el icono dentro de su zona: guarda el punto, sin cambiar de zona. */
  const moverItem = useCallback((entryId: string, pos: { lat: number; lng: number }) => {
    const zonaId = asignaciones[entryId];
    if (!zonaId) return;
    setPosiciones((p) => ({ ...p, [entryId]: pos }));
    fetch("/api/admin/forestal/ctp/planta", {
      method: "PUT", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include",
      body: JSON.stringify({ entryId, zonaId, lat: pos.lat, lng: pos.lng }),
    }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); })
      .catch((err) => { setError(`No se pudo guardar la posición: ${String(err)}`); void load(); });
  }, [asignaciones, load]);
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

  return (
    <div className="space-y-3">
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
        <StatCard density="compact" label="Zonas mapeadas" value={String(zonas.length)} subValue={areaTotal > 0 ? `${areaTotal >= 10000 ? `${(areaTotal / 10000).toFixed(2)} ha` : `${Math.round(areaTotal).toLocaleString("es-PE")} m²`} en total` : "sin dibujar"} icon={MapIcon} emphasis="neutral" />
        <StatCard density="compact" label="Materia prima en patio" value={saldos ? `${n2(saldos.materiaPrima.saldoM3)} m³` : "—"} subValue="troza sin consumir" icon={Boxes} emphasis={saldos && saldos.materiaPrima.saldoM3 < 0 ? "error" : "success"} />
        <StatCard density="compact" label="Producto terminado" value={saldos ? n2(saldos.productoStock) : "—"} subValue="aserrada lista" icon={PackageCheck} emphasis="neutral" />
        <StatCard density="compact" label="Despachado en el período" value={saldos ? n2(saldos.despachado) : "—"} subValue={period.label} icon={Truck} emphasis="neutral" />
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

      {/* Mapa + barra lateral: la lista de lo que hay para ubicar vive AL LADO
          del mapa, no debajo — se arrastra de una a otro sin perder de vista
          dónde está cada cosa. Debajo de `xl` la barra pasa abajo (el mapa
          necesita ancho para ser útil). */}
      <div className="grid gap-3 xl:grid-cols-[1fr_22rem]">
        <CtpPlantaMapa
          zonas={zonas}
          inventario={invObj}
          onChanged={load}
          enMano={enMano}
          onSoltarEnZona={soltarEnZona}
          onSoltarAfuera={() => setAviso("Soltalo DENTRO de una zona dibujada; ahí afuera no hay nada mapeado.")}
          zonaResaltada={resaltada}
          irA={irA}
          ubicados={ubicadosPorZona}
          recienUbicado={recien}
          posiciones={posiciones}
          onMover={moverItem}
          onQuitar={(id) => void asignar(id, null)}
          fichaDeItem={fichaDeItem}
          fichaDeZona={fichaDeZona}
        />
        <CtpPlantaPanel
          items={items}
          zonas={zonas}
          asignaciones={asignaciones}
          enMano={enMano}
          onEnMano={setEnMano}
          onResaltar={setResaltada}
          onUbicar={(id, zid) => void asignar(id, zid)}
          onUbicarLote={(k, zid) => void asignarLote(k, zid)}
          onIrAZona={(zid) => setIrA((p) => ({ zonaId: zid, n: (p?.n ?? 0) + 1 }))}
          ocupado={asignando}
        />
      </div>

      {aviso && (
        <p className="flex items-center justify-between gap-2 rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-3 py-2 text-sm font-bold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
          {aviso}
          <button type="button" onClick={() => setAviso(null)} aria-label="Cerrar aviso" className="shrink-0"><X className="h-4 w-4" /></button>
        </p>
      )}

      {/* Qué madera hay, por especie — la pregunta que el mapa no responde. */}
      <CtpPlantaEspecies items={items} ubicados={Object.keys(asignaciones).filter((id) => zonaById.has(asignaciones[id])).length} />

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
                          <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]"><Boxes className="h-3 w-3" />{invSummary(inv)}</p>
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
