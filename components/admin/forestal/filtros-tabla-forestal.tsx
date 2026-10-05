"use client";

/**
 * filtros-tabla-forestal — el autofiltro de Excel para las tablas del módulo
 * forestal que se cargan ENTERAS en el cliente (Brandon, 2026-10-05: «en todas
 * las tablas cada columna tiene que tener su filtro»).
 *
 * Envuelve `useFiltrosDeColumna` (shared/filtros-columna) y agrega lo que ese
 * primitivo no trae para una tabla local:
 *   · columnas «texto» = búsqueda por fragmento (un código se tipea, no se
 *     elige de una lista de 80), que el primitivo sólo resuelve en servidor;
 *   · los controles de CADA columna también en mobile: a <640 px el `<thead>`
 *     desaparece (`.admin-mobile-cards`), así que ahí los filtros viven en un
 *     «Filtros por columna» plegable; los chips con cruz van a todos los anchos.
 *
 * Una tabla paginada por el SERVIDOR no debe usar esto: filtraría sólo la
 * página y la tabla mentiría.
 */

import { useCallback, useMemo, useState } from "react";
import {
  ChipsDeFiltros,
  FiltroColumnaMulti,
  FiltroColumnaRango,
  FiltroColumnaTexto,
  useFiltrosDeColumna,
  type ChipFiltro,
  type ColumnaFiltro,
  type Rango,
  type UseFiltrosDeColumnaResult,
} from "@/components/admin/shared/filtros-columna";

export type { ColumnaFiltro } from "@/components/admin/shared/filtros-columna";

export interface FiltrosTabla<T> extends UseFiltrosDeColumnaResult<T> {
  columnas: readonly ColumnaFiltro<T>[];
  textos: Record<string, string>;
  setTexto: (id: string, v: string) => void;
  /** Quita el filtro de una columna (texto, lista o rango). */
  quitar: (id: string) => void;
  /** Filas antes de filtrar (para «N de M»). */
  total: number;
}

/** Minúsculas sin tildes: «Pucallpa» y «pucallpá» son la misma búsqueda. */
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function listaDe(v: string | readonly string[] | null | undefined): string[] {
  if (v == null) return [];
  return typeof v === "string" ? [v] : [...v];
}

/** `columnas` tiene que ser estable (constante de módulo o `useMemo`). */
export function useFiltrosTabla<T>(filas: readonly T[], columnas: readonly ColumnaFiltro<T>[]): FiltrosTabla<T> {
  const [textos, setTextos] = useState<Record<string, string>>({});

  const base = useMemo(() => {
    const conTexto = columnas.filter((c) => c.tipo === "texto" && textos[c.id]);
    if (conTexto.length === 0) return filas;
    return filas.filter((f) =>
      conTexto.every((c) => {
        const q = norm(textos[c.id]);
        return listaDe(c.valor?.(f)).some((x) => norm(x).includes(q));
      }),
    );
  }, [filas, columnas, textos]);

  const h = useFiltrosDeColumna(base, columnas);

  const setTexto = useCallback((id: string, v: string) => {
    setTextos((prev) => {
      const limpio = v.trim();
      if (!limpio) {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: limpio };
    });
  }, []);

  const { setFaceta, limpiar: limpiarFacetas } = h;
  const quitar = useCallback(
    (id: string) => {
      if (id in textos) setTexto(id, "");
      else setFaceta(id, undefined);
    },
    [textos, setTexto, setFaceta],
  );
  const limpiar = useCallback(() => {
    limpiarFacetas();
    setTextos({});
  }, [limpiarFacetas]);

  const chips = useMemo<ChipFiltro[]>(() => {
    const deTexto = columnas
      .filter((c) => c.tipo === "texto" && textos[c.id])
      .map((c) => ({ id: c.id, label: c.label, texto: `${c.label}: «${textos[c.id]}»` }));
    return [...deTexto, ...h.chips];
  }, [columnas, textos, h.chips]);

  return {
    ...h,
    columnas,
    textos,
    setTexto,
    quitar,
    limpiar,
    chips,
    activos: h.activos + Object.keys(textos).length,
    total: filas.length,
  };
}

function Control<T>({ c, f }: { c: ColumnaFiltro<T>; f: FiltrosTabla<T> }) {
  if (c.tipo === "texto") {
    return <FiltroColumnaTexto label={c.label} value={f.textos[c.id]} onChange={(v) => f.setTexto(c.id, v)} />;
  }
  if (c.tipo === "multi") {
    return (
      <FiltroColumnaMulti
        label={c.label}
        value={f.facetas[c.id] as string[] | undefined}
        options={f.opciones[c.id] ?? []}
        onChange={(v) => f.setFaceta(c.id, v.length > 0 ? v : undefined)}
      />
    );
  }
  return (
    <FiltroColumnaRango
      label={c.label}
      unidad={c.unidad}
      paso={c.paso}
      esFecha={c.tipo === "fecha"}
      valor={f.facetas[c.id] as Rango<number> | Rango<string> | undefined}
      onChange={(r) => f.setFaceta(c.id, r)}
    />
  );
}

/** El control de UNA columna, para montar dentro de su `<th>` (el `<thead>`
 *  necesita `align-top`). No dibuja nada si la columna no lo pide. */
export function FiltroEnCabecera<T>({ id, f }: { id: string; f: FiltrosTabla<T> }) {
  const c = f.columnas.find((x) => x.id === id);
  if (!c || !f.enCabecera[c.id] || !f.conAutofiltro[c.id]) return null;
  return <Control c={c} f={f} />;
}

/** Arriba de la tabla: «Filtros por columna» (sólo mobile, donde no hay
 *  `<thead>`), los chips con cruz y el «N de M». */
export function BarraFiltrosTabla<T>({ f, className = "" }: { f: FiltrosTabla<T>; className?: string }) {
  const conControl = f.columnas.filter((c) => f.conAutofiltro[c.id]);
  if (conControl.length === 0) return null;
  return (
    <div className={`space-y-2 ${className}`}>
      <details className="sm:hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2">
        <summary className="cursor-pointer text-sm font-bold text-[var(--text-primary)]">
          Filtros por columna{f.activos > 0 ? ` (${f.activos})` : ""}
        </summary>
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
          {conControl.map((c) => (
            <div key={c.id} className="min-w-0">
              <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                {c.label}
              </span>
              <Control c={c} f={f} />
            </div>
          ))}
        </div>
      </details>
      <ChipsDeFiltros chips={f.chips} onQuitar={f.quitar} onLimpiarTodo={f.limpiar} />
      {f.activos > 0 && (
        <p className="text-sm text-[var(--text-tertiary)]" aria-live="polite" data-testid="filtros-conteo">
          Mostrando {f.filtradas.length} de {f.total}
        </p>
      )}
    </div>
  );
}

/** Fila para cuando los filtros dejan la tabla en cero. */
export function SinCoincidenciasFila({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-6 text-center text-sm text-[var(--text-tertiary)]">
        Ninguna fila coincide con los filtros de columna.
      </td>
    </tr>
  );
}
