"use client";

/**
 * Lo que entró y salió de la caja en el mes, por fuente, cada peso una vez
 * (ADR-451): la liquidación por su pago y no por sus movimientos, el retiro de
 * caja de un adelanto dentro del adelanto. Los movimientos a mano de la caja
 * registradora se MUESTRAN y no se suman (suelen ser la otra cara de un gasto);
 * los cruces y entregas en especie nunca fueron plata.
 */

import { CardTitle } from "@buleje/design-system";
import { ChevronRight } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CajaDelMes as Caja, FuenteDetalle, RenglonCaja } from "@/lib/finance/resultado-del-negocio";
import AvisosDelMes from "@/components/admin/unified/finanzas/resultado/AvisosDelMes";
import ColumnaRenglones, { type FilaDeCifra } from "@/components/admin/unified/finanzas/resultado/ColumnaRenglones";
import { esAproximado, montoTexto, nombreMes } from "@/components/admin/unified/finanzas/resultado/fuentes";

const aFila = (r: RenglonCaja): FilaDeCifra => ({
  fuente: r.fuente,
  monto: r.monto,
  aproximado: esAproximado(r.certeza),
  cuantos: r.cuantos,
  medida: null,
  faltan: null,
  nota: r.nota,
});

const movs = (n: number) => `${formatNumber(n, 0)} ${n === 1 ? "movimiento" : "movimientos"}`;

export default function CajaDelMes({ caja, onAbrir }: { caja: Caja; onAbrir: (f: FuenteDetalle) => void }) {
  const nombre = nombreMes(caja.mes);
  const entroAprox = caja.entro.some((r) => esAproximado(r.certeza));
  const salioAprox = caja.salio.some((r) => esAproximado(r.certeza));
  /* El aviso de los movimientos a mano ya es la línea «Sin sumar»: no se repite. */
  const avisos = caja.avisos.filter((a) => a.codigo !== "caja_manual_sin_sumar");

  return (
    <div className="@container overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--rule-base)] px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <CardTitle as="h3">Caja de {nombre}</CardTitle>
            <InfoTip
              title="Lo que entró y salió de verdad"
              what="La plata que entró y salió en el mes, por de dónde vino. Cada sol se cuenta una vez."
              affects="No es lo ganado: un aserrío de setiembre que te pagan en octubre entra a la caja en octubre."
              example="Una liquidación entra por lo que te pagaron, no por cada movimiento de la cuenta."
            />
          </div>
          <p
            className={cn(
              "text-2xl font-extrabold tabular-nums",
              caja.neto >= 0 ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
            )}
          >
            {montoTexto(caja.neto, { aproximado: caja.estimado, signo: true })}
          </p>
          <p className="text-xs text-[var(--text-secondary)]">Neto del mes: entró menos salió</p>
        </div>
      </div>

      <div className="grid gap-5 px-3 py-4 @xl:grid-cols-2 sm:px-4">
        <ColumnaRenglones
          titulo="Entró"
          total={caja.totalEntro}
          aproximado={entroAprox}
          filas={caja.entro.map(aFila)}
          vacio={`No entró plata en ${nombre}.`}
          onAbrir={onAbrir}
        />
        <ColumnaRenglones
          titulo="Salió"
          total={caja.totalSalio}
          aproximado={salioAprox}
          filas={caja.salio.map(aFila)}
          vacio={`No salió plata en ${nombre}.`}
          onAbrir={onAbrir}
        />
      </div>

      {(caja.sinSumar.cuantos > 0 || caja.nuncaCaja.cuantos > 0 || avisos.length > 0 || caja.otrasMonedas.length > 0) && (
        <div className="space-y-2 border-t border-[var(--rule-base)] px-4 py-3 text-sm sm:px-5">
          {caja.sinSumar.cuantos > 0 && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-semibold text-[var(--text-primary)]">Sin sumar:</span>
              <span className="text-[var(--text-secondary)] tabular-nums">
                {movs(caja.sinSumar.cuantos)} a mano en la caja · entraron {montoTexto(caja.sinSumar.ingresos)} · salieron{" "}
                {montoTexto(caja.sinSumar.egresos)}
              </span>
              <InfoTip title="Movimientos a mano en la caja" what={caja.sinSumar.nota} />
              <button
                type="button"
                onClick={() => onAbrir("caja_sin_sumar")}
                aria-label="Ver los movimientos a mano en la caja"
                className="inline-flex min-h-8 items-center gap-0.5 rounded-md px-1.5 text-xs font-semibold text-[var(--text-primary)] underline decoration-[var(--rule-strong)] underline-offset-2 hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                Ver <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          )}
          {caja.nuncaCaja.cuantos > 0 && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-semibold text-[var(--text-primary)]">No es caja:</span>
              <span className="text-[var(--text-secondary)] tabular-nums">
                {formatNumber(caja.nuncaCaja.cuantos, 0)} {caja.nuncaCaja.cuantos === 1 ? "cruce o entrega" : "cruces y entregas"} por{" "}
                {montoTexto(caja.nuncaCaja.monto)}
              </span>
              <InfoTip title="Cruces y entregas" what={caja.nuncaCaja.nota} />
            </div>
          )}
          <AvisosDelMes avisos={avisos} otrasMonedas={caja.otrasMonedas} onAbrir={onAbrir} />
        </div>
      )}
    </div>
  );
}
