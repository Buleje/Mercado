"use client";

/**
 * La barra de las guías tildadas en Ingresos: UN tilde, varias acciones.
 *
 * Brandon (2026-09-26): «seleccionar varias guías y recepcionarlas con la misma
 * fecha». La tabla ya tenía tildes, pero de asientos pendientes y con la barra
 * genérica (`BulkActionsBar`): contaba ASIENTOS («3 de 5 seleccionados» eran dos
 * guías), su «Recepcionar» mandaba sin fecha y sólo salía en la bandeja. Acá se
 * cuenta en guías —el papel que el operador eligió— y «Recepcionar
 * seleccionadas» abre el bloque (`CtpRecepcionBloqueModal`) ya marcado, con sus
 * avisos de ADR-434. Validar y rechazar siguen siendo de los asientos pendientes.
 */

import { CheckSquare, PackageCheck, Square, ThumbsDown, ThumbsUp, X } from "@buleje/design-system/icons";
import type { GuiaIngreso } from "@/lib/forestal/ingresos-por-guia";
import { guiaTildada, tildadasParaRecibir, tildeDeGuia } from "@/lib/forestal/recepcion-bloque";
import type { WoodEntry } from "./ctp-shared";

const BOTON =
  "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40";

export default function CtpGuiasSeleccionBarra({
  guias,
  selectedIds,
  busy,
  onSeleccionarTodas,
  onLimpiar,
  onRecepcionar,
  onValidar,
  onRechazar,
}: {
  /** Las guías EN PANTALLA: sólo se cuenta y se actúa sobre lo que se ve. */
  guias: readonly GuiaIngreso<WoodEntry>[];
  selectedIds: readonly string[];
  busy: boolean;
  /** Tilda los asientos de estas guías (las tildables en pantalla). */
  onSeleccionarTodas: (ids: string[]) => void;
  onLimpiar: () => void;
  /** Abre el bloque con estas guías ya marcadas. */
  onRecepcionar: (claves: string[]) => void;
  /** Valida estos asientos pendientes. */
  onValidar: (ids: string[]) => void;
  /** Pide el motivo del rechazo (los pendientes elegidos). */
  onRechazar: () => void;
}) {
  const tildables = guias.filter((g) => tildeDeGuia(g).ids.length > 0);
  const tildadas = tildables.filter((g) => guiaTildada(g, selectedIds));
  if (tildadas.length === 0) return null;

  const paraRecibir = tildadasParaRecibir(tildadas, selectedIds);
  const pendientes = tildadas.flatMap((g) => g.lineas.filter((l) => l.status === "pendiente").map((l) => l.id));
  /* El botón cuenta GUÍAS, como el resto de la barra; el pedido va por asientos. */
  const guiasPorValidar = tildadas.filter((g) => g.lineas.some((l) => l.status === "pendiente")).length;
  const todas = tildadas.length === tildables.length;
  const n = tildadas.length;

  return (
    <div
      role="region"
      aria-label="Guías seleccionadas"
      className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-xl border-2 border-[var(--accent)]/40 bg-[var(--surface-raised)] p-2 shadow-sm"
    >
      <p className="px-1 text-sm font-bold text-[var(--text-primary)]" aria-live="polite">
        {n} guía{n === 1 ? "" : "s"} seleccionada{n === 1 ? "" : "s"}
        <span className="font-normal text-[var(--text-tertiary)]"> de {tildables.length}</span>
      </p>
      <button
        type="button"
        onClick={() => (todas ? onLimpiar() : onSeleccionarTodas(tildables.flatMap((g) => tildeDeGuia(g).ids)))}
        className={`${BOTON} text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]`}
      >
        {todas ? <CheckSquare className="h-4 w-4" aria-hidden /> : <Square className="h-4 w-4" aria-hidden />}
        {todas ? "Quitar todas" : `Todas (${tildables.length})`}
      </button>

      <div className="flex grow flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          disabled={busy || paraRecibir.length === 0}
          title={paraRecibir.length === 0 ? "Ninguna de las seleccionadas espera recepción" : undefined}
          onClick={() => onRecepcionar(paraRecibir.map((g) => g.clave))}
          className={`${BOTON} grow basis-[15rem] bg-[var(--accent)] text-white hover:bg-[var(--accent-600)] sm:grow-0 sm:basis-auto`}
        >
          <PackageCheck className="h-4 w-4" aria-hidden />
          Recepcionar seleccionadas ({paraRecibir.length})
        </button>
        {pendientes.length > 0 && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => onValidar(pendientes)}
              className={`${BOTON} border border-[var(--rule-base)] text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]`}
            >
              <ThumbsUp className="h-4 w-4" aria-hidden />
              Validar ({guiasPorValidar})
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onRechazar}
              className={`${BOTON} border-2 border-[var(--data-error-500)]/40 text-[var(--data-error-700)] hover:bg-[var(--data-error-500)]/10 dark:text-[var(--data-error-500)]`}
            >
              <ThumbsDown className="h-4 w-4" aria-hidden />
              Rechazar
            </button>
          </>
        )}
        <button
          type="button"
          onClick={onLimpiar}
          className={`${BOTON} text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]`}
        >
          <X className="h-4 w-4" aria-hidden />
          Limpiar
        </button>
      </div>
    </div>
  );
}
