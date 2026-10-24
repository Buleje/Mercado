"use client";

/**
 * PlantillasMeta — una meta lista para cada cosa que se puede medir («Vender
 * S/ 30 000 al mes», «Cubicar 50 m³ al mes»…). Salen de
 * `CATALOGO_METAS[*].plantilla`: no hay otra lista que mantener. El clic abre
 * el modal ya lleno; nada se guarda sin que lo confirmes.
 *
 * Dos formas, nunca juntas en la misma pantalla:
 *  · `MenuPlantillas`: las 21 en un menú agrupado por área (la cabecera, con
 *    metas ya puestas). Antes eran 8 chips + «Ver las 21 por área» + una
 *    opción de «Más acciones» que abría el mismo panel: tres caminos a la
 *    misma lista y una fila entera de chips.
 *  · `PlantillasDestacadas`: con la vista vacía, una por área en chips de
 *    48 px (lo más rápido para empezar) y el menú con todas al final.
 */
import type { CSSProperties } from "react";
import { Sparkles } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { AREAS_META, CATALOGO_METAS, areaDe, categoriasDelArea } from "@/lib/admin/metas-catalogo";
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

function presetDe(id: CategoriaMeta): PresetMeta {
  const c = CATALOGO_METAS[id];
  return { category: c.id, period: c.plantilla.period, target: c.plantilla.target, name: c.plantilla.name };
}

/** Las 21 plantillas, agrupadas por área con su título de sección. */
export function MenuPlantillas({
  onElegir,
  etiqueta = "Plantillas",
  className,
}: {
  onElegir: (preset: PresetMeta) => void;
  etiqueta?: string;
  className?: string;
}) {
  const acciones: MenuAccion[] = AREAS_META.filter((a) => a.id !== "manual").flatMap((a) =>
    categoriasDelArea(a.id).map((c) => ({
      id: c.id,
      label: c.plantilla.name,
      icon: a.icono,
      seccion: a.nombre,
      onSelect: () => onElegir(presetDe(c.id)),
    })),
  );
  return (
    <ActionMenu
      label={etiqueta}
      title={`Una meta lista para cada cosa que se puede medir (${TOTAL})`}
      icon={Sparkles}
      size="md"
      compactoEnMovil
      className={className}
      actions={acciones}
    />
  );
}

/** La vista vacía: una por área en chips de 48 px y, al final, el menú con todas. */
export function PlantillasDestacadas({ onElegir }: { onElegir: (preset: PresetMeta) => void }) {
  return (
    <div role="group" aria-label="Metas listas para empezar" className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold text-[var(--text-secondary)]">Empieza con una:</span>
      {DESTACADAS.map((id) => {
        const a = areaDe(id);
        const Icono = a.icono;
        return (
          <button
            key={id}
            type="button"
            className={claseChip(false)}
            title={`${a.nombre}: ${CATALOGO_METAS[id].queMide}`}
            onClick={() => onElegir(presetDe(id))}
            style={{ "--area": a.color } as CSSProperties}
          >
            <Icono className="h-4 w-4 text-[var(--area)]" aria-hidden="true" />
            {CATALOGO_METAS[id].plantilla.name}
          </button>
        );
      })}
      <MenuPlantillas onElegir={onElegir} etiqueta={`Ver las ${TOTAL}`} />
    </div>
  );
}
