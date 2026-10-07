"use client";

/**
 * Borrar varios árboles del censo de una vez: los seleccionados en la tabla, o
 * todos («Borrar todos», el deshacer de una hoja mal importada). El servidor
 * conserva los talados —son el origen de la cadena de custodia— y la pantalla
 * dice cuántos quedaron y por qué.
 */

import { useState } from "react";
import { Trash2, X } from "@buleje/design-system/icons";
import { toast } from "sonner";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { csrfHeaders } from "@/lib/csrf-client";
import { formatNumber } from "@/lib/format";

type Seleccion = { ids: string[] } | { todos: true };

/** `null` si falló (ya avisó con un toast). */
async function borrarArboles(planId: string, sel: Seleccion): Promise<{ borrados: number; taladosConservados: number } | null> {
  try {
    const r = await fetch("/api/admin/forestal/plan/census", {
      method: "DELETE", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include",
      body: JSON.stringify({ planId, ...sel }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      toast.error(typeof j?.error === "string" ? j.error : `No se pudieron borrar los árboles (error ${r.status})`);
      return null;
    }
    return { borrados: Number(j.borrados ?? 0), taladosConservados: Number(j.taladosConservados ?? 0) };
  } catch (err) {
    console.warn("[LothCensoSeleccion] borrar árboles falló", err);
    toast.error("No se pudieron borrar los árboles — revisa tu conexión.");
    return null;
  }
}

function avisar(r: { borrados: number; taladosConservados: number }) {
  const n = formatNumber(r.borrados);
  const base = `${n} ${r.borrados === 1 ? "árbol borrado" : "árboles borrados"} del censo`;
  if (r.taladosConservados > 0) toast.success(`${base} · ${formatNumber(r.taladosConservados)} talados se conservaron (son el origen de la cadena)`);
  else toast.success(base);
}

/** Hook: confirma con la cifra, borra y avisa. */
export function useBorrarArboles(planId: string, onBorrado: () => void) {
  const { confirm } = useConfirm();
  const [borrando, setBorrando] = useState(false);
  async function borrar(sel: Seleccion, cuantos: number, etiqueta: string) {
    if (borrando || cuantos === 0) return;
    const ok = await confirm({
      title: `¿Borrar ${etiqueta}?`,
      description: "Los árboles en pie y descartados salen del censo y del POA. Los talados se conservan: son el origen de la cadena de custodia. No se puede deshacer.",
      intent: "danger",
      confirmLabel: `Sí, borrar ${formatNumber(cuantos)}`,
    });
    if (!ok) return;
    setBorrando(true);
    const r = await borrarArboles(planId, sel);
    setBorrando(false);
    if (!r) return;
    avisar(r);
    onBorrado();
  }
  return { borrar, borrando };
}

/** Botón de la cabecera del bloque: vacía el censo del plan entero. */
export function BotonBorrarTodos({ total, borrando, onBorrar }: { total: number; borrando: boolean; onBorrar: () => void }) {
  if (total === 0) return null;
  return (
    <button
      type="button"
      onClick={onBorrar}
      disabled={borrando}
      title="Borrar todos los árboles del censo (los talados se conservan)"
      aria-label="Borrar todos los árboles del censo"
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--data-error-100)] bg-[var(--surface-raised)] px-3 text-xs font-bold text-[var(--data-error-700)] hover:bg-[var(--data-error-50)] disabled:opacity-50 dark:border-[var(--data-error-500)]/40 dark:text-[var(--data-error-500)] dark:hover:bg-[var(--data-error-500)]/12"
    >
      <Trash2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Borrar todos</span>
    </button>
  );
}

/** Barra que aparece con al menos un árbol seleccionado. */
export function BarraSeleccion({ marcados, filtrados, borrando, onMarcarFiltrados, onLimpiar, onBorrar }: {
  marcados: number;
  /** Cuántos pasan el filtro (pueden ser más de los que se ven). */
  filtrados: number;
  borrando: boolean;
  onMarcarFiltrados: () => void;
  onLimpiar: () => void;
  onBorrar: () => void;
}) {
  if (marcados === 0) return null;
  return (
    <div role="region" aria-label="Árboles seleccionados" className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--data-error-100)] bg-[var(--data-error-50)] px-3 py-2 dark:border-[var(--data-error-500)]/40 dark:bg-[var(--data-error-500)]/10">
      <span className="text-sm font-bold text-[var(--text-primary)]">
        <span className="font-mono tabular-nums">{formatNumber(marcados)}</span> {marcados === 1 ? "seleccionado" : "seleccionados"}
      </span>
      {filtrados > marcados && (
        <button type="button" onClick={onMarcarFiltrados} className="h-9 rounded-lg px-2 text-sm font-semibold text-[var(--text-secondary)] underline-offset-2 hover:underline">
          Seleccionar los {formatNumber(filtrados)} del filtro
        </button>
      )}
      <span className="grow" />
      <button type="button" onClick={onLimpiar} className="inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">
        <X className="h-4 w-4" /> Quitar selección
      </button>
      <button
        type="button"
        onClick={onBorrar}
        disabled={borrando}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--data-error-600)] px-3 text-sm font-bold text-[var(--text-inverse)] hover:bg-[var(--data-error-700)] disabled:opacity-50"
      >
        <Trash2 className="h-4 w-4" /> Borrar {formatNumber(marcados)}
      </button>
    </div>
  );
}
