"use client";

/**
 * «Letra» en los ajustes del talonario: agranda o achica TODOS los textos de
 * la hoja abierta (guía o lista, cada una la suya) con A− / A+, o los deja
 * todos iguales. La letra de un campo suelto se sigue cambiando en «Campo
 * elegido». La cuenta vive en `lib/forestal/gtf-matricial-letra`.
 */

import { useEffect, useId, useState } from "react";
import { Minus, Plus } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import {
  LETRA_HOJA_MAX_PT,
  LETRA_HOJA_MIN_PT,
  PASO_LETRA_HOJA_PT,
  letraDeTodaLaHoja,
  letraMasUsada,
  letrasDeLaHoja,
  textoLetras,
  type CambioDeLetra,
} from "@/lib/forestal/gtf-matricial-letra";
import { Btn, I } from "./ctp-shared";
import { fmtMm, leerNumero } from "./gtf-matricial-controles";
import type { EstadoGtfMatricial } from "./hooks/use-gtf-matricial";

const PASO = fmtMm(PASO_LETRA_HOJA_PT);
const INPUT = I.replace("h-11", "h-12");

/**
 * «Todas iguales a N pt» con su botón: sólo iguala al tocar «Igualar» o con
 * Enter (al salir de la caja no cambia nada: pasar con Tab no empareja la hoja).
 */
function IgualarLetra({ value, parejas, onIgualar }: { value: number; parejas: boolean; onIgualar: (pt: number) => void }) {
  const id = useId();
  const [borrador, setBorrador] = useState(fmtMm(value));
  useEffect(() => setBorrador(fmtMm(value)), [value]);
  const n = leerNumero(borrador);
  const valido = n != null && n >= LETRA_HOJA_MIN_PT && n <= LETRA_HOJA_MAX_PT;
  const igualar = () => {
    if (valido) onIgualar(n);
  };
  return (
    <div className="flex min-w-0 flex-col gap-1 text-sm font-semibold text-[var(--text-secondary)]">
      <label htmlFor={id}>Todas iguales a</label>
      <div className="flex items-center gap-2">
        <span className="relative min-w-0 flex-1">
          <input
            id={id}
            inputMode="decimal"
            value={borrador}
            onChange={(e) => setBorrador(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") igualar();
            }}
            aria-invalid={!valido}
            data-qa="letra-igual"
            className={`${INPUT} pr-10 font-mono tabular-nums`}
          />
          <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-[var(--text-tertiary)]">
            pt
          </span>
        </span>
        <Btn onClick={igualar} disabled={!valido || (parejas && n === value)} title={valido ? undefined : `Entre ${LETRA_HOJA_MIN_PT} y ${LETRA_HOJA_MAX_PT} pt`}>
          Igualar
        </Btn>
      </div>
    </div>
  );
}

/** El dato del renglón plegado: «9 pt · toda la lista». */
export function datoDeLaLetra(t: EstadoGtfMatricial): string {
  return t.hoja ? `${textoLetras(letrasDeLaHoja(t.hoja))} · toda la ${t.formato === "lista" ? "lista" : "guía"}` : "";
}

export default function LetraDeLaHoja({ t }: { t: EstadoGtfMatricial }) {
  const hoja = t.hoja;
  if (!hoja) return null;
  const letras = letrasDeLaHoja(hoja);
  const [min, max] = [Math.min(...letras), Math.max(...letras)];
  const [esta, otra] = t.formato === "lista" ? ["la lista", "la guía"] : ["la guía", "la lista"];
  const cambiar = (c: CambioDeLetra) => t.cambiarHoja(letraDeTodaLaHoja(hoja, c));
  return (
    <div className="flex flex-col gap-2" data-qa="talonario-letra">
      <span className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
        <span className="min-w-0 flex-1">
          Todos los textos de {esta}; {otra} tiene su propia letra.
        </span>
        <InfoTip
          title="La letra de toda la hoja"
          what={`A− y A+ bajan o suben ${PASO} pt todos los valores juntos: cada uno conserva su diferencia con los demás. «Todas iguales a» las deja parejas.`}
          affects={`Sólo ${esta}, en pantalla y al imprimir. La de un campo suelto se cambia en «Campo elegido»; si un valor no entra, se sigue achicando solo (Encajar).`}
          example="9 pt → A+ → 9,5 pt en todos · 6 pt ≈ 20 letras por pulgada"
        />
      </span>
      <div className="flex items-center gap-2">
        <Btn
          className="w-12 justify-center"
          onClick={() => cambiar({ sumar: -PASO_LETRA_HOJA_PT })}
          disabled={min <= LETRA_HOJA_MIN_PT}
          aria-label={`Achicar toda la letra de ${esta} ${PASO} pt`}
          data-qa="letra-menos"
        >
          <Minus className="h-4 w-4 shrink-0" aria-hidden />
        </Btn>
        <span
          className="min-w-0 flex-1 text-center font-mono text-base font-bold tabular-nums text-[var(--text-primary)]"
          aria-live="polite"
          data-qa="letra-actual"
        >
          {textoLetras(letras)}
        </span>
        <Btn
          className="w-12 justify-center"
          onClick={() => cambiar({ sumar: PASO_LETRA_HOJA_PT })}
          disabled={max >= LETRA_HOJA_MAX_PT}
          aria-label={`Agrandar toda la letra de ${esta} ${PASO} pt`}
          data-qa="letra-mas"
        >
          <Plus className="h-4 w-4 shrink-0" aria-hidden />
        </Btn>
      </div>
      <IgualarLetra value={letraMasUsada(letras)} parejas={min === max} onIgualar={(igual) => cambiar({ igual })} />
    </div>
  );
}
