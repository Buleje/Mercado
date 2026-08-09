"use client";

/**
 * CtpPlantaPanel — la barra lateral del mapa de planta: qué hay para ubicar.
 *
 * Antes, para decir dónde estaba una troza había que bajar por debajo del mapa
 * a una lista larga y elegir la zona en un `<select>` — sin ver el mapa. Acá la
 * lista vive AL LADO del mapa y se opera de las dos maneras que sirven en el
 * patio:
 *
 * 1. **Arrastrar** el ítem y soltarlo dentro de la zona (mouse).
 * 2. **Tocar** el ítem para tomarlo y después tocar la zona (tablet, que es con
 *    lo que se anda entre las pilas).
 *
 * Pasar el dedo o el mouse por un ítem ya ubicado resalta su zona en el mapa:
 * la pregunta «¿dónde está esta guía?» se responde sin abrir nada.
 */

import { useMemo, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import {
  Boxes,
  MousePointer,
  MapPin,
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

const n2 = (v: number) => v.toFixed(2);

/** Sin tildes y en minúsculas: en el patio nadie escribe «shihuahuaco» con tilde. */
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

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
  const [filtro, setFiltro] = useState<ItemKind | "todo">("todo");
  const [soloSinUbicar, setSoloSinUbicar] = useState(false);

  const zonaById = useMemo(() => new Map(zonas.map((z) => [z.id, z])), [zonas]);
  const zonaDe = (id: string): PlantaZona | null => {
    const zid = asignaciones[id];
    return zid ? zonaById.get(zid) ?? null : null;
  };

  const visibles = useMemo(() => {
    const t = norm(q.trim());
    return items.filter((it) => {
      if (filtro !== "todo" && it.kind !== filtro) return false;
      if (soloSinUbicar && zonaDe(it.id)) return false;
      if (!t) return true;
      const z = zonaDe(it.id);
      return norm(`${it.label} ${it.sub ?? ""} ${z?.codigo ?? ""} ${z?.nombre ?? ""}`).includes(t);
    });
    // `zonaDe` deriva de asignaciones y zonas, ya en las dependencias.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, q, filtro, soloSinUbicar, asignaciones, zonaById]);

  const porKind = useMemo(
    () => ORDEN_KIND.map((k) => ({ kind: k, list: visibles.filter((i) => i.kind === k) })).filter((g) => g.list.length > 0),
    [visibles],
  );
  const cuentaKind = useMemo(() => {
    const m = new Map<ItemKind, number>();
    for (const it of items) m.set(it.kind, (m.get(it.kind) ?? 0) + 1);
    return m;
  }, [items]);
  const ubicados = useMemo(() => items.filter((it) => zonaDe(it.id)).length, [items, asignaciones, zonaById]); // eslint-disable-line react-hooks/exhaustive-deps

  const sinZonas = zonas.length === 0;

  return (
    <aside className="flex min-h-0 flex-col gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
      <div className="flex items-center justify-between gap-2">
        <CardTitle as="h3" className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
          <Boxes className="h-4 w-4 text-[var(--accent)]" /> Qué ubicar
        </CardTitle>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold tabular-nums ${
          ubicados === items.length && items.length > 0
            ? "bg-[var(--data-success-100)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]"
            : "bg-[var(--data-warning-100)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]"
        }`}>
          {ubicados}/{items.length} ubicados
        </span>
      </div>

      {sinZonas ? (
        <p className="rounded-xl border-2 border-dashed border-[var(--rule-base)] p-3 text-xs text-[var(--text-tertiary)]">
          Dibujá al menos una zona en el mapa para poder ubicar la madera adentro.
        </p>
      ) : enMano ? (
        <div className="flex items-center gap-2 rounded-xl border-2 border-[var(--accent)] bg-primary/10 px-2.5 py-2 dark:bg-[var(--accent)]/12">
          <MousePointer className="h-4 w-4 shrink-0 text-[var(--accent)]" />
          <span className="min-w-0 flex-1 text-xs font-bold text-[var(--text-primary)]">
            <span className="block truncate">{enMano.label}</span>
            <span className="block font-medium text-[var(--text-secondary)]">Tocá la zona del mapa donde está</span>
          </span>
          <button type="button" onClick={() => onEnMano(null)} aria-label="Soltar el ítem" className="shrink-0 rounded-lg p-1 text-[var(--text-tertiary)] hover:bg-[var(--surface-canvas)] hover:text-[var(--text-primary)]">
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <p className="text-[length:var(--ts-2xs)] leading-snug text-[var(--text-tertiary)]">
          Arrastrá al mapa, o tocá para tomar y después tocá la zona.
        </p>
      )}

      {/* Buscar + filtrar por tipo. */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar guía, especie o zona…"
          aria-label="Buscar qué ubicar"
          className="h-10 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] pl-8 pr-8 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none"
        />
        {q && (
          <button type="button" onClick={() => setQ("")} aria-label="Limpiar búsqueda" className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]">
            <XIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {([["todo", "Todo"], ...ORDEN_KIND.map((k) => [k, KIND_META[k].corto] as const)] as [ItemKind | "todo", string][]).map(([k, label]) => {
          const n = k === "todo" ? items.length : cuentaKind.get(k) ?? 0;
          if (k !== "todo" && n === 0) return null;
          return (
            <button
              key={k} type="button" onClick={() => setFiltro(k)} aria-pressed={filtro === k}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg border-2 px-2.5 text-xs font-bold transition ${
                filtro === k
                  ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                  : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"
              }`}
            >
              {label}<span className="tabular-nums opacity-80">{n}</span>
            </button>
          );
        })}
        <button
          type="button" onClick={() => setSoloSinUbicar((v) => !v)} aria-pressed={soloSinUbicar}
          title="Ver sólo lo que todavía no tiene lugar en el mapa"
          className={`inline-flex h-8 items-center gap-1.5 rounded-lg border-2 px-2.5 text-xs font-bold transition ${
            soloSinUbicar
              ? "border-[var(--data-warning-500)] bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]"
              : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"
          }`}
        >
          Sin ubicar<span className="tabular-nums opacity-80">{items.length - ubicados}</span>
        </button>
      </div>

      {/* La lista. Scrollea sola para que el mapa de al lado no se mueva. */}
      <ul className="-mr-1 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {porKind.length === 0 && (
          <li className="rounded-xl border-2 border-dashed border-[var(--rule-base)] p-4 text-center text-xs text-[var(--text-tertiary)]">
            {items.length === 0 ? "No hay madera disponible en el período." : "Nada coincide con eso."}
          </li>
        )}
        {porKind.map(({ kind, list }) => {
          const KI = KIND_META[kind].icon;
          return (
            <li key={kind}>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                  <KI className="h-3.5 w-3.5" />{KIND_META[kind].corto} · {list.length}
                </p>
                {!sinZonas && list.length > 1 && (
                  <select
                    value=""
                    disabled={ocupado != null}
                    onChange={(e) => { if (e.target.value) onUbicarLote(kind, e.target.value === "__none__" ? null : e.target.value); }}
                    title={`Ubicar los ${list.length} de este tipo en una zona`}
                    className="h-7 max-w-[9rem] rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-1.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)] outline-none focus:border-[var(--accent)] disabled:opacity-60"
                  >
                    <option value="">Todas en…</option>
                    {zonas.map((z) => <option key={z.id} value={z.id}>{z.codigo}</option>)}
                    <option value="__none__">— Quitar —</option>
                  </select>
                )}
              </div>
              <ul className="space-y-1.5">
                {list.map((it) => {
                  const z = zonaDe(it.id);
                  const enEste = enMano?.id === it.id;
                  const meta = z ? zonaTipoMeta(z.tipo) : null;
                  return (
                    <li
                      key={it.id}
                      draggable={!sinZonas}
                      onDragStart={(e) => {
                        e.dataTransfer.setData(DND_ITEM, it.id);
                        e.dataTransfer.effectAllowed = "move";
                        onEnMano(it);
                      }}
                      onDragEnd={() => onEnMano(null)}
                      onMouseEnter={() => onResaltar(z?.id ?? null)}
                      onMouseLeave={() => onResaltar(null)}
                      className={`rounded-xl border-2 px-2.5 py-2 transition ${
                        enEste
                          ? "border-[var(--accent)] bg-primary/10 dark:bg-[var(--accent)]/12"
                          : "border-[var(--rule-base)] bg-[var(--surface-sunken)] hover:border-[var(--accent)]"
                      } ${sinZonas ? "" : "cursor-grab active:cursor-grabbing"} ${ocupado === it.id ? "opacity-60" : ""}`}
                    >
                      <button
                        type="button"
                        disabled={sinZonas || ocupado != null}
                        onClick={() => onEnMano(enEste ? null : it)}
                        aria-pressed={enEste}
                        title={enEste ? "Soltar" : "Tomar para ubicarlo en una zona del mapa"}
                        className="flex w-full min-w-0 items-start gap-2 text-left disabled:cursor-default"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-x-1.5 text-sm">
                            <b className="text-[var(--text-primary)]">{it.label}</b>
                            {it.cites && <span className="rounded-full bg-[var(--data-error-100)] px-1.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]">CITES</span>}
                          </span>
                          {it.sub && <span className="block truncate text-xs text-[var(--text-tertiary)]">{it.sub}</span>}
                          <span className="font-mono text-xs font-bold text-[var(--text-secondary)]">{n2(it.cantidad)} {it.unidad}</span>
                        </span>
                      </button>
                      {/* Dónde está hoy: el chip lleva al mapa; la × lo saca de la zona. */}
                      <div className="mt-1 flex items-center gap-1">
                        {z && meta ? (
                          <>
                            <button
                              type="button"
                              onClick={() => onIrAZona(z.id)}
                              title={`Ir a ${z.codigo}${z.nombre ? ` · ${z.nombre}` : ""} en el mapa`}
                              className="inline-flex min-w-0 items-center gap-1 rounded-full border-2 border-[var(--rule-base)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"
                            >
                              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: meta.ring }} />
                              <span className="truncate">{z.codigo}</span>
                              <MapPin className="h-3 w-3 shrink-0" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onUbicar(it.id, null)}
                              disabled={ocupado != null}
                              aria-label={`Quitar ${it.label} de ${z.codigo}`}
                              className="rounded-md p-0.5 text-[var(--text-tertiary)] hover:bg-[var(--surface-canvas)] hover:text-[var(--data-error-500)] disabled:opacity-50"
                            >
                              <XIcon className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : (
                          <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">Sin ubicar</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
