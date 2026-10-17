"use client";

/**
 * Los avisos de la vista Lotes, arriba de la barra.
 *
 * Salieron de `CtpLotesView` (27-09). Cada aviso es UNA línea con su acción; el
 * porqué va en el ⓘ (ley de Brandon, regla 9). Sólo aparecen cuando hay algo:
 * un renglón que siempre dice «0» enseña a no leerlo.
 */

import { PackageOpen, ScanText, X } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { ResumenPatio } from "@/lib/forestal/patio-resumen";
import type { LoteDescuadrado } from "./CtpCuadreSniffsModal";
import type { AvisoLotes } from "./CtpLotesModales";
import { m3Card } from "./ctp-lote-card-partes";

const plural = (n: number, s = "s") => (n === 1 ? "" : s);

export function CtpLotesAvisosArriba({
  patio,
  descuadres,
  error,
  aviso,
  onCerrarAviso,
  onRecepcionar,
  onVerCuadre,
}: {
  patio: ResumenPatio;
  descuadres: LoteDescuadrado[];
  error: string | null;
  aviso: AvisoLotes | null;
  onCerrarAviso: () => void;
  /** Saltar a Ingresos, a las guías por recepcionar. Sin él, el aviso sólo informa. */
  onRecepcionar?: () => void;
  onVerCuadre: () => void;
}) {
  /* Lo del SNIFFS que falta declarar acá, con su peso: la tarea concreta. */
  const pendientes = descuadres.filter((d) => d.cuadre.estado === "pendiente" || d.cuadre.produccionPendiente);
  const m3Pendiente = Math.round(pendientes.reduce((a, d) => a + d.peso, 0) * 10_000) / 10_000;
  return (
    <>
      {/**
       * La madera que espera un PAPEL, no la sierra (ADR-339): «7 libres» con la
       * pila llena delante no decía de dónde agarrarse. Medido en el tenant
       * real: 153 de 160 piezas estaban así. Va arriba porque sin recepcionar
       * esas guías no hay lote que armar.
       */}
      {patio.sinRecepcionar > 0 && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-[var(--data-warning-500)]/12 px-3 py-2.5 text-sm text-[var(--data-warning-ink)]">
          <PackageOpen className="h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0">
            <b className="tabular-nums">{patio.sinRecepcionar}</b> pieza{plural(patio.sinRecepcionar)} (
            <b className="tabular-nums">{m3Card(patio.volumenSinRecepcionarM3)} m³</b>) sin recepcionar{" "}
            <InfoTip
              title="Piezas sin recepcionar"
              body="Su guía está sin recepcionar. Hasta recepcionarla, esa madera no se puede aserrar ni entrar a un lote."
            />
          </span>
          {onRecepcionar && (
            <button type="button" onClick={onRecepcionar} className="font-bold underline underline-offset-2">
              Recepcionar {patio.guiasSinRecepcionar} guía{plural(patio.guiasSinRecepcionar)}
            </button>
          )}
        </p>
      )}

      {/* Lo que no cuadra con el SNIFFS (ADR-398): la pregunta de antes de una
          fiscalización, y la única deuda que no se ve abriendo un lote. */}
      {descuadres.length > 0 && (
        <button
          type="button"
          onClick={onVerCuadre}
          className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/12 px-3 py-2 text-left text-sm font-bold text-[var(--data-warning-ink)] transition-colors hover:bg-[var(--data-warning-500)]/20"
        >
          <ScanText className="h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            {descuadres.length} lote{plural(descuadres.length)} del SNIFFS pide{plural(descuadres.length, "n")} atención
            {pendientes.length > 0 && ` · ${pendientes.length} sin declarar acá (${m3Card(m3Pendiente)} m³)`}
          </span>
          <span className="shrink-0 underline underline-offset-2">ver cuáles</span>
        </button>
      )}

      {error && (
        <p className="rounded-2xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-4 py-3 text-sm font-bold text-[var(--data-error-ink)] dark:bg-transparent">
          No se pudieron leer los lotes: {error}
        </p>
      )}

      {aviso && (
        <p
          className={`flex items-start gap-2 rounded-2xl border-2 px-4 py-3 text-sm font-bold ${
            aviso.tono === "ok"
              ? "border-[var(--data-success-500)]/40 bg-[var(--data-success-50)] text-[var(--data-success-ink)] dark:bg-[var(--data-success-500)]/12"
              : "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/12"
          }`}
        >
          <span className="flex-1">{aviso.texto}</span>
          <button type="button" onClick={onCerrarAviso} aria-label="Cerrar el aviso" className="shrink-0">
            <X className="h-4 w-4" />
          </button>
        </p>
      )}
    </>
  );
}

/** «N lotes para revisar», arriba de las tarjetas: se anuncian, no hay que abrirlos para enterarse. */
export function CtpLotesParaRevisar({ cuantos }: { cuantos: number }) {
  if (cuantos === 0) return null;
  return (
    <p className="rounded-2xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-4 py-2.5 text-sm font-bold text-[var(--data-warning-ink)] dark:bg-transparent">
      {cuantos} lote{plural(cuantos)} para revisar{" "}
      <InfoTip
        title="Lotes para revisar"
        body="Madera apartada hace días, piezas consumidas por fuera o corridas anuladas. El detalle está en cada tarjeta."
      />
    </p>
  );
}
