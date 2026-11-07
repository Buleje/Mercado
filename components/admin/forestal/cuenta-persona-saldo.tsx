"use client";

/**
 * El saldo de la persona elegida en «¿De quién es la madera?» (Brandon 28-10:
 * «cuando se elige la cuenta, que se vea el saldo —a favor o en contra de la
 * persona— y ahí mismo ver los detalles de toda su cuenta»). Va debajo del
 * selector que comparten el Cubicador de madera y el patio de trozas.
 *
 * Es lo que la persona tiene HOY en sus dos libretas (Adelantos + cuenta
 * forestal), sin esta madera: lo que haría esta madera lo dice quien la sube.
 */
import { useState } from "react";
import { Wallet } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { claseSaldo, textoSaldo } from "./CtpParteSaldo";
import CuentaPersonaDetalleModal from "./cuenta-persona-detalle-modal";
import type { PersonaCuenta } from "./hooks/use-cubicaciones-trozas";

/** Positivo = te debe. `null` = tu rol no ve la plata. */
export function netoDePersonaCuenta(p: PersonaCuenta): number | null {
  if (p.adelantos === undefined) return null;
  return Math.round(((p.adelantos?.neto ?? 0) + (p.cuenta ?? 0)) * 100) / 100;
}

/** «En contra de Juan» / «A favor de Juan»: de quién es la deuda, dicho del lado de la persona. */
export function ladoDelSaldo(neto: number, nombre: string): string {
  if (neto > 0.005) return `En contra de ${nombre}`;
  if (neto < -0.005) return `A favor de ${nombre}`;
  return nombre;
}

/** «Te debe S/ 300» → «te debe S/ 300» (sólo la primera letra: «S/» se queda). */
const enFrase = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

const PILL = "inline-flex items-center rounded-full bg-[var(--surface-raised)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]";

export function SaldoDeLaPersona({ persona }: { persona: PersonaCuenta }) {
  const [viendo, setViendo] = useState(false);
  const neto = netoDePersonaCuenta(persona);
  if (neto === null) return null;
  const adelantos = persona.adelantos?.neto ?? null;
  const forestal = persona.cuenta ?? null;
  return (
    <div className="mt-2 space-y-2 rounded-2xl bg-[var(--surface-sunken)] px-3 py-2.5" data-vista="saldo-persona">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[var(--text-tertiary)]">Su saldo hoy · {ladoDelSaldo(neto, persona.nombre)}</p>
          <p className={`text-base font-extrabold tabular-nums ${claseSaldo(neto)}`} data-saldo={neto}>{textoSaldo(neto)}</p>
        </div>
        <button type="button" className={button({ variant: "secondary", className: "gap-2" })} onClick={() => setViendo(true)}
          data-accion="ver-cuenta-persona">
          <Wallet className="h-4 w-4" aria-hidden /> Ver toda su cuenta
        </button>
      </div>
      {(adelantos !== null || forestal !== null) && (
        <div className="flex flex-wrap gap-1.5">
          {adelantos !== null && <span className={PILL}>Adelantos: {enFrase(textoSaldo(adelantos))}</span>}
          {forestal !== null && <span className={PILL}>Cuenta forestal: {enFrase(textoSaldo(forestal))}</span>}
        </div>
      )}
      {viendo && <CuentaPersonaDetalleModal clave={persona.clave} nombre={persona.nombre} onClose={() => setViendo(false)} />}
    </div>
  );
}
