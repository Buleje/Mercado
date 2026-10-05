"use client";

/**
 * La cabecera de la ficha de una troza: lo que se pregunta primero frente al
 * tronco. El código grande, su estado (el mismo chip y punto que la tabla), la
 * especie común y científica, cuántos días lleva parada y dónde está su
 * carga. A la derecha, ‹ › para pasar a la vecina de la lista y la X.
 *
 * Es `CabeceraPropia`: sigue siendo el asa para mover la ventana.
 */

import { ChevronLeft, ChevronRight, Clock, MapPin, X } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { CabeceraPropia } from "@/components/admin/shared/AdminModal";
import type { DiasDeLaPieza } from "@/lib/forestal/troza-ficha-recorrido";
import type { EstadoTroza } from "@/lib/forestal/trozas-patio";
import { ChipEstado } from "./ctp-troza-ficha-partes";

const BOTON_ICONO =
  "grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:pointer-events-none disabled:opacity-35 sm:h-9 sm:w-9";

export interface CabeceraDeFichaProps {
  /** `null` mientras se lee la pieza: va un hueco con la forma del código. */
  codigo: string | null;
  /** `null` mientras se lee la pieza. */
  estado: EstadoTroza | null;
  especieComun: string | null;
  especieCientifica: string | null;
  dias: DiasDeLaPieza | null;
  cancha: string | null;
  vecinos?: { anterior?: string | null; siguiente?: string | null };
  onNavegar?: (id: string) => void;
  onClose: () => void;
}

export function CabeceraDeFicha({
  codigo, estado, especieComun, especieCientifica, dias, cancha, vecinos, onNavegar, onClose,
}: CabeceraDeFichaProps) {
  const navegable = Boolean(onNavegar && (vecinos?.anterior || vecinos?.siguiente));
  return (
    <CabeceraPropia
      className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 py-4 sm:px-6"
      acciones={
        <>
          {navegable && (
            <>
              <button
                type="button"
                className={BOTON_ICONO}
                disabled={!vecinos?.anterior}
                onClick={() => vecinos?.anterior && onNavegar?.(vecinos.anterior)}
                aria-label="Troza anterior"
                title="Troza anterior (←)"
              >
                <ChevronLeft className="h-5 w-5" aria-hidden />
              </button>
              <button
                type="button"
                className={BOTON_ICONO}
                disabled={!vecinos?.siguiente}
                onClick={() => vecinos?.siguiente && onNavegar?.(vecinos.siguiente)}
                aria-label="Troza siguiente"
                title="Troza siguiente (→)"
              >
                <ChevronRight className="h-5 w-5" aria-hidden />
              </button>
            </>
          )}
          <button type="button" onClick={onClose} aria-label="Cerrar" className={BOTON_ICONO}>
            <X className="h-5 w-5 sm:h-4 sm:w-4" aria-hidden />
          </button>
        </>
      }
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <CardTitle as="h2" className="break-all font-mono text-xl font-bold tracking-tight sm:text-2xl">
            {codigo ?? (
              <>
                <span className="sr-only">Buscando la troza…</span>
                <span aria-hidden className="block h-7 w-44 animate-pulse rounded-lg bg-[var(--surface-sunken)]" />
              </>
            )}
          </CardTitle>
          {estado && <ChipEstado estado={estado} />}
        </div>
        {(especieComun || especieCientifica) && (
          <p className="mt-0.5 text-sm text-[var(--text-primary)]">
            <span className="font-semibold">{especieComun ?? "Sin especie"}</span>
            {especieCientifica && <i className="text-[var(--text-secondary)]"> · {especieCientifica}</i>}
          </p>
        )}
        {(dias || cancha) && (
          <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
            {dias && (
              <span className="inline-flex items-center gap-1" title={dias.desdeElAsiento ? "No tiene fecha de recepción propia: se cuenta desde el asiento de su guía" : undefined}>
                <Clock className="h-3.5 w-3.5" aria-hidden />
                <span className="font-semibold text-[var(--text-primary)]">{dias.texto}</span>
              </span>
            )}
            {cancha && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" aria-hidden />
                Su carga: <span className="font-semibold text-[var(--text-primary)]">{cancha}</span>
              </span>
            )}
          </p>
        )}
      </div>
    </CabeceraPropia>
  );
}
