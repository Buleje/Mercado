"use client";

/**
 * ¿El titular de esta guía ya está en el Directorio? (alta de ingreso,
 * Brandon 2026-09-25: «proveedor del directorio… que quede enlazado a su
 * ficha»).
 *
 * En «Desde SERFOR» el proveedor lo fija la guía —no se elige de la lista:
 * manda el documento—, así que esto no cambia nada del ingreso. Dice si la
 * ficha existe y cómo se la encuentra:
 *   · por RUC: enlazada. La ficha del proveedor ya busca sus guías también por
 *     documento, así que aparece en su historial aunque la guía escriba el
 *     nombre distinto («COMUNIDAD NATIVA …» vs «COMUNIDAD …»);
 *   · sólo por nombre: parecida — conviene cargarle el RUC a la ficha;
 *   · ninguna: se ofrece agregarla, con el nombre y el RUC de la guía.
 */

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Loader2, Plus } from "@buleje/design-system/icons";
import { parteDelTitular, normalizarDocumento, type Parte } from "@/lib/forestal/directorio";

export default function CtpProveedorEnDirectorio({
  nombre,
  documento,
  partes,
  onAgregar,
  onEnlazada,
}: {
  nombre: string;
  documento: string | null;
  /** Las fichas con rol «proveedor» del Directorio. */
  partes: Parte[];
  /** Guarda al titular como proveedor en el Directorio. */
  onAgregar: () => Promise<void>;
  /** La ficha ENLAZADA por documento (o null): para marcar su uso al registrar.
   *  Un «parecido» por nombre no cuenta como uso de esa ficha. */
  onEnlazada?: (parte: Parte | null) => void;
}) {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titular = nombre.trim();
  const hallada = useMemo(
    () => (titular ? parteDelTitular(partes, { nombre: titular, documento }) : null),
    [partes, titular, documento],
  );
  const enlazada = hallada?.por === "documento" ? hallada.parte : null;
  const idHallada = enlazada?.id ?? null;
  // Avisar la ficha enlazada es un efecto, no parte del render. Con null se
  // suelta la de la guía anterior.
  useEffect(() => {
    onEnlazada?.(enlazada);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sólo cuando cambia la ficha hallada
  }, [idHallada]);
  if (!titular) return null;
  const doc = normalizarDocumento(documento ?? "");

  if (hallada?.por === "documento") {
    const mismoNombre = hallada.parte.nombre.trim().toLowerCase() === titular.toLowerCase();
    return (
      <p className="flex items-start gap-2 rounded-xl bg-[var(--data-success-500)]/10 px-3.5 py-2.5 text-sm text-[var(--text-primary)]">
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" aria-hidden />
        <span className="min-w-0">
          <span className="font-semibold">En tu directorio</span>
          {mismoNombre ? "" : <> como «{hallada.parte.nombre}»</>} · enlazado por su RUC {doc}
          {!mismoNombre && (
            <span className="block text-xs text-[var(--text-secondary)]">
              La guía lo escribe «{titular}»: la ficha igual encuentra esta guía por el RUC.
            </span>
          )}
        </span>
      </p>
    );
  }

  if (hallada?.por === "nombre") {
    return (
      <p className="flex items-start gap-2 rounded-xl bg-[var(--data-warning-500)]/10 px-3.5 py-2.5 text-sm text-[var(--text-primary)]">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" aria-hidden />
        <span className="min-w-0">
          <span className="font-semibold">Parecido a «{hallada.parte.nombre}»</span> de tu directorio
          <span className="block text-xs text-[var(--text-secondary)]">
            {hallada.parte.docNumero
              ? `Su ficha tiene otro documento (${hallada.parte.docNumero}); la guía dice ${doc || "sin documento"}.`
              : `Su ficha no tiene RUC: cárgale ${doc || "el documento"} para que quede enlazada.`}
          </span>
        </span>
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-dashed border-[var(--rule-base)] px-3.5 py-2.5 text-sm">
      <span className="min-w-0 flex-1 text-[var(--text-secondary)]">
        <span className="font-semibold text-[var(--text-primary)]">{titular}</span> no está en tu directorio
      </span>
      <button
        type="button"
        disabled={guardando}
        onClick={async () => {
          setGuardando(true);
          setError(null);
          try {
            await onAgregar();
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setGuardando(false);
          }
        }}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-3 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] disabled:opacity-50"
      >
        {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
        Agregarlo como proveedor
      </button>
      {error && <span className="w-full text-xs text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</span>}
    </div>
  );
}
