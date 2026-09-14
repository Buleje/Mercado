"use client";

/**
 * CtpDuenoSugeridos — «Proveedores de tus guías que aún no están en el
 * directorio», dentro del selector de dueño del cobro (ADR-412 + ADR-357).
 *
 * El descubrimiento de contactos (`CtpDirectorioDesdeGuias`) ya existe, pero
 * sólo se ve si el operador entra a Gestión → Directorio y aprieta "Buscar en
 * las guías" — un gesto extra que en el tenant real nadie hizo (evidencia:
 * `ForestParty.usos = 0` en las tres partes cargadas a mano). Esto lo pone en
 * el momento en que hace falta: eligiendo a quién se le asierra.
 */

import { useEffect } from "react";
import { AlertTriangle, Loader2, Plus } from "@buleje/design-system/icons";
import type { CandidatoParte, ConflictoDirectorio } from "@/lib/forestal/directorio-desde-guias";

/** Cuántos se muestran de entrada: el selector es angosto, no una lista larga. */
const TOPE_VISIBLE = 5;

export default function CtpDuenoSugeridos({
  abierto,
  candidatos,
  conflictos,
  cargando,
  error,
  guardando,
  onCargar,
  onAgregar,
}: {
  /** El selector de dueño ya está desplegado — recién ahí vale la pena pedirlo. */
  abierto: boolean;
  candidatos: CandidatoParte[];
  conflictos: ConflictoDirectorio[];
  cargando: boolean;
  error: string | null;
  /** La clave del candidato que se está guardando, para deshabilitar SU botón. */
  guardando: string | null;
  onCargar: () => void;
  onAgregar: (c: CandidatoParte) => void;
}) {
  useEffect(() => {
    if (abierto) onCargar();
    // Se pide una sola vez por instancia (el hook lo protege): re-disparar en
    // cada apertura no cuesta nada extra.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  if (!abierto) return null;
  if (cargando) {
    return (
      <p className="flex items-center gap-1.5 px-2.5 py-2 text-xs text-[var(--text-tertiary)]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Buscando en tus guías…
      </p>
    );
  }
  if (error) {
    return (
      <p className="px-2.5 py-2 text-xs font-medium text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
        {error}
      </p>
    );
  }
  if (candidatos.length === 0) return null;

  const conflictoDe = new Map(conflictos.map((c) => [c.candidato.clave, c.parte]));

  return (
    <div className="mt-1 border-t border-[var(--rule-base)] pt-1.5">
      <p className="px-2.5 pb-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
        Proveedores de tus guías que aún no están en el directorio
      </p>
      <ul className="space-y-0.5">
        {candidatos.slice(0, TOPE_VISIBLE).map((c) => {
          const enConflicto = conflictoDe.get(c.clave);
          return (
            <li key={c.clave} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5">
              <div className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-[var(--text-primary)]">{c.nombre}</span>
                <span className="block text-xs text-[var(--text-tertiary)]">
                  en {c.guias} guía{c.guias === 1 ? "" : "s"}
                  {c.docNumero ? ` · ${c.docTipo ?? "Doc"} ${c.docNumero}` : " · sin documento"}
                </span>
                {c.otrosNombres?.length ? (
                  <span className="flex items-start gap-1 text-xs font-medium text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                    Revisar: el mismo documento también aparece como «{c.otrosNombres.join(", ")}».
                  </span>
                ) : null}
                {enConflicto ? (
                  <span className="flex items-start gap-1 text-xs font-medium text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                    Revisar: ya existe «{enConflicto.nombre}» con otro documento.
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAgregar(c);
                }}
                disabled={guardando === c.clave}
                className="flex h-8 shrink-0 items-center gap-1 rounded-lg border border-[var(--rule-base)] px-2 text-xs font-semibold text-[var(--text-secondary)] hover:border-[var(--accent)]"
              >
                {guardando === c.clave ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                )}
                Agregar y elegir
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
