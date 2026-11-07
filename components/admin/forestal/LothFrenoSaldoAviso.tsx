"use client";

/**
 * Lo que dice el freno del saldo en el pie del despacho con guía: en rojo las
 * especies que se pasan (el servidor las rechaza con el mismo texto) y en coral
 * lo que el plan no limita (avisa, no frena). Vacío = no dice nada. Va en la
 * `nota` del pie (no en `aviso`): así no tapa el «Faltan N para registrar».
 */

import { AlertTriangle, Ban } from "@buleje/design-system/icons";
import type { FrenoDeSaldo } from "@/lib/forestal/loth-saldo-cascada";

export default function LothFrenoSaldoAviso({ freno }: { freno: FrenoDeSaldo }) {
  if (freno.bloqueos.length === 0 && freno.avisos.length === 0) return null;
  return (
    <span data-testid="freno-saldo" className="flex basis-full flex-col gap-1">
      {freno.bloqueos.map((b) => (
        <span key={b.clave} role="alert" className="flex items-start gap-1.5 font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          <Ban className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {b.mensaje}
        </span>
      ))}
      {freno.avisos.map((a) => (
        <span key={a.mensaje} className="flex items-start gap-1.5 font-normal text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {a.mensaje}
        </span>
      ))}
    </span>
  );
}
