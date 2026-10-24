"use client";

/**
 * La barra de la lista de trozas a mano (Brandon 15-10): **Leer** fila por fila
 * en voz alta (la lectura del cubicador) y **Ordenar Ø** con el mayor en D1,
 * con Deshacer y Rehacer. Dice cuántas filas cambió cada vez: «3 filas
 * ordenadas» se coteja contra el papel; un botón mudo no.
 */

import { useState } from "react";
import { ArrowDownUp, Pause, Play, Redo2, Square, Undo2, Volume2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { filasAlReves } from "@/lib/forestal/loth-trozas-a-mano-planilla";
import type { TrozasAMano } from "./hooks/use-trozas-a-mano";
import type { LecturaTrozasAMano } from "./hooks/use-lectura-trozas-a-mano";
import { Btn } from "./ctp-shared";

const filasTxt = (n: number) => `${n} ${n === 1 ? "fila" : "filas"}`;
const ICONO = "h-4 w-4";

export default function TrozaAManoBarra({ aMano, lectura }: { aMano: TrozasAMano; lectura: LecturaTrozasAMano }) {
  const [aviso, setAviso] = useState<string | null>(null);
  const alReves = filasAlReves(aMano.filas);
  const est = lectura.estado;
  const leyendo = !!est && !est.terminada;
  /* Sin motor de voz (algunos navegadores de celular) el botón no promete lo que no puede. */
  const hayVoz = typeof window !== "undefined" && "speechSynthesis" in window;

  const ordenar = () => {
    const n = aMano.ordenar();
    setAviso(n > 0 ? `${filasTxt(n)} ${n === 1 ? "ordenada" : "ordenadas"}: el mayor quedó en D1` : "Ya estaban ordenadas: D1 es el mayor en todas");
  };
  const deshacer = () => {
    const n = aMano.deshacer();
    setAviso(n > 0 ? `Deshecho: ${filasTxt(n)} como estaban` : "Nada que deshacer: esas filas ya cambiaron");
  };
  const rehacer = () => {
    const n = aMano.rehacer();
    setAviso(n > 0 ? `Rehecho: ${filasTxt(n)} con el mayor en D1` : "Nada que rehacer: esas filas ya cambiaron");
  };

  return (
    <div className="flex flex-wrap items-center gap-2" data-qa="barra-a-mano">
      {hayVoz && (
        <Btn
          variant={leyendo ? "dark" : "secondary"}
          onClick={leyendo ? lectura.detener : lectura.leer}
          aria-pressed={leyendo}
          aria-label={leyendo ? "Detener la lectura" : "Leer en voz alta"}
          title={leyendo ? "Dejar de leer" : "Leer en voz alta, fila por fila"}
        >
          {leyendo ? <Square className={ICONO} aria-hidden="true" /> : <Volume2 className={ICONO} aria-hidden="true" />}
          {/* A 400 px sólo el ícono: con el texto, la barra se partía en dos filas (104 px). */}
          <span className="hidden sm:inline">{leyendo ? "Detener" : "Leer"}</span>
        </Btn>
      )}
      {leyendo && est && (
        <>
          <Btn
            variant="ghost"
            onClick={est.pausada ? lectura.reanudar : lectura.pausar}
            aria-label={est.pausada ? "Seguir leyendo" : "Pausar la lectura"}
            title={est.pausada ? "Seguir (repite la fila cortada)" : "Pausar"}
          >
            {est.pausada ? <Play className={ICONO} aria-hidden="true" /> : <Pause className={ICONO} aria-hidden="true" />}
          </Btn>
          <span aria-live="polite" className="font-mono text-xs font-bold tabular-nums text-[var(--text-secondary)]">
            Fila {Math.min(est.idx + 1, est.total)} de {est.total}
          </span>
        </>
      )}
      <Btn variant="secondary" onClick={ordenar} title="Intercambia D1 y D2 donde D2 es mayor. El volumen no cambia.">
        <ArrowDownUp className={ICONO} aria-hidden="true" />
        Ordenar Ø<span className="hidden sm:inline"> (mayor en D1)</span>
        {alReves > 0 && (
          <span
            data-qa="filas-al-reves"
            className="rounded-full bg-[var(--data-warning-100)] px-1.5 text-xs font-bold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]"
          >
            {alReves}
          </span>
        )}
      </Btn>
      <Btn variant="ghost" onClick={deshacer} disabled={!aMano.puedeDeshacer} aria-label="Deshacer el orden" title="Deshacer el orden">
        <Undo2 className={ICONO} aria-hidden="true" />
      </Btn>
      <Btn variant="ghost" onClick={rehacer} disabled={!aMano.puedeRehacer} aria-label="Rehacer el orden" title="Rehacer el orden">
        <Redo2 className={ICONO} aria-hidden="true" />
      </Btn>
      <InfoTip
        title="Teclado, lectura y orden"
        what="Las medidas se corrigen en la misma tabla. → con el cursor al final del número pasa a la medida siguiente (de Cantidad, a la fila de abajo); ← vuelve; ↑ ↓ cambian de fila y la última baja a la fila de alta. Leer dice cada fila en voz alta con la voz de los Ajustes del Cubicador. Ordenar Ø pone el mayor en D1 donde estaba al revés; el número naranja dice cuántas faltan."
        affects="Ordenar no cambia el volumen (Smalian promedia los dos Ø) y la guía igual imprime el mayor como D1: sirve para cotejar con tu papel. Deshacer devuelve esas filas como estaban."
        example="«Fila 1: 45, 40, 3 coma 2» · D1 40 · D2 45 → Ordenar → D1 45 · D2 40, mismo 0,454 m³"
        ariaLabel="Qué es: teclado, lectura y orden"
      />
      {aviso && (
        <span role="status" className="text-sm font-semibold text-[var(--text-secondary)]">
          {aviso}
        </span>
      )}
    </div>
  );
}
