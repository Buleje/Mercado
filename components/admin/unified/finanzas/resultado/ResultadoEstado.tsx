"use client";

/**
 * El estado del mes: arriba el Resultado (lo que se mira primero), debajo
 * Ingresos y Costos lado a lado —una columna en el celular—, y al pie la compra
 * de madera y los avisos. Todo llega armado del servidor (ADR-451): acá no se
 * suma nada, sólo se decide cómo se lee.
 */

import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import type { FuenteDetalle, PuntoSerie, Renglon, ResultadoDelMes } from "@/lib/finance/resultado-del-negocio";
import AvisosDelMes, { MemoCompras } from "./AvisosDelMes";
import ColumnaRenglones, { type FilaDeCifra } from "./ColumnaRenglones";
import { esAproximado, medidaTexto, montoTexto, nombreMes } from "./fuentes";

const aFila = (r: Renglon): FilaDeCifra => ({
  fuente: r.fuente,
  monto: r.monto,
  aproximado: esAproximado(r.certeza),
  cuantos: r.cuantos,
  medida: medidaTexto(r.pt, r.m3),
  faltan: r.faltan,
  nota: r.nota,
});

const CHIP = "inline-flex min-h-7 items-center rounded-full border px-2.5 text-xs font-bold text-[var(--text-primary)]";

export default function ResultadoEstado({
  actual,
  anterior,
  onAbrir,
}: {
  actual: ResultadoDelMes;
  /** El mes anterior de la tira, para comparar. */
  anterior: PuntoSerie | null;
  onAbrir: (f: FuenteDetalle) => void;
}) {
  const nombre = nombreMes(actual.mes);
  const ganando = actual.resultado >= 0;
  /* Si un renglón es ≈, su columna también (sólo el rótulo: el total es del servidor). */
  const ingresosAprox = actual.ingresos.some((r) => esAproximado(r.certeza));
  const costosAprox = actual.costos.some((r) => esAproximado(r.certeza));
  const avisoCierre = actual.avisos.find((a) => a.codigo === "mes_cerrado_puede_moverse");
  const avisos = actual.cerradoCtp ? actual.avisos.filter((a) => a !== avisoCierre) : actual.avisos;

  return (
    <div className="@container overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--rule-base)] px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-sm font-bold" as="h3">Resultado de {nombre}</CardTitle>
            <InfoTip
              title="Resultado del mes"
              what="Lo que ganaste en el mes: lo que vendiste y cobraste por aserrío, menos lo que te costó."
              affects="«≈» quiere decir que alguna cifra es estimada o le falta un dato. Toca un renglón para ver sus filas."
              example="El aserrío de una corrida del 10/09 cuenta en setiembre aunque te lo paguen en octubre."
            />
          </div>
          <p
            className={cn(
              "text-2xl font-extrabold tabular-nums",
              ganando ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
            )}
          >
            {montoTexto(actual.resultado, { aproximado: actual.estimado, signo: true })}
          </p>
          {anterior && (
            <p className="text-xs text-[var(--text-secondary)] tabular-nums">
              En {nombreMes(anterior.mes)}: {montoTexto(anterior.resultado, { aproximado: anterior.estimado, signo: true })}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              CHIP,
              ganando ? "border-[var(--data-success-500)] bg-[var(--data-success-500)]/10" : "border-[var(--data-error-500)] bg-[var(--data-error-500)]/10",
            )}
          >
            {ganando ? "Ganando" : "Perdiendo"}
          </span>
          {actual.cerradoCtp && (
            <span className="inline-flex items-center gap-1">
              <span className={cn(CHIP, "border-[var(--rule-strong)] bg-[var(--surface-sunken)]")}>Mes cerrado</span>
              <InfoTip
                title="Mes cerrado en el Libro"
                what={avisoCierre?.texto ?? "El mes está cerrado en el Libro CTP, pero el cobro de un aserrío se puede cambiar después del cierre."}
                affects="Este resultado todavía se puede mover."
              />
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-5 px-3 py-4 @xl:grid-cols-2 sm:px-4">
        <ColumnaRenglones
          titulo="Ingresos"
          total={actual.totalIngresos}
          aproximado={ingresosAprox}
          filas={actual.ingresos.map(aFila)}
          vacio={`No hubo ingresos en ${nombre}.`}
          onAbrir={onAbrir}
        />
        <ColumnaRenglones
          titulo="Costos"
          total={actual.totalCostos}
          aproximado={costosAprox}
          filas={actual.costos.map(aFila)}
          vacio={`No hubo costos en ${nombre}.`}
          onAbrir={onAbrir}
        />
      </div>

      {(actual.memo.cuantas + actual.memo.sinCosto > 0 || avisos.length > 0 || actual.otrasMonedas.length > 0) && (
        <div className="space-y-2 border-t border-[var(--rule-base)] px-4 py-3 sm:px-5">
          <MemoCompras memo={actual.memo} onAbrir={onAbrir} />
          <AvisosDelMes avisos={avisos} otrasMonedas={actual.otrasMonedas} onAbrir={onAbrir} />
        </div>
      )}
    </div>
  );
}
