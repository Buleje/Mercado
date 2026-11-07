"use client";

/**
 * CuentaGoogle — la parte de Google del paso «¿Cómo quieres continuar?».
 * Sin cuenta: «Continuar con Google» (kit `BotonGoogle`). Con cuenta: «Hola,
 * Ana» + «No soy yo» y un botón para seguir con el nombre ya puesto.
 * Sólo rellena el nombre: no da descuentos ni identidad (ver `useGoogleCheckout`).
 */

import { ArrowRight } from "@buleje/design-system/icons";
import { BotonGoogle, ChipCliente } from "@/components/store/cliente/BotonGoogle";
import type { ClienteTienda } from "@/lib/tienda-cliente/contrato";

export interface CuentaGoogleProps {
  cliente: ClienteTienda | null;
  /** `undefined` = el negocio apagó «entrar con Google». */
  entrar?: (volverA?: string) => Promise<void>;
  onSalir?: () => Promise<void> | void;
  /** Seguir a «Tus datos» con el nombre de Google ya puesto. */
  onContinuar: () => void;
}

export function CuentaGoogle({ cliente, entrar, onSalir, onContinuar }: CuentaGoogleProps) {
  if (!cliente && !entrar) return null;
  const primerNombre = cliente ? cliente.nombre.split(/\s+/)[0] || cliente.nombre : "";

  return (
    <>
      {cliente ? (
        <div className="rounded-2xl border-2 border-primary/30 bg-[var(--surface-raised)] p-3 space-y-2" data-testid="checkout-cuenta-google">
          <ChipCliente
            cliente={cliente}
            onSalir={onSalir}
            className="text-[var(--text-primary)]"
            claseSalir="font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          />
          <button
            type="button"
            onClick={onContinuar}
            className="w-full h-12 flex items-center justify-center gap-2 rounded-xl bg-primary text-white font-bold text-base hover:bg-primary-dark transition-colors"
          >
            Continuar como {primerNombre}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : entrar ? (
        <BotonGoogle
          entrar={entrar}
          className="h-14 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-bold text-[var(--text-primary)] hover:border-primary/50 hover:shadow-md transition-all"
          claseError="font-semibold text-[var(--data-error-500)]"
        />
      ) : null}

      <div className="flex items-center gap-3 py-1">
        <div className="flex-1 h-px bg-[var(--rule-soft)]" />
        <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-muted dark:text-[var(--text-tertiary)]">o</span>
        <div className="flex-1 h-px bg-[var(--rule-soft)]" />
      </div>
    </>
  );
}
