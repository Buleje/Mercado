"use client";

/**
 * El turno abierto: quién atiende, desde cuándo, con cuánto abrió y lo vendido
 * EN VIVO por medio de pago (antes decía «Ventas S/ 0.00» hasta el cierre).
 *
 * 10-10: los datos van sueltos en una fila, no en tarjetas dentro de la
 * tarjeta, y sin «Atiende» (lo dice la línea de arriba).
 */
import { Clock, DollarSign, Receipt, ShoppingCart, Square } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { formatCurrency, formatTime } from "@/lib/format";
import { elapsedTime, type ResumenServidor, type Turno } from "./tipos";

type Props = {
  turno: Turno;
  operador: string;
  enVivo: ResumenServidor | null;
  onCerrar: () => void;
};

function Dato({ icono: Icono, rotulo, valor, tono }: { icono: typeof Clock; rotulo: string; valor: React.ReactNode; tono?: "exito" }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text-secondary)]">
        <Icono className="h-4 w-4" aria-hidden />{rotulo}
      </dt>
      <dd className={`text-lg font-extrabold tabular-nums truncate ${tono === "exito" ? "text-[var(--data-success-ink)]" : "text-[var(--text-primary)]"}`}>{valor}</dd>
    </div>
  );
}

export function TurnoActivoPanel({ turno, operador, enVivo, onCerrar }: Props) {
  const vendido = enVivo?.totalVendido ?? turno.ventasTotal;
  return (
    <section aria-label="Turno abierto" className="rounded-xl border-2 border-[var(--data-success-500)]/30 bg-primary/10 dark:bg-primary/15 p-4 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="h-10 w-10 rounded-xl bg-[var(--data-success-500)] flex items-center justify-center shrink-0" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--surface-raised)] animate-pulse" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-extrabold text-[var(--text-primary)]">
            Abierto hace {elapsedTime(turno.abrioEn)}
          </p>
          <p className="text-sm text-[var(--text-secondary)]">
            {operador} · desde las {formatTime(turno.abrioEn)}
          </p>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          className={button({ variant: "danger", className: "rounded-xl shrink-0" })}
        >
          <Square className="h-4 w-4" aria-hidden />
          Cerrar turno
        </button>
      </div>

      <dl className="grid grid-cols-3 gap-3 border-t border-[var(--data-success-500)]/20 pt-3">
        <Dato icono={DollarSign} rotulo="Efectivo inicial" valor={formatCurrency(turno.inicioEfectivo)} />
        <Dato icono={ShoppingCart} rotulo="Vendido" valor={formatCurrency(vendido)} tono="exito" />
        <Dato icono={Receipt} rotulo="Ventas" valor={enVivo ? enVivo.cantidadVentas : "—"} />
      </dl>

      {enVivo && enVivo.metodosPago.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--text-secondary)]">
            Por medio de pago
            <InfoTip
              title="Ventas del turno por medio de pago"
              what="Lo cobrado desde que se abrió el turno, sumado por el servidor. Se actualiza cada minuto."
              affects="Sólo el efectivo entra al cajón: Yape, Plin y tarjeta no cuentan para el esperado del cierre."
            />
          </span>
          {enVivo.metodosPago.map((mp) => (
            <span key={mp.metodo} className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-raised)] border border-[var(--rule-base)] px-3 py-1 text-sm">
              <span className="text-[var(--text-secondary)]">{mp.metodo}</span>
              <span className="font-bold tabular-nums text-[var(--text-primary)]">{formatCurrency(mp.total)}</span>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
