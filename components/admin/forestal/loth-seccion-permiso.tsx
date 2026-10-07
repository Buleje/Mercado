/**
 * «Permiso · titular» en las tablas de Secciones y el borrado de lo filtrado
 * (Brandon 07-10-2026: «escoger y eliminar los procesos… según lo escogido por
 * permiso o titular; que pueda filtrar y eliminar según lo escogido»).
 *
 * UNA columna compacta (el permiso arriba, el titular chico debajo) con DOS
 * autofiltros en su cabecera —Permiso y Titular—, y sólo cuando la sección
 * mezcla líneas de más de un plan (o sin plan): con el libro mirado por un
 * solo permiso la columna diría lo mismo en cada renglón y sólo ensancharía
 * una tabla que ya tiene 8-10 columnas.
 */

import { Eraser } from "@buleje/design-system/icons";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import { siglaDePlan } from "@/lib/forestal/loth-tipos-plan";
import { nombreDelPlan, type PlanTablero } from "@/lib/forestal/loth-tablero-permiso";
import { permisoDeLinea, type PermisoDeLinea } from "./loth-seccion-filtros";
import type { ColDef } from "./LothSeccionTabla";

/** `planId` → permiso y titular, de los planes vivos del libro. */
export function mapaDePermisos(planes: readonly PlanTablero[]): Map<string, PermisoDeLinea> {
  return new Map(
    planes.map((p) => [
      p.id,
      {
        permiso: `${siglaDePlan(p.planType)} ${p.planNumber ?? p.alias ?? "sin número"}`.trim(),
        titular: p.titularName?.trim() || nombreDelPlan(p),
      },
    ]),
  );
}

/** ¿La sección mezcla planes? Sólo entonces la columna dice algo que no se sabe. */
export function mezclaPlanes(lineas: readonly Pick<LothEntryDTO, "planId">[]): boolean {
  const vistos = new Set<string | null>();
  for (const e of lineas) {
    vistos.add(e.planId ?? null);
    if (vistos.size > 1) return true;
  }
  return false;
}

/** Las columnas de la sección con «Permiso · titular» detrás de la primera (la del código). */
export function conColumnaPermiso(cols: readonly ColDef[], planes: ReadonlyMap<string, PermisoDeLinea>): ColDef[] {
  const col: ColDef = {
    key: "permiso",
    label: "Permiso · titular",
    filtros: ["permiso", "titular"],
    render: (e) => {
      const p = permisoDeLinea(e.planId, planes);
      return (
        <span className="block max-w-56">
          <span className="block truncate font-semibold text-[var(--text-primary)]" title={p.permiso}>{p.permiso}</span>
          {p.titular !== p.permiso && (
            <span className="block truncate text-xs text-[var(--text-tertiary)]" title={p.titular}>{p.titular}</span>
          )}
        </span>
      );
    },
  };
  return [...cols.slice(0, 1), col, ...cols.slice(1)];
}

/**
 * «Borrar las N filtradas» del menú Opciones: sólo con algún filtro puesto
 * (de columna o el permiso del libro) y para admin/dueño. Pasa EXACTAMENTE las
 * líneas que deja el filtro, de todas las páginas.
 */
export function opcionBorrarFiltradas({
  filtradas,
  hayFiltro,
  puede,
  onBorrar,
}: {
  filtradas: readonly Pick<LothEntryDTO, "id">[];
  hayFiltro: boolean;
  puede: boolean;
  onBorrar: (ids: string[]) => void;
}): MenuAccion | null {
  if (!puede || !hayFiltro) return null;
  const n = filtradas.length;
  return {
    id: "borrar-filtradas",
    label: `Borrar las ${n} filtradas`,
    hint: "Las líneas que deja el filtro, de todas las páginas. Antes te dice qué se borra y qué se queda",
    icon: Eraser,
    tone: "danger",
    disabled: n === 0,
    onSelect: () => onBorrar(filtradas.map((e) => e.id)),
  };
}
