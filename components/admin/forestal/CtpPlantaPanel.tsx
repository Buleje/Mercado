"use client";

/**
 * CtpPlantaPanel — la barra lateral del mapa de planta: qué hay para ubicar.
 *
 * Antes, para decir dónde estaba una troza había que bajar por debajo del mapa a
 * una lista larga y elegir la zona en un `<select>` — sin ver el mapa. Acá la
 * lista vive AL LADO y se opera de las dos maneras que sirven en el patio:
 * arrastrar el ítem hasta la zona (mouse), o tocarlo para tomarlo y después
 * tocar la zona (tablet, que es con lo que se anda entre las pilas).
 *
 * El formato es **una fila por ítem, de una sola línea**: un aserradero real
 * tiene cientos de guías vivas y una tarjeta de tres renglones convierte la
 * lista en un scroll interminable. Todo lo que hace falta para decidir —tipo,
 * guía, cantidad y dónde está— entra en 34 px de alto.
 *
 * Los tipos se eligen en pestañas (Trozas · Aserrada · Despachos) en vez de
 * venir todos en un chorizo: son inventarios distintos y casi nunca se ubican
 * en la misma vuelta.
 */

import { useMemo, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import {
  Boxes,
  Layers,
  MapPin,
  MousePointer,
  PackageCheck,
  Search,
  Truck,
  X as XIcon,
} from "@buleje/design-system/icons";
import {
  zonaTipoMeta,
  type Item,
  type ItemKind,
  type PlantaZona,
} from "@/lib/forestal/planta-zona-types";

/** El tipo que se arrastra. Un `dataTransfer` propio evita que el mapa acepte
 *  cualquier cosa que alguien arrastre de otra pestaña. */
export const DND_ITEM = "application/x-buleje-planta-item";

export const KIND_META: Record<ItemKind, { label: string; corto: string; icon: typeof Boxes }> = {
  troza: { label: "Trozas · materia prima", corto: "Trozas", icon: Boxes },
  producto: { label: "Madera aserrada disponible", corto: "Aserrada", icon: PackageCheck },
  despacho: { label: "Despachos · salidas", corto: "Despachos", icon: Truck },
};

const ORDEN_KIND: ItemKind[] = ["troza", "producto", "despacho"];

/** Cantidad corta: en una fila de una línea, «12.50» pesa igual que «12.5». */
const nCorto = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, ""));

/** Sin tildes y en minúsculas: en el patio nadie escribe «shihuahuaco» con tilde. */
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** «GTF QA-CUADRE-5467124» → «QA-CUADRE-5467124»: el prefijo ya lo dice el icono. */
const corto = (s: string) => s.replace(/^GTF\s+/i, "").replace(/^Despacho\s+/i, "");

export interface CtpPlantaPanelProps {
  items: Item[];
  zonas: PlantaZona[];
  /** entryId → zonaId. */
  asignaciones: Record<string, string>;
  /** El ítem tomado, esperando que se toque una zona. */
  enMano: Item | null;
  onEnMano: (it: Item | null) => void;
  /** Zona a resaltar en el mapa mientras el puntero pasa por un ítem ubicado. */
  onResaltar: (zonaId: string | null) => void;
  onUbicar: (entryId: string, zonaId: string | null) => void;
  /** Ubica de un golpe todos los ítems de un tipo. */
  onUbicarLote: (kind: ItemKind, zonaId: string | null) => void;
  /** Centra el mapa en una zona. */
  onIrAZona: (zonaId: string) => void;
  /** id del ítem con un guardado en vuelo (o `lote:<kind>`). */
  ocupado: string | null;
}

export default function CtpPlantaPanel({
  items, zonas, asignaciones, enMano, onEnMano, onResaltar, onUbicar, onUbicarLote, onIrAZona, ocupado,
}: CtpPlantaPanelProps) {
  const [q, setQ] = useState("");
  const [pestana, setPestana] = useState<ItemKind | "todo">("todo");
  const [soloSinUbicar, setSoloSinUbicar] = useState(false);

  const zonaById = useMemo(() => new Map(zonas.map((z) => [z.id, z])), [zonas]);
  const zonaDe = useMemo(() => (id: string): PlantaZona | null => {
    const zid = asignaciones[id];
    return zid ? zonaById.get(zid) ?? null : null;
  }, [asignaciones, zonaById]);

  const visibles = useMemo(() => {
    const t = norm(q.trim());
    return items.filter((it) => {
      if (pestana !== "todo" && it.kind !== pestana) return false;
      if (soloSinUbicar && zonaDe(it.id)) return false;
      if (!t) return true;
      const z = zonaDe(it.id);
      return norm(`${it.label} ${it.sub ?? ""} ${z?.codigo ?? ""} ${z?.nombre ?? ""}`).includes(t);
    });
  }, [items, q, pestana, soloSinUbicar, zonaDe]);

  const grupos = useMemo(
    () => ORDEN_KIND.map((k) => ({ kind: k, list: visibles.filter((i) => i.kind === k) })).filter((g) => g.list.length > 0),
    [visibles],
  );
  const cuenta = useMemo(() => {
    const m = new Map<ItemKind, { total: number; sin: number }>();
    for (const k of ORDEN_KIND) m.set(k, { total: 0, sin: 0 });
    for (const it of items) {
      const c = m.get(it.kind);
      if (!c) continue;
      c.total += 1;
      if (!zonaDe(it.id)) c.sin += 1;
    }
    return m;
  }, [items, zonaDe]);
  const ubicados = useMemo(() => items.filter((it) => zonaDe(it.id)).length, [items, zonaDe]);
  const sinUbicar = items.length - ubicados;
  const pct = items.length > 0 ? Math.round((ubicados / items.length) * 100) : 0;

  const sinZonas = zonas.length === 0;

  return (
    <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
      {/* ── Cabecera: cuánto falta, en una barra ─────────────────────────── */}
      <div className="border-b-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <CardTitle as="h3" className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
            <Layers className="h-4 w-4 text-[var(--accent)]" /> Qué ubicar
          </CardTitle>
          <span className="shrink-0 font-mono text-xs font-bold tabular-nums text-[var(--text-secondary)]">
            {ubicados}<span className="text-[var(--text-tertiary)]">/{items.length}</span>
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--rule-base)]">
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-[var(--dur-slow)]"
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Madera ubicada en el mapa"
          />
        </div>
        <p className="mt-1 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">
          {sinZonas ? "Dibujá una zona para empezar a ubicar"
            : sinUbicar === 0 ? "Todo ubicado en el mapa"
            : `Faltan ${sinUbicar} por ubicar`}
        </p>
      </div>

      {/* ── Lo que se tiene en la mano ────────────────────────────────────── */}
      {enMano && (
        <div className="flex items-center gap-2 border-b-2 border-[var(--accent)] bg-primary/10 px-3 py-2 dark:bg-[var(--accent)]/12">
          <MousePointer className="h-3.5 w-3.5 shrink-0 animate-pulse text-[var(--accent)]" />
          <span className="min-w-0 flex-1 truncate text-xs font-bold text-[var(--text-primary)]">
            {corto(enMano.label)} <span className="font-medium text-[var(--text-secondary)]">→ tocá la zona</span>
          </span>
          <button type="button" onClick={() => onEnMano(null)} aria-label="Soltar el ítem" className="shrink-0 rounded-md p-0.5 text-[var(--text-tertiary)] hover:bg-[var(--surface-canvas)] hover:text-[var(--text-primary)]">
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ── Pestañas por tipo ─────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b-2 border-[var(--rule-base)] px-2 pt-2" role="tablist" aria-label="Tipo de inventario">
        {(["todo", ...ORDEN_KIND] as const).map((k) => {
          const activa = pestana === k;
          const c = k === "todo" ? { total: items.length, sin: sinUbicar } : cuenta.get(k) ?? { total: 0, sin: 0 };
          if (k !== "todo" && c.total === 0) return null;
          const KI = k === "todo" ? Layers : KIND_META[k].icon;
          return (
            <button
              key={k} type="button" role="tab" aria-selected={activa} onClick={() => setPestana(k)}
              title={k === "todo" ? "Todo el inventario" : KIND_META[k].label}
              className={`-mb-0.5 flex flex-1 flex-col items-center gap-0.5 rounded-t-lg border-b-2 px-1 pb-1.5 pt-1 transition ${
                activa
                  ? "border-[var(--accent)] bg-primary/10 text-[var(--accent)] dark:bg-[var(--accent)]/12"
                  : "border-transparent text-[var(--text-tertiary)] hover:bg-[var(--surface-canvas)] hover:text-[var(--text-secondary)]"
              }`}
            >
              <KI className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="text-[length:var(--ts-2xs)] font-bold leading-none">{k === "todo" ? "Todo" : KIND_META[k].corto}</span>
              <span className="font-mono text-[length:var(--ts-2xs)] font-bold tabular-nums leading-none opacity-70">
                {c.sin > 0 ? `${c.sin}/${c.total}` : c.total}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Buscar + filtro de pendientes ─────────────────────────────────── */}
      <div className="flex items-center gap-1.5 px-2 py-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar guía, especie o zona…"
            aria-label="Buscar qué ubicar"
            className="h-9 w-full rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] pl-7 pr-7 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="Limpiar búsqueda" className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]">
              <XIcon className="h-3 w-3" />
            </button>
          )}
        </div>
        <button
          type="button" onClick={() => setSoloSinUbicar((v) => !v)} aria-pressed={soloSinUbicar}
          title="Ver sólo lo que todavía no tiene lugar en el mapa"
          className={`inline-flex h-9 shrink-0 items-center rounded-lg border-2 px-2 text-[length:var(--ts-2xs)] font-bold transition ${
            soloSinUbicar
              ? "border-[var(--data-warning-500)] bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]"
              : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"
          }`}
        >
          Pendientes
        </button>
      </div>

      {/* ── La lista: una línea por ítem ──────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {grupos.length === 0 && (
          <p className="rounded-xl border-2 border-dashed border-[var(--rule-base)] p-4 text-center text-xs text-[var(--text-tertiary)]">
            {items.length === 0 ? "No hay madera disponible en el período." : "Nada coincide con eso."}
          </p>
        )}
        {grupos.map(({ kind, list }) => (
          <section key={kind} className="mb-2">
            {/* El encabezado del bloque sólo hace falta cuando se ven mezclados. */}
            {pestana === "todo" ? (
              <div className="sticky top-0 z-10 -mx-2 flex items-center justify-between gap-2 bg-[var(--surface-raised)] px-2 py-1">
                <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                  {KIND_META[kind].corto} · {list.length}
                </span>
                {!sinZonas && list.length > 1 && <SelectLote kind={kind} zonas={zonas} disabled={ocupado != null} onUbicarLote={onUbicarLote} />}
              </div>
            ) : (
              !sinZonas && list.length > 1 && (
                <div className="mb-1 flex justify-end">
                  <SelectLote kind={kind} zonas={zonas} disabled={ocupado != null} onUbicarLote={onUbicarLote} />
                </div>
              )
            )}
            <ul className="space-y-0.5">
              {list.map((it) => (
                <FilaItem
                  key={it.id}
                  it={it}
                  zona={zonaDe(it.id)}
                  enMano={enMano?.id === it.id}
                  ocupado={ocupado}
                  sinZonas={sinZonas}
                  onEnMano={onEnMano}
                  onResaltar={onResaltar}
                  onUbicar={onUbicar}
                  onIrAZona={onIrAZona}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      {!sinZonas && (
        <p className="border-t-2 border-[var(--rule-base)] px-3 py-1.5 text-[length:var(--ts-2xs)] leading-snug text-[var(--text-tertiary)]">
          Arrastrá al mapa, o tocá para tomar y después tocá la zona.
        </p>
      )}
    </aside>
  );
}

/** Ubicar todo un tipo de una vez. */
function SelectLote({ kind, zonas, disabled, onUbicarLote }: {
  kind: ItemKind; zonas: PlantaZona[]; disabled: boolean; onUbicarLote: (k: ItemKind, z: string | null) => void;
}) {
  return (
    <select
      value=""
      disabled={disabled}
      onChange={(e) => { if (e.target.value) onUbicarLote(kind, e.target.value === "__none__" ? null : e.target.value); }}
      title="Ubicar todos los de este tipo en una zona"
      aria-label={`Ubicar todas las líneas de ${KIND_META[kind].corto} en una zona`}
      className="h-6 max-w-[8.5rem] rounded border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-1 text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)] outline-none focus:border-[var(--accent)] disabled:opacity-60"
    >
      <option value="">Todas en…</option>
      {zonas.map((z) => <option key={z.id} value={z.id}>{z.codigo}</option>)}
      <option value="__none__">— Quitar —</option>
    </select>
  );
}

/**
 * Una fila = una línea. El icono dice el tipo, el texto la guía, la cifra la
 * cantidad y el chip dónde está. Nada más entra, y nada más hace falta para
 * decidir a qué zona va.
 */
function FilaItem({ it, zona, enMano, ocupado, sinZonas, onEnMano, onResaltar, onUbicar, onIrAZona }: {
  it: Item;
  zona: PlantaZona | null;
  enMano: boolean;
  ocupado: string | null;
  sinZonas: boolean;
  onEnMano: (i: Item | null) => void;
  onResaltar: (z: string | null) => void;
  onUbicar: (id: string, z: string | null) => void;
  onIrAZona: (z: string) => void;
}) {
  const KI = KIND_META[it.kind].icon;
  const meta = zona ? zonaTipoMeta(zona.tipo) : null;
  return (
    <li
      draggable={!sinZonas}
      onDragStart={(e) => {
        e.dataTransfer.setData(DND_ITEM, it.id);
        e.dataTransfer.effectAllowed = "move";
        onEnMano(it);
      }}
      onDragEnd={() => onEnMano(null)}
      onMouseEnter={() => onResaltar(zona?.id ?? null)}
      onMouseLeave={() => onResaltar(null)}
      className={`group flex h-[34px] items-center gap-1.5 rounded-lg border-2 pl-1 pr-1.5 transition-all duration-[var(--dur-fast)] ${
        enMano
          ? "border-[var(--accent)] bg-primary/10 opacity-50 dark:bg-[var(--accent)]/12"
          : "border-transparent bg-[var(--surface-sunken)] hover:border-[var(--accent)] hover:shadow-[var(--shadow-sm)]"
      } ${sinZonas ? "" : "cursor-grab active:cursor-grabbing"} ${ocupado === it.id ? "animate-pulse" : ""}`}
      /* La escala del «ya lo agarré» va por `style` y no por `scale-95`: medido
         en el navegador, las utilidades de escala no producen transform acá. */
      style={enMano ? { transform: "scale(0.96)" } : undefined}
    >
      <button
        type="button"
        disabled={sinZonas || ocupado != null}
        onClick={() => onEnMano(enMano ? null : it)}
        aria-pressed={enMano}
        title={`${it.label}${it.sub ? ` · ${it.sub}` : ""} · ${it.cantidad} ${it.unidad}${zona ? ` · en ${zona.codigo}` : " · sin ubicar"}`}
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left disabled:cursor-default"
      >
        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md ${
          zona ? "bg-[var(--accent)]/15 text-[var(--accent)]" : "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
        }`}>
          <KI className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-bold text-[var(--text-primary)]">
          {corto(it.label)}
          {it.sub && <span className="ml-1 font-medium text-[var(--text-tertiary)]">{it.sub}</span>}
        </span>
        {it.cites && <span title="CITES" className="shrink-0 rounded bg-[var(--data-error-500)]/15 px-1 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">C</span>}
        <span className="shrink-0 font-mono text-[length:var(--ts-2xs)] font-bold tabular-nums text-[var(--text-secondary)]">
          {nCorto(it.cantidad)}<span className="ml-0.5 font-sans font-medium text-[var(--text-tertiary)]">{it.unidad}</span>
        </span>
      </button>
      {zona && meta ? (
        <span className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={() => onIrAZona(zona.id)}
            title={`Ir a ${zona.codigo}${zona.nombre ? ` · ${zona.nombre}` : ""} en el mapa`}
            className="inline-flex max-w-[5.5rem] items-center gap-1 rounded border-2 border-[var(--rule-base)] px-1 text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: meta.ring }} />
            <span className="truncate">{zona.codigo}</span>
          </button>
          <button
            type="button"
            onClick={() => onUbicar(it.id, null)}
            disabled={ocupado != null}
            aria-label={`Quitar ${it.label} de ${zona.codigo}`}
            title="Quitar del mapa"
            className="ml-0.5 rounded p-0.5 text-[var(--text-tertiary)] opacity-0 transition hover:bg-[var(--surface-canvas)] hover:text-[var(--data-error-500)] focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-50"
          >
            <XIcon className="h-3 w-3" />
          </button>
        </span>
      ) : (
        <MapPin className="h-3 w-3 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" aria-label="Sin ubicar" />
      )}
    </li>
  );
}
