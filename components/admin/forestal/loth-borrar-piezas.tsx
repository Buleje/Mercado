"use client";

/**
 * Piezas compartidas de los dos borrados en bloque del Libro TH: el del plan
 * (Opciones › «Borrar operaciones del plan») y el de lo elegido en
 * «Secciones» (casillas o filtro). Misma confirmación (escribir BORRAR), mismo
 * botón rojo y el mismo aviso final con lo borrado y lo que se quedó.
 */

import { toast } from "sonner";
import { Loader2, Trash2 } from "@buleje/design-system/icons";
import { formatNumber } from "@/lib/format";
import type { LothSection } from "@/lib/forestal/loth-constants";
import { textoDelSalto, type MotivoSalto, type SaltoBorrar } from "@/lib/forestal/loth-borrar-del-plan";
import { SECTION_META } from "./LothEntryForm";

export const PALABRA_BORRAR = "BORRAR";
export const confirmaBorrar = (s: string) => s.trim().toUpperCase() === PALABRA_BORRAR;
export const pluralN = (n: number, uno: string, varios: string) => `${formatNumber(n)} ${n === 1 ? uno : varios}`;
export const nombreSeccion = (s: LothSection) => SECTION_META[s]?.label ?? s;

/** «Escribe BORRAR para confirmar». */
export function ConfirmarBorrar({ id, valor, onChange }: { id: string; valor: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold text-[var(--text-primary)]">
        Escribe <b className="font-mono text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{PALABRA_BORRAR}</b> para confirmar
      </label>
      <input
        id={id}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        className="h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 font-mono text-sm text-[var(--text-primary)] focus:border-[var(--data-error-500)] focus:outline-none dark:bg-[var(--surface-raised)]"
      />
    </div>
  );
}

/** Cancelar + el botón rojo «Borrar N operaciones». */
export function BotonesBorrar({
  busy,
  habilitado,
  n,
  onCancelar,
  onBorrar,
}: {
  busy: boolean;
  habilitado: boolean;
  n: number;
  onCancelar: () => void;
  onBorrar: () => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onCancelar}
        disabled={busy}
        className="h-11 rounded-xl px-4 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
      >
        Cancelar
      </button>
      <button
        type="button"
        onClick={onBorrar}
        disabled={busy || !habilitado || n === 0}
        className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--data-error-600)] px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
        {n > 0 ? `Borrar ${pluralN(n, "operación", "operaciones")}` : "Borrar"}
      </button>
    </>
  );
}

/** El aviso final: lo borrado (y los árboles que volvieron) y, aparte, lo que se quedó con su motivo. */
export function avisarBorrado(
  r: { borradas: number; m3: number; arbolesLiberados: number; saltadas: SaltoBorrar[] },
  textos?: Record<MotivoSalto, string>,
): void {
  const saltos = r.saltadas.map((s) => textoDelSalto(s, nombreSeccion, textos));
  const liberados = r.arbolesLiberados > 0 ? ` ${pluralN(r.arbolesLiberados, "árbol volvió", "árboles volvieron")} a «en pie» en el censo.` : "";
  const titulo = r.borradas > 0
    ? `Se ${r.borradas === 1 ? "borró" : "borraron"} ${pluralN(r.borradas, "operación", "operaciones")} (${formatNumber(r.m3, 2)} m³).${liberados}`
    : "No se borró ninguna operación.";
  if (saltos.length > 0) toast.warning(titulo, { description: saltos.join(" · "), duration: 12_000 });
  else toast.success(titulo);
}
