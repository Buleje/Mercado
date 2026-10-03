"use client";

/**
 * El botón «Registrar en el Libro» de una jornada del bloque (ADR-464, fase 3)
 * y el aviso de lo que se escribió. Lo que dice sale del Libro, no de la marca
 * local «Distribuido»: al quedar escrita, la jornada tilda sola sus líneas.
 *
 * Dos toques para escribir (registrar → confirmar): una corrida del Libro no se
 * borra con «deshacer», se anula y queda el rastro.
 */

import { useState } from "react";
import { AlertTriangle, BookOpen, CheckCircle2, Loader2, X } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3, fmtPiezas } from "@/lib/forestal/cubicacion-formato";
import { fechaCorta, type JornadaDelBloque } from "@/lib/forestal/jornadas-de-bloque";
import type { AvisoLibro } from "./hooks/use-libro-de-bloques";

const CHIP = "inline-flex items-center gap-1 rounded-lg border px-1.5 py-0.5 text-xs font-bold";
const BOTON =
  "inline-flex items-center gap-1 rounded-lg border px-1.5 py-0.5 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export function JornadaLibro({
  jornada,
  ocupado,
  bloqueado,
  onRegistrar,
}: {
  jornada: JornadaDelBloque;
  /** ESTA jornada se está escribiendo. */
  ocupado: boolean;
  /** Otra escritura está en curso: una a la vez. */
  bloqueado: boolean;
  onRegistrar: () => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const j = jornada;
  if (j.estado === "sin-produccion") return null;

  if (j.estado === "en-libro") {
    return (
      <span className={`${CHIP} border-[var(--data-success-500)]/50 bg-[var(--data-success-500)]/15 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]`}>
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> En el libro · corrida N° {j.lineNo}
      </span>
    );
  }
  if (j.estado === "abierta") {
    return (
      <span className="inline-flex items-center gap-1">
        <span className={`${CHIP} border-[var(--data-warning-500)]/50 bg-[var(--data-warning-500)]/10 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]`}>
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Corrida N° {j.lineNo} sin declarar
        </span>
        <InfoTip title="Falta declarar" what={j.motivo ?? "Consumió sus trozas y falta declarar lo que salió."} />
      </span>
    );
  }

  const resumen = `${j.trozaIds.length} troza${j.trozaIds.length === 1 ? "" : "s"} (${fmtM3(j.rollizaM3)} m³) → ${fmtPiezas(j.piezas)} pzas · ${fmtM3(j.m3)} m³`;
  if (j.estado === "apagada") {
    return (
      <span className="inline-flex items-center gap-1">
        <button type="button" disabled className={`${BOTON} border-[var(--rule-base)] text-[var(--text-tertiary)]`}>
          <BookOpen className="h-3.5 w-3.5" aria-hidden /> Registrar en el Libro
        </button>
        <InfoTip title="Todavía no se puede" what={j.motivo ?? "Sin motivo"} />
      </span>
    );
  }

  if (ocupado) {
    return (
      <span className={`${CHIP} border-[var(--accent)] text-[var(--accent-ink)] dark:text-[var(--accent)]`}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Escribiendo en el Libro…
      </span>
    );
  }
  if (confirmando) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        <span className="text-xs text-[var(--text-secondary)]">{fechaCorta(j.fecha)} · {resumen}</span>
        <button
          type="button"
          disabled={bloqueado}
          onClick={() => {
            setConfirmando(false);
            onRegistrar();
          }}
          className={`${BOTON} border-[var(--accent)] bg-[var(--accent)] text-white hover:brightness-95`}
        >
          <BookOpen className="h-3.5 w-3.5" aria-hidden /> Confirmar
        </button>
        <button type="button" onClick={() => setConfirmando(false)} aria-label="Cancelar" className={`${BOTON} border-[var(--rule-base)] text-[var(--text-secondary)]`}>
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        disabled={bloqueado}
        onClick={() => setConfirmando(true)}
        title={`Registrar el ${fechaCorta(j.fecha)}: ${resumen}`}
        className={`${BOTON} border-[var(--accent)] text-[var(--accent-ink)] hover:bg-primary/10 dark:text-[var(--accent)]`}
      >
        <BookOpen className="h-3.5 w-3.5" aria-hidden /> Registrar en el Libro
      </button>
      {j.aviso && <InfoTip title="Antes de registrar" what={j.aviso} />}
    </span>
  );
}

/** El aviso de la última escritura del bloque, con su cierre. */
export function AvisoDelLibro({ aviso, onCerrar }: { aviso: AvisoLibro; onCerrar: () => void }) {
  const tono =
    aviso.tono === "ok"
      ? "border-[var(--data-success-500)]/50 bg-[var(--data-success-500)]/10 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
      : aviso.tono === "aviso"
        ? "border-[var(--data-warning-500)]/50 bg-[var(--data-warning-500)]/10 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
        : "border-[var(--data-error-500)]/50 bg-[var(--data-error-500)]/10 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]";
  return (
    <p role="status" className={`mx-3 mt-2 flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-sm ${tono}`}>
      {aviso.tono === "ok" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
      <span className="flex-1">{aviso.texto}</span>
      <button type="button" onClick={onCerrar} aria-label="Cerrar aviso" className="shrink-0 rounded p-0.5 hover:bg-[var(--surface-sunken)]">
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </p>
  );
}
