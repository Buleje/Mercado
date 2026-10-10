"use client";

/**
 * La barra del cuadro «Sección 2 · Consumos»: buscar, especie, permiso y guía,
 * DENTRO del marco del cuadro que filtran (ADR-360/431; 2026-09-24 se mudó
 * adentro, y «Opciones» subió al encabezado del cuadro, como en el Patio).
 *
 * El permiso vivía sólo dentro del panel de KPIs: ahora está acá con los demás,
 * y «Limpiar» lo limpia también (antes lo dejaba puesto y el texto de ayuda
 * prometía «todo el período»).
 */

import { useId, useMemo } from "react";
import { BarChart3, Download, Layers, Search, X } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import type { AgrupacionConsumo } from "@/lib/forestal/loctp-consumos-analisis";
import { formatNumber } from "@/lib/format";
import { CampoDeFiltro } from "./ctp-filtros-panel";
import type { EstadoConsumosSeccion2 } from "./hooks/use-consumos-seccion2";

/** Las lecturas del cuadro. El botón muestra la activa sin abrirlo. */
export const ETIQUETA_AGRUPAR: Record<AgrupacionConsumo, string> = {
  ninguna: "Sin agrupar",
  especie: "Por especie",
  guia: "Por guía",
  corrida: "Por corrida",
  permiso: "Por N° de permiso",
};

const CAMPO =
  "h-12 w-full rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-3 text-sm text-[var(--text-primary)] transition-colors focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";
const ROTULO = "text-sm font-bold text-[var(--text-secondary)]";

/** Rótulo visible arriba de un campo: el placeholder no es un rótulo (WCAG 3.3.2). */
function ConRotulo({ texto, children }: { texto: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className={ROTULO} aria-hidden>
        {texto}
      </span>
      {children}
    </div>
  );
}

/** «Opciones» del cuadro: cómo leerlo y qué llevarse, en un solo botón (ADR-360). */
export function CtpConsumosSeccion2Opciones({
  s2,
  onResumenPermiso,
}: {
  s2: EstadoConsumosSeccion2;
  /** Abre el modal de lo que ENTRÓ por permiso. */
  onResumenPermiso: () => void;
}) {
  const { agrupar, setAgrupar, visibles, descargarCsv, limpiar, cuantosFiltros } = s2;

  const acciones: MenuAccion[] = useMemo(() => {
    const lista: MenuAccion[] = (Object.keys(ETIQUETA_AGRUPAR) as AgrupacionConsumo[]).map((clave) => ({
      id: `agrupar-${clave}`,
      label: ETIQUETA_AGRUPAR[clave],
      hint: clave === "ninguna" ? "Una fila por consumo" : "Subtotal arriba, el detalle se despliega",
      icon: Layers,
      activo: agrupar === clave,
      onSelect: () => setAgrupar(clave),
    }));
    lista.push({
      id: "resumen-permiso",
      label: "Resumen de lo que entró por permiso",
      hint: "Especie, piezas, m³ y pt de un N° de permiso — y distribuir su rolliza",
      icon: BarChart3,
      tone: "dark",
      onSelect: onResumenPermiso,
    });
    lista.push({
      id: "descargar",
      label: "Descargar CSV",
      hint: `${visibles.length === 1 ? "El consumo" : `Los ${formatNumber(visibles.length)} consumos`} de este filtro`,
      icon: Download,
      disabled: visibles.length === 0,
      onSelect: descargarCsv,
    });
    if (cuantosFiltros > 0) {
      lista.push({
        id: "limpiar",
        label: "Limpiar el filtro",
        hint: "Volver a ver los consumos de todo el período",
        icon: X,
        onSelect: limpiar,
      });
    }
    return lista;
  }, [agrupar, setAgrupar, visibles.length, descargarCsv, cuantosFiltros, limpiar, onResumenPermiso]);

  return (
    <ActionMenu
      label={agrupar === "ninguna" ? "Opciones" : `Opciones · ${ETIQUETA_AGRUPAR[agrupar]}`}
      title="Agrupar el cuadro, descargarlo o limpiar el filtro"
      actions={acciones}
      size="sm"
    />
  );
}

export default function CtpConsumosSeccion2Barra({ s2 }: { s2: EstadoConsumosSeccion2 }) {
  const idBuscar = useId();
  const { filtro, set, opciones } = s2;

  /* Especie y permiso se filtran desde su columna del cuadro (2026-09-24).
     Afuera queda lo que no tiene columna: el texto y la guía de ingreso (la
     GTF sólo aparece dentro de las observaciones). */
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex min-w-[min(100%,16rem)] flex-1 flex-col gap-1">
        <label htmlFor={idBuscar} className={ROTULO}>
          Buscar en los consumos
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]"
            aria-hidden
          />
          <input
            id={idBuscar}
            type="search"
            value={filtro.texto}
            onChange={(e) => set.texto(e.target.value)}
            placeholder="Guía, especie, código…"
            className={CAMPO}
          />
        </div>
      </div>
      {/* Dos o más valores por campo (Brandon, 2026-09-10). */}
      <div className="w-full sm:w-64">
        <ConRotulo texto="Guía de ingreso">
          <CampoDeFiltro
            label="Guía de ingreso"
            value={filtro.gtf}
            options={opciones.gtf.map((g) => ({ value: g }))}
            onChange={set.gtf}
            placeholder="Todas las guías"
          />
        </ConRotulo>
      </div>
    </div>
  );
}
