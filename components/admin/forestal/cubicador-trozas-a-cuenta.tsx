"use client";

/**
 * Lo que el adelanto no cubre va a la CUENTA de la persona (ADR-484): la vista
 * previa antes de aplicar y lo que quedó después (su cuenta y el valor de venta
 * del despacho). Sólo muestra: las cuentas las hace el servidor.
 */
import { AlertTriangle, Wallet } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatCurrency } from "@/lib/currency";
import { restoEnPalabras, textoValorVenta } from "@/lib/forestal/cubicacion-a-cuenta";
import type { SentidoCubicacion } from "@/lib/forestal/cubicacion-cuenta";
import type { CubicacionTrozas, CuentaDeLaPersona } from "./hooks/use-cubicaciones-trozas";

const AVISO = "flex items-start gap-1.5 text-sm font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]";

/** «te debe S/ 1 200» · «le debes S/ 300» · «al día», como «Cuenta por persona». */
function saldoEnPalabras(saldo: number): string {
  if (Math.abs(saldo) < 0.005) return "al día";
  return saldo > 0 ? `te debe ${formatCurrency(saldo)}` : `le debes ${formatCurrency(-saldo)}`;
}

/** Antes de aplicar: cuánto va a su cuenta y cómo queda; sin ficha en el directorio, por qué no se puede. */
export function ACuentaPrevia({
  sentido, resto, cuenta, nombre, hayAdelanto,
}: {
  sentido: SentidoCubicacion;
  resto: number;
  cuenta: CuentaDeLaPersona | null;
  nombre: string;
  /** Un adelanto cubre una parte: «lo que no cubre»; si no, «todo». */
  hayAdelanto: boolean;
}) {
  if (!cuenta) {
    return (
      <p role="alert" className={AVISO} data-dato="sin-cuenta">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        {nombre} no tiene ficha en el Directorio forestal: {hayAdelanto ? "lo que el adelanto no cubre" : "la madera"} ({formatCurrency(resto)}) no tiene cuenta donde quedar. Créale la ficha y vuelve aquí.
      </p>
    );
  }
  const despues = sentido === "venta" ? cuenta.saldo + resto : cuenta.saldo - resto;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[var(--rule-soft)] px-3 py-2 text-sm" data-dato="a-cuenta">
      <Wallet className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
      <span className="font-semibold text-[var(--text-primary)]">{hayAdelanto ? "Lo que no cubre, a su cuenta" : "A su cuenta"}</span>
      <span className="text-[var(--text-tertiary)]">{restoEnPalabras(sentido, resto)}</span>
      <InfoTip
        what={`Queda en la cuenta de ${cuenta.nombre} en el Directorio forestal, como una venta o una compra anotada.`}
        affects={`Su cuenta pasa de «${saldoEnPalabras(cuenta.saldo)}» a «${saldoEnPalabras(despues)}». Si anulas la cubicación, vuelve como estaba.`}
      />
      <span className="ml-auto font-bold tabular-nums text-[var(--text-primary)]">{sentido === "venta" ? "+" : "−"} {formatCurrency(resto)}</span>
    </div>
  );
}

/** Aplicada (o anulada): lo que quedó en su cuenta y qué pasó con el valor de venta del despacho. */
export function ACuentaHecha({ cub }: { cub: CubicacionTrozas }) {
  const anulada = cub.estado === "anulada";
  const valor = textoValorVenta(cub.valorVenta ?? null, cub.codigo);
  if (!cub.aCuenta && !valor) return null;
  return (
    <div className="space-y-1.5">
      {cub.aCuenta && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[var(--rule-soft)] px-3 py-2 text-sm" data-dato="quedo-en-cuenta">
          <Wallet className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
          <span className="font-semibold text-[var(--text-primary)]">{anulada ? "Había quedado en la cuenta de" : "Quedó en la cuenta de"} {cub.aCuenta.parteNombre}</span>
          <span className="text-[var(--text-tertiary)]">{restoEnPalabras(cub.aCuenta.sentido, cub.aCuenta.monto)}</span>
          <span className={`ml-auto font-bold tabular-nums ${anulada ? "text-[var(--text-tertiary)] line-through" : "text-[var(--text-primary)]"}`}>
            {cub.aCuenta.sentido === "venta" ? "+" : "−"} {formatCurrency(cub.aCuenta.monto)}
          </span>
        </div>
      )}
      {valor && !anulada && <p className="text-sm text-[var(--text-secondary)]" data-dato="valor-venta">{valor}</p>}
    </div>
  );
}
