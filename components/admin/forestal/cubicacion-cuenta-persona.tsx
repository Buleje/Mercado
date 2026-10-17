"use client";

/**
 * «¿De quién es la madera?» y «La madera… te la trae / se la entregas»: los
 * dos campos que comparten el patio de trozas y el Cubicador de madera para
 * subir un lote a la cuenta de una persona (ADR-478/483). Un solo lugar para
 * el orden (primero quien tiene adelantos abiertos del lado que toca: compra
 * paga lo DADO, venta lo RECIBIDO) y para la etiqueta con su saldo.
 */
import { useMemo } from "react";
import { etiquetaPersonaCubicacion } from "@/lib/forestal/cubicacion-a-cuenta";
import type { PersonaCuenta, SentidoCubicacion } from "./hooks/use-cubicaciones-trozas";

export const CAMPO_CUENTA =
  "h-12 w-full rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-base text-[var(--text-primary)] transition-colors focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";
export const ETIQUETA_CUENTA = "mb-1 block text-sm font-semibold text-[var(--text-secondary)]";

/** Lo que cada persona tiene abierto del lado que toca (compra paga lo DADO; venta, lo RECIBIDO). */
function abiertosDe(p: PersonaCuenta, sentido: SentidoCubicacion): { n: number; monto: number } {
  const a = p.adelantos;
  if (!a || !p.beneficiarioId) return { n: 0, monto: 0 };
  return sentido === "venta" ? { n: a.recibidosAbiertos, monto: a.recibidoPendiente } : { n: a.abiertos, monto: a.teDebe };
}

/** Las personas con adelantos abiertos del lado que toca primero; después, por nombre. */
export function usePersonasOrdenadas(personas: readonly PersonaCuenta[] | null, sentido: SentidoCubicacion): PersonaCuenta[] {
  return useMemo(
    () => [...(personas ?? [])].sort((a, b) => abiertosDe(b, sentido).n - abiertosDe(a, sentido).n || a.nombre.localeCompare(b.nombre)),
    [personas, sentido],
  );
}

export function CampoPersonaCuenta({
  id, ordenadas, persona, clave, onClave, sentido, cargando, error,
}: {
  id: string;
  ordenadas: readonly PersonaCuenta[];
  /** La elegida (`ordenadas.find(clave)`), para el aviso de «no tiene adelantos». */
  persona: PersonaCuenta | null;
  clave: string;
  onClave: (clave: string) => void;
  sentido: SentidoCubicacion;
  cargando: boolean;
  error: string | null;
}) {
  return (
    <div>
      <label htmlFor={id} className={ETIQUETA_CUENTA}>¿De quién es la madera?</label>
      <select id={id} className={CAMPO_CUENTA} value={clave} onChange={(e) => onClave(e.target.value)} disabled={cargando}>
        <option value="">{cargando ? "Cargando cuentas…" : "Elige la persona"}</option>
        {ordenadas.map((p) => <option key={p.clave} value={p.clave}>{etiquetaPersonaCubicacion(p, sentido)}</option>)}
      </select>
      {error && <p className="mt-1 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>}
      {persona && !persona.beneficiarioId && (
        <p className="mt-1 text-sm text-[var(--text-tertiary)]">No tiene adelantos: al valorizarla, todo va a su cuenta.</p>
      )}
    </div>
  );
}

export function CampoSentidoCuenta({ sentido, onSentido }: { sentido: SentidoCubicacion; onSentido: (s: SentidoCubicacion) => void }) {
  return (
    <div role="radiogroup" aria-label="Quién entrega la madera">
      <span className={ETIQUETA_CUENTA}>La madera…</span>
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-[var(--surface-sunken)] p-1">
        {(["compra", "venta"] as const).map((s) => (
          <button key={s} type="button" role="radio" aria-checked={sentido === s} onClick={() => onSentido(s)}
            className={`h-12 rounded-xl text-sm font-bold transition-colors ${sentido === s ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm" : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"}`}>
            {s === "compra" ? "Te la trae" : "Se la entregas"}
          </button>
        ))}
      </div>
    </div>
  );
}
