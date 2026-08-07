"use client";

/**
 * La corrida que ya consumió y todavía no declaró, CON SUS TROZAS a la vista.
 *
 * «Corridas sin declarar» abría un formulario en blanco: pedía producto y
 * cantidad sin mostrar una sola pieza de la madera que había entrado. El
 * operador que vuelve de la sierra a cerrar la jornada tiene el atado adelante y
 * necesita ver contra qué está declarando — cuántas trozas, de qué guías y por
 * cuántos m³— antes de escribir lo que salió.
 *
 * Así que elegir una corrida abre ESTA tabla, arriba de la del libro, con las
 * mismas columnas del LO-CTP. Las piezas van en `soloLectura`: ya entraron a la
 * sierra y eso es un hecho registrado, no una casilla que se destilda. Lo que
 * todavía se puede elegir es lo que le QUEDA al lote, y para eso está el atajo
 * del pie, que lleva al panel donde se tildan las trozas de la corrida
 * siguiente (ADR-349).
 */

import { useEffect, useMemo, useRef } from "react";
import { Boxes, Layers, X } from "@buleje/design-system/icons";
import { pieTablarDe } from "@/lib/forestal/lotes-aserrio";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import CtpTrozasDelLote from "./CtpTrozasDelLote";
import { Btn, formatDate } from "./ctp-shared";
import type { CtpEntry } from "./ctp-section-shared";

/** Lo que le queda al lote de esta corrida para la jornada siguiente. */
export interface RestoDelLote {
  loteId: string;
  code: string;
  piezas: number;
  volumenM3: number;
}

export default function CtpCorridaSinDeclarar({
  corrida,
  trozas,
  resto,
  cargando,
  onDeclarar,
  onProducirResto,
  onCerrar,
}: {
  corrida: CtpEntry;
  /** Las piezas que ESTA corrida se comió (`consumidaEnId === corrida.id`). */
  trozas: TrozaConsumible[];
  resto?: RestoDelLote | null;
  cargando?: boolean;
  onDeclarar: () => void;
  onProducirResto?: (loteId: string) => void;
  onCerrar: () => void;
}) {
  const entrada = Number(corrida.volumeInputM3 ?? 0);
  /**
   * Los m³ de las piezas marcadas vs. los que declaró la corrida.
   *
   * Casi siempre son el mismo número —la corrida se abre desde el lote— pero no
   * tienen por qué: una corrida importada o cargada a mano puede tener volumen
   * sin piezas. Mostrar los dos y no uno evita que la tabla parezca decir que
   * entraron 0 m³ cuando el libro dice 5.13.
   */
  const volumenPiezas = useMemo(
    () => Math.round(trozas.reduce((a, t) => a + Number(t.volumenM3 ?? 0), 0) * 10000) / 10000,
    [trozas],
  );

  /* Elegir la corrida trae la vista acá: el panel se dibuja debajo de los KPIs y
     la barra, y sin esto se apretaba el botón y no pasaba nada visible. Mismo
     gesto que el panel del lote. */
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const quieto = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const id = requestAnimationFrame(() =>
      el.scrollIntoView({ behavior: quieto ? "auto" : "smooth", block: "start" }),
    );
    return () => cancelAnimationFrame(id);
  }, [corrida.id]);

  return (
    /* `scroll-mt-20` y no `-4`: la cabecera del panel admin es sticky y mide
       61 px — con menos margen, `scrollIntoView` deja el título debajo de ella
       y el operador cree que se abrió otra cosa. */
    <section
      ref={panelRef}
      aria-label={`Corrida N° ${corrida.lineNo} sin declarar`}
      className="scroll-mt-20 space-y-3 rounded-2xl border-2 border-[var(--accent)]/40 bg-[var(--surface-raised)] p-4"
    >
      <header className="flex flex-wrap items-center gap-3 rounded-xl bg-[var(--surface-sunken)] px-3 py-2.5">
        <span
          aria-hidden
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--accent)] text-white"
        >
          <Boxes className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-[var(--text-primary)]">
            Corrida N° {corrida.lineNo}
            {corrida.materiaPrimaRef && (
              <span className="font-normal text-[var(--text-secondary)]"> · lote {corrida.materiaPrimaRef}</span>
            )}
          </p>
          <p className="font-mono text-sm tabular-nums text-[var(--text-tertiary)]">
            {formatDate(corrida.entryDate)} · {corrida.speciesCommon ?? "Sin especie"} · entraron{" "}
            <b className="text-[var(--text-secondary)]">{entrada.toFixed(4)} m³</b> ·{" "}
            {pieTablarDe(entrada).toLocaleString("es-PE")} pt
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Btn variant="primary" onClick={onDeclarar}>
            <Boxes className="h-4 w-4" />
            Declarar producción
          </Btn>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar la corrida"
            title="Cerrar la corrida"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border-2 border-[var(--rule-base)] text-[var(--text-tertiary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </header>

      {/* La misma lista del formato, en modo lectura: es la madera que hay que
          mirar mientras se declara lo que salió. */}
      <CtpTrozasDelLote
        trozas={trozas}
        soloLectura
        titulo="Trozas que entraron a esta corrida"
        fechaConsumo={corrida.entryDate}
        cargando={cargando}
        /* Sin causa inventada: la lista del patio viene acotada, así que «no
           hay piezas a la vista» NO prueba que la corrida se haya cargado sólo
           por volumen. Se dice lo que se sabe —lo que el libro tiene anotado— y
           el operador saca la conclusión con el dato, no con una suposición. */
        vacio={`Esta corrida no tiene piezas marcadas a la vista. En el libro figura con ${entrada.toFixed(4)} m³ de materia prima.`}
      />

      {/* Cuando las piezas no suman lo que la corrida declaró, se dice: el
          rendimiento se calcula sobre el volumen del libro, no sobre la tabla. */}
      {trozas.length > 0 && Math.abs(volumenPiezas - entrada) > 0.01 && (
        <p className="rounded-xl bg-[var(--data-warning-500)]/12 px-3 py-2 text-sm text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          Las piezas suman <b className="font-mono tabular-nums">{volumenPiezas.toFixed(4)} m³</b> y la corrida
          declaró <b className="font-mono tabular-nums">{entrada.toFixed(4)} m³</b>. El rendimiento se calcula
          sobre lo declarado.
        </p>
      )}

      {/* Lo que SÍ se elige: la madera que le queda al lote. El acto es otro
          —abrir una corrida nueva— y por eso es un atajo al panel del lote, no
          una casilla más en esta tabla. */}
      {resto && resto.piezas > 0 && onProducirResto && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border-2 border-dashed border-[var(--rule-base)] px-3 py-2.5">
          <Layers className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
          <p className="min-w-0 flex-1 text-sm text-[var(--text-secondary)]">
            Al lote <b className="font-mono text-[var(--text-primary)]">{resto.code}</b> le quedan{" "}
            <b className="font-mono tabular-nums text-[var(--text-primary)]">{resto.piezas}</b> troza
            {resto.piezas === 1 ? "" : "s"} sin aserrar ({resto.volumenM3.toFixed(4)} m³): elegí cuáles entran
            en la corrida siguiente.
          </p>
          <Btn size="sm" variant="secondary" onClick={() => onProducirResto(resto.loteId)}>
            Elegir sus trozas
          </Btn>
        </div>
      )}
    </section>
  );
}
