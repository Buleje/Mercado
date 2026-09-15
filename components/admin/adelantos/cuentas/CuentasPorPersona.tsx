"use client";

/**
 * Cuenta por persona (ADR-412 §5): Adelantos y la cuenta corriente forestal,
 * unidas en una sola fila.
 *
 * Por qué existe: medido en el tenant real, eran DOS libretas que no se
 * hablaban —3 personas de un lado, 4 partes del otro, 0 en común— así que a
 * quien se le presta aserrío Y se le adelanta plata se le veía media deuda en
 * cada pantalla. Pedido de Brandon: «que toda esa información con la fecha
 * vaya a la cuenta del dueño o cliente… para llevar un mejor control y menor
 * manejo».
 */

import { useMemo } from "react";
import { CardTitle } from "@buleje/design-system";
import { Users } from "@buleje/design-system/icons";
import { useCuentasPersonas } from "@/hooks/use-cuentas-personas";
import { useMiRol } from "@/hooks/use-mi-rol";
import { EmptyState, fmtMon } from "../shared";
import FilaCuentaPersona from "./FilaCuentaPersona";

export default function CuentasPorPersona({ onGoTab }: { onGoTab: (tab: string) => void }) {
  const { forestal, personas, truncado, loading, error, vincularParte, reload } = useCuentasPersonas();
  // ADR-413: liquidar/anular sólo admin y dueño — si el rol no alcanza, el
  // botón «Liquidar» ni se muestra (el servidor lo rechazaría igual).
  const rol = useMiRol();
  const puedeLiquidar = rol === "admin" || rol === "owner";

  // Partes sueltas: sin persona de Adelantos unida — son las candidatas que se
  // ofrecen en "¿Es la misma persona que...?" de una fila SIN vínculo.
  const candidatos = useMemo(() => personas.filter((p) => p.parteId && !p.beneficiarioId), [personas]);
  const teDeben = useMemo(() => personas.filter((p) => p.neto > 0.005).reduce((s, p) => s + p.neto, 0), [personas]);
  const leDebes = useMemo(() => personas.filter((p) => p.neto < -0.005).reduce((s, p) => s + Math.abs(p.neto), 0), [personas]);

  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base font-extrabold text-[var(--text-primary)]">Cuenta por persona</CardTitle>
        {!loading && personas.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm font-bold">
            {/* El token base no pasa AA en 14px 700 (medido: contraste 2.03 y
                2.61) — el `-700`/`-500` es el mismo patrón que ya usa
                CtpCuentaCorriente.tsx. */}
            <span className="text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">Te deben {fmtMon(teDeben)}</span>
            <span className="text-[var(--data-info-700)] dark:text-[var(--data-info-500)]">Le debes {fmtMon(leDebes)}</span>
          </div>
        )}
      </div>
      <p className="mb-4 text-sm text-[var(--text-secondary)]">
        Adelantos, aserríos, ventas de madera y pagos de cada uno, en una sola cuenta.
      </p>

      {error && (
        <div className="mb-3 rounded-xl border border-[var(--data-error)]/30 bg-[var(--data-error)]/10 px-4 py-3 text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {error}
        </div>
      )}

      {/* La cuenta forestal tocó el tope de lectura (ver route.ts): mostrarla
          como si fuera completa sería la misma mentira que el tope de 500
          adelantos que esto vino a corregir. */}
      {!loading && truncado && (
        <div className="mb-3 rounded-xl border border-[var(--data-warning)]/30 bg-[var(--data-warning)]/10 px-4 py-3 text-sm font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          Hay más movimientos de los que entran acá.
        </div>
      )}

      {loading ? (
        <div className="space-y-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] animate-pulse" />
          ))}
        </div>
      ) : personas.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nadie tiene cuentas pendientes"
          hint="Cuando alguien tenga un adelanto abierto o un movimiento en la cuenta forestal, va a aparecer acá."
        />
      ) : (
        <ul className="space-y-3">
          {personas.map((p) => (
            <FilaCuentaPersona
              key={p.clave}
              persona={p}
              forestal={forestal}
              candidatos={candidatos.filter((c) => c.parteId !== p.parteId)}
              onVincular={vincularParte}
              onGoTab={onGoTab}
              puedeLiquidar={puedeLiquidar}
              onCambio={reload}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
