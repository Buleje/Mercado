"use client";

import { Gift, LogIn } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { PTS_PER_SOL } from "@/lib/loyalty-constants";
import { TOPE_CANJE_PCT, solesPorPuntos } from "@/lib/pricing/total-pedido";

/**
 * Canje de puntos del checkout (vuelve 2026-10-08, ahora lo cobra el
 * servidor en `POST /api/orders`).
 *
 *  - Sesión VERIFICADA con saldo → deslizador de a S/ 1 (100 pts), con el
 *    saldo, el valor en soles y el tope.
 *  - Sin sesión verificada → «Inicia sesión para usar tus puntos» (el invitado
 *    no canjea: sus puntos no se pueden verificar con el teléfono escrito).
 *  - Sesión sin saldo suficiente o aún sin saber → nada.
 */
export interface CanjePuntosProps {
  sesionVerificada: boolean | null;
  /** Saldo del cliente verificado (null = no leído). */
  saldo: number | null;
  /** Máximo en soles enteros que deja canjear este pedido. */
  maxSoles: number;
  /** Soles elegidos en el deslizador. */
  soles: number;
  onSolesChange: (soles: number) => void;
  onIniciarSesion?: () => void;
}

const COLOR_MARCA = "var(--color-primary-dark, var(--color-primary))";

/** ¿Dibuja algo? (para no dejar un separador huérfano encima). */
export function muestraCanje(p: Pick<CanjePuntosProps, "sesionVerificada" | "saldo" | "onIniciarSesion">): boolean {
  if (p.sesionVerificada === false) return !!p.onIniciarSesion;
  return p.sesionVerificada === true && p.saldo !== null && p.saldo >= PTS_PER_SOL;
}

export function CanjePuntos({
  sesionVerificada,
  saldo,
  maxSoles,
  soles,
  onSolesChange,
  onIniciarSesion,
}: CanjePuntosProps) {
  if (sesionVerificada === false) {
    if (!onIniciarSesion) return null;
    return (
      <button
        type="button"
        onClick={onIniciarSesion}
        data-testid="canje-iniciar-sesion"
        className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ color: COLOR_MARCA }}
      >
        <LogIn className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden="true" />
        Inicia sesión para usar tus puntos
      </button>
    );
  }
  if (sesionVerificada !== true || saldo === null || saldo < PTS_PER_SOL) return null;

  const valorSaldo = solesPorPuntos(saldo);
  return (
    <section className="space-y-3" data-testid="canje-puntos">
      <div className="flex items-center gap-2.5">
        <div
          className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "color-mix(in oklch, var(--color-primary) 12%, transparent)" }}
        >
          <Gift className="h-4 w-4" strokeWidth={2.25} style={{ color: COLOR_MARCA }} aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-extrabold leading-tight" style={{ color: COLOR_MARCA }}>
            Canjear puntos
          </p>
          <p className="text-xs text-muted dark:text-[var(--text-tertiary)] mt-0.5">
            Tienes {saldo} pts ({formatCurrency(valorSaldo)}) · {PTS_PER_SOL} pts = S/ 1 · hasta el{" "}
            {TOPE_CANJE_PCT} % del pedido
          </p>
        </div>
      </div>
      {maxSoles >= 1 ? (
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={maxSoles}
            step={1}
            value={Math.min(soles, maxSoles)}
            onChange={(e) => onSolesChange(Number(e.target.value))}
            className="flex-1 h-2 cursor-pointer accent-[var(--color-primary)]"
            aria-label="Soles a pagar con tus puntos"
            aria-valuetext={`${Math.min(soles, maxSoles)} soles, ${Math.min(soles, maxSoles) * PTS_PER_SOL} puntos`}
          />
          <div className="text-right shrink-0">
            <p className="text-base font-extrabold tabular-nums leading-tight" style={{ color: COLOR_MARCA }}>
              −{formatCurrency(Math.min(soles, maxSoles))}
            </p>
            <p className="text-xs text-muted dark:text-[var(--text-tertiary)] tabular-nums">
              {Math.min(soles, maxSoles) * PTS_PER_SOL} de {maxSoles * PTS_PER_SOL} pts
            </p>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted dark:text-[var(--text-tertiary)]">
          Este pedido es chico para canjear: los puntos pagan hasta el {TOPE_CANJE_PCT} % del total.
        </p>
      )}
    </section>
  );
}
