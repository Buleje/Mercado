"use client";

/**
 * Ficha de sólo lectura para un lote que ya no admite trozas nuevas (Brandon,
 * 2026-09-01: "tiene que aparecer los lotes que he creado, sea que ya se
 * consumió o tenga trozas... para poner nuevas trozas").
 *
 * Un lote "consumido"/"cerrado" no puede recibir más materia prima — el
 * servidor lo bloquea a propósito (`ForestLoteAserrioDB.agregarTrozas`):
 * sumarle piezas corrompería el rendimiento que ya declaró su corrida. Antes
 * ese lote directamente desaparecía del combo de Consumos, y un lote que
 * "desaparece" se lee como un lote perdido. Ahora se ve siempre — este es el
 * lugar donde se explica qué pasó con él, en vez de ofrecer un picker de
 * trozas que el servidor va a rechazar.
 */

import { ESTADO_LOTE, TONO_ESTADO_LOTE, type LoteAserrio } from "@/lib/forestal/lotes-aserrio";

export default function CtpLoteCerradoFicha({
  lote,
  onIrAProduccion,
}: {
  lote: LoteAserrio;
  /** Sólo se ofrece si hay algo pendiente de declarar. */
  onIrAProduccion?: () => void;
}) {
  const estado = ESTADO_LOTE[lote.status];
  const corridas = lote.corridas ?? (lote.produccion ? [lote.produccion] : []);
  const sinDeclarar = corridas.some((c) => c.viva && c.quantity == null);

  return (
    <section className="space-y-3 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--text-secondary)]">
          Lote <b className="font-mono text-[var(--text-primary)]">{lote.code}</b> ·{" "}
          <b className="text-[var(--text-primary)]">{lote.speciesCommon}</b>
        </p>
        <span
          title={estado.hint}
          className={`rounded-full border-2 px-2.5 py-0.5 text-sm font-bold ${TONO_ESTADO_LOTE[lote.status]}`}
        >
          {estado.label}
        </span>
      </header>

      <p className="text-sm text-[var(--text-tertiary)]">
        {estado.hint} No admite trozas nuevas: agregarle más materia prima corrompería el
        rendimiento que ya declaró su corrida.
      </p>

      {corridas.length > 0 && (
        <ul className="space-y-1 text-sm text-[var(--text-secondary)]">
          {corridas.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--surface-sunken)] px-3 py-2"
            >
              <span>
                Corrida N° <b className="font-mono text-[var(--text-primary)]">{c.lineNo}</b>
                {!c.viva && <span className="ml-2 text-[var(--text-tertiary)]">(anulada)</span>}
              </span>
              <span className="font-mono tabular-nums">
                {c.quantity != null ? `${c.quantity} ${c.unit ?? ""}` : "sin declarar producción"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {sinDeclarar && onIrAProduccion && (
        <button
          type="button"
          onClick={onIrAProduccion}
          className="text-sm font-bold text-[var(--accent-ink)] underline dark:text-[var(--accent)]"
        >
          Declarar la producción en Producción →
        </button>
      )}
    </section>
  );
}
