"use client";

/**
 * Cómo entra un valor en su renglón, en el bloque «Elegido» del diseñador del
 * talonario (Brandon 16-10: «ajustar independientemente cada valor para que se
 * ajuste al campo… todos los valores en línea recta por defecto»):
 *
 *   · `OpcionesRenglon`: «Encajar en su renglón» (prendido de fábrica: achica
 *     la letra lo justo, hasta 6 pt) y, sólo en campos, «Partir en varios
 *     renglones» (apagado de fábrica: un renglón). Una celda de la tabla es
 *     siempre un renglón, así que sólo lleva «Encajar».
 *   · `EncajeDelValor`: a qué letra sale ESTE valor (la misma cuenta del papel,
 *     `encajarValor`) y, si ni a 6 pt entra, cuánto le falta y «Ensanchar lo
 *     justo», que ensancha sin mover el lado al que se alinea el texto.
 */

import { AlertTriangle } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { Alineacion } from "@/lib/forestal/gtf-matricial-disposicion";
import { anchoParaEntrar, encajarValor, LETRA_MIN_ENCAJE_PT, type ModoValor } from "@/lib/forestal/gtf-salida-geometria";
import { Btn } from "./ctp-shared";
import { Casilla, fmtMm } from "./gtf-matricial-controles";

export function OpcionesRenglon({
  encajar, varias, onEncajar, onVarias,
}: { encajar: boolean; varias?: boolean; onEncajar: (v: boolean) => void; onVarias?: (v: boolean) => void }) {
  return (
    <div role="group" aria-label="Cómo entra en su renglón" className="flex flex-col">
      <Casilla
        label="Encajar en su renglón"
        checked={encajar && !varias}
        disabled={!!varias}
        ayuda={`Si el valor no entra, su letra se achica lo justo (hasta ${LETRA_MIN_ENCAJE_PT} pt) en la misma línea. Ej.: «Madera en rollo» a 7 pt en una columna angosta.`}
        onChange={onEncajar}
      />
      {onVarias && (
        <Casilla
          label="Partir en varios renglones"
          checked={!!varias}
          ayuda="El valor sigue abajo, en otro renglón, como un domicilio largo. Apagado (de fábrica): siempre en una línea."
          onChange={onVarias}
        />
      )}
    </div>
  );
}

/** El ancho justo para que entre, sin mover el lado al que se alinea el texto. */
function ensanchar(x: number, anchoMm: number, nuevo: number, alinea: Alineacion): { x: number; anchoMm: number } {
  const extra = nuevo - anchoMm;
  return { anchoMm: nuevo, x: alinea === "der" ? x - extra : alinea === "centro" ? x - extra / 2 : x };
}

export function EncajeDelValor({
  texto, x, anchoMm, letraPt, alinea, modo, onEnsanchar,
}: {
  texto: string;
  x: number;
  anchoMm: number;
  letraPt: number;
  alinea: Alineacion;
  modo: ModoValor;
  onEnsanchar: (p: { x: number; anchoMm: number }) => void;
}) {
  if (!texto || modo.varias) return null;
  const e = encajarValor(texto, anchoMm, letraPt, modo);
  if (e.achicado && !e.noEntra) {
    return (
      <span data-qa="talonario-letra-achicada" className="text-sm text-[var(--text-secondary)]">
        Sale a {fmtMm(e.letraPt)} pt para que entre.
      </span>
    );
  }
  if (!e.noEntra) return null;
  /* Con «Encajar» apagado, el ancho para su letra; si no, para la más chica. */
  const necesita = anchoParaEntrar(texto, modo.encajar === false ? letraPt : LETRA_MIN_ENCAJE_PT);
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 text-sm font-semibold text-[var(--data-warning-ink)]">
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
      {modo.encajar === false ? "No entra en su renglón." : `No entra ni a ${LETRA_MIN_ENCAJE_PT} pt.`}
      <InfoTip
        title="No entra en su renglón"
        what={`Necesita ${fmtMm(necesita)} mm de ancho y tiene ${fmtMm(anchoMm)} mm: al imprimir pisa al vecino.`}
        affects="«Ensanchar lo justo» le da ese ancho sin mover el lado al que se alinea; en un campo también puedes prender «Partir en varios renglones»."
      />
      <Btn variant="ghost" onClick={() => onEnsanchar(ensanchar(x, anchoMm, necesita, alinea))}>
        Ensanchar lo justo
      </Btn>
    </span>
  );
}
