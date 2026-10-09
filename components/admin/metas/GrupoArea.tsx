"use client";

/**
 * GrupoArea — las metas de UN área (Ventas, Compras y gastos, Aserradero…),
 * con el icono y el color del área en el título del bloque. Sólo se dibuja si
 * el área tiene metas: un grupo vacío es ruido.
 *
 * Vive dentro de las COLUMNAS de `MetasVista` (no de una grilla por área): con
 * 12 metas en 9 áreas, una grilla de 3 por área dejaba 1-2 tarjetas por fila y
 * 3 200 px de alto con dos tercios en blanco (medido 09-10). El título viaja
 * pegado a la primera tarjeta (no queda huérfano al pie de una columna) y
 * cada tarjeta se mueve entera.
 */
import type { CSSProperties } from "react";
import { CardTitle } from "@buleje/design-system";
import type { AreaDef, AvanceMetaDTO } from "@/lib/admin/metas-catalogo";
import type { MetaDTO } from "@/lib/admin/metas-tareas";
import { TarjetaMeta } from "./TarjetaMeta";

export function GrupoArea({
  area,
  metas,
  avances,
  hoy,
  onEditar,
  onBorrar,
  sola = false,
}: {
  area: AreaDef;
  metas: MetaDTO[];
  avances: Map<string, AvanceMetaDTO>;
  hoy: string;
  onEditar: (meta: MetaDTO) => void;
  onBorrar: (meta: MetaDTO) => void;
  /** Es la única área en pantalla (filtro de área): grilla propia, sin columnas que la apilen en una sola. */
  sola?: boolean;
}) {
  const Icono = area.icono;
  const id = `metas-area-${area.id}`;
  const cumplidas = metas.filter((m) => avances.get(m.id)?.estado === "cumplida").length;
  const cabecera = (
    <div
      className="mb-2.5 flex items-center gap-2"
      style={{ "--area": area.color } as CSSProperties}
    >
      <span
        aria-hidden="true"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--area)_14%,transparent)] text-[var(--area)]"
      >
        <Icono className="h-4 w-4" />
      </span>
      <CardTitle id={id} className="text-sm font-bold">
        {area.nombre}
      </CardTitle>
      <span className="text-xs tabular-nums text-[var(--text-tertiary)]">
        {metas.length === 1 ? "1 meta" : `${metas.length} metas`}
        {cumplidas > 0 && ` · ${cumplidas} cumplida${cumplidas === 1 ? "" : "s"}`}
      </span>
    </div>
  );
  const tarjeta = (m: MetaDTO) => (
    <TarjetaMeta meta={m} avance={avances.get(m.id)} hoy={hoy} onEditar={onEditar} onBorrar={onBorrar} />
  );
  if (sola) {
    return (
      <section aria-labelledby={id} data-area={area.id}>
        {cabecera}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {metas.map((m) => (
            <div key={m.id} className="flex [&>article]:flex-1">
              {tarjeta(m)}
            </div>
          ))}
        </div>
      </section>
    );
  }
  /* Un área de 1-2 metas va entera a una columna; una más larga reparte sus
     tarjetas (cada una con su badge de área, así no se pierde de quién es). */
  return (
    <section
      aria-labelledby={id}
      data-area={area.id}
      className={`mb-6 last:mb-0 ${metas.length <= 2 ? "break-inside-avoid" : ""}`}
    >
      {metas.map((m, i) => (
        <div key={m.id} className={`break-inside-avoid ${i > 0 ? "mt-3" : ""}`}>
          {i === 0 && cabecera}
          {tarjeta(m)}
        </div>
      ))}
    </section>
  );
}
