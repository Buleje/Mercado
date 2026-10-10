"use client";

/**
 * PlantillasMeta — una meta lista para cada cosa que se puede medir, agrupada
 * por área («Vender S/ 30 000 al mes», «Cubicar 50 m³ al mes», «20 pedidos del
 * marketplace al mes»). Salen de `CATALOGO_METAS[*].plantilla`: no hay otra
 * lista que mantener. El clic abre el modal ya lleno; nada se guarda sin que
 * lo confirmes.
 *
 * Arranca con UNA por área (8 chips): las 21 juntas eran 32 botones en la
 * vista y pasaban el tope de la ley (25, `medir-orden-admin`). «Ver las 21 por área»
 * las abre agrupadas; con un área elegida en el filtro salen todas las suyas.
 */
import { useState, type CSSProperties } from "react";
import { AREAS_META, CATALOGO_METAS, areaDe, categoriasDelArea, type AreaMeta } from "@/lib/admin/metas-catalogo";
import type { CategoriaMeta, PeriodoMeta } from "@/lib/admin/metas-tareas";
import { claseChip } from "./clases-meta";

/** La que se propone primero en cada área (las del ejemplo de Brandon: vender, cubicar, pedidos del marketplace…). */
const DESTACADAS: readonly CategoriaMeta[] = ["ventas", "clientes", "caja", "gastos", "marketplace_pedidos", "cubicacion", "loth_tala", "tareas"];
const TOTAL = Object.values(CATALOGO_METAS).filter((c) => c.id !== "manual").length;

export interface PresetMeta {
  category: CategoriaMeta;
  period: PeriodoMeta;
  target?: number;
  name?: string;
}

export function PlantillasMeta({
  onElegir,
  area = "todas",
}: {
  onElegir: (preset: PresetMeta) => void;
  /** Sólo las de un área (el filtro de la cabecera). */
  area?: AreaMeta | "todas";
}) {
  const [todas, setTodas] = useState(false);
  const elegir = (id: CategoriaMeta) => {
    const c = CATALOGO_METAS[id];
    onElegir({ category: c.id, period: c.plantilla.period, target: c.plantilla.target, name: c.plantilla.name });
  };

  if (area === "todas" && !todas) {
    return (
      <div className="flex flex-wrap gap-2">
        {DESTACADAS.map((id) => {
          const a = areaDe(id);
          const Icono = a.icono;
          return (
            <button
              key={id}
              type="button"
              className={claseChip(false)}
              title={`${a.nombre}: ${CATALOGO_METAS[id].queMide}`}
              onClick={() => elegir(id)}
              style={{ "--area": a.color } as CSSProperties}
            >
              <Icono className="h-4 w-4 text-[var(--area)]" aria-hidden="true" />
              {CATALOGO_METAS[id].plantilla.name}
            </button>
          );
        })}
        <button
          type="button"
          aria-expanded="false"
          onClick={() => setTodas(true)}
          className="inline-flex min-h-10 items-center px-2 text-sm font-semibold text-[var(--accent-ink)] underline underline-offset-2 dark:text-[var(--accent)]"
        >
          Ver las {TOTAL} por área
        </button>
      </div>
    );
  }

  const areas = AREAS_META.filter((a) => a.id !== "manual" && (area === "todas" || a.id === area));
  if (areas.length === 0) {
    return <p className="text-sm text-[var(--text-secondary)]">Esta área no tiene plantillas: la meta a mano la creas con «Nueva meta».</p>;
  }
  return (
    <div className="space-y-3">
      {areas.map((a) => {
        const Icono = a.icono;
        return (
          <div key={a.id} className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3" style={{ "--area": a.color } as CSSProperties}>
            <span className="inline-flex shrink-0 items-center gap-1.5 pt-2.5 text-xs font-bold text-[var(--text-secondary)] sm:w-40">
              <Icono className="h-4 w-4 text-[var(--area)]" aria-hidden="true" />
              {a.nombre}
            </span>
            <div className="flex flex-wrap gap-2">
              {categoriasDelArea(a.id).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={claseChip(false)}
                  title={c.queMide}
                  onClick={() => elegir(c.id)}
                >
                  {c.plantilla.name}
                </button>
              ))}
            </div>
          </div>
        );
      })}
      {area === "todas" && (
        <button
          type="button"
          aria-expanded="true"
          onClick={() => setTodas(false)}
          className="inline-flex min-h-10 items-center px-2 text-sm font-semibold text-[var(--accent-ink)] underline underline-offset-2 dark:text-[var(--accent)]"
        >
          Ver menos
        </button>
      )}
    </div>
  );
}
