"use client";

/**
 * La tarjeta «A pagar»: el total del mes, cuándo vence y en qué quedó la
 * declaración; debajo, una fila por tributo con su fórmula en el ⓘ.
 */
import { AlertTriangle, CalendarDays, Loader2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ventanaVencimientoReferencial } from "@/lib/tax/obligaciones-peru";
import { textoExoneradas } from "@/components/admin/unified/finanzas/resumen/igv";
import { mesDeVencimiento, nombreDelMes, textoTasa, type ImpuestosDelMes } from "./impuestos-del-mes";
import type { EstadoDeclaracion } from "./use-impuestos";

const ESTADO: Record<EstadoDeclaracion, { rotulo: string; clase: string }> = {
  pendiente: { rotulo: "Pendiente", clase: "bg-[var(--data-warning-500)]/12 text-[var(--data-warning-ink)]" },
  presentada: { rotulo: "Presentada", clase: "bg-[var(--data-8)]/12 text-[var(--text-primary)]" },
  pagada: { rotulo: "Pagada", clase: "bg-[var(--data-success-500)]/12 text-[var(--data-success-ink)]" },
};

function Fila({ rotulo, ayuda, children }: { rotulo: string; ayuda: string; children: React.ReactNode }) {
  return (
    <li className="flex min-h-12 items-center gap-2 py-2">
      <span className="text-sm font-semibold text-[var(--text-primary)]">{rotulo}</span>
      <InfoTip what={ayuda} />
      <span className="ml-auto text-right">{children}</span>
    </li>
  );
}

const MONTO = "text-base font-bold tabular-nums text-[var(--text-primary)]";
const SIN_DATO = "text-sm text-[var(--text-secondary)]";

export default function ApagarDelMes({
  mes, calculo, cargando, error, estado, regimen, ruc, onRuc, onReintentar,
}: {
  mes: string;
  calculo: ImpuestosDelMes | null;
  cargando: boolean;
  error: boolean;
  estado: EstadoDeclaracion;
  regimen: string;
  ruc: string;
  onRuc: () => void;
  onReintentar: () => void;
}) {
  if (error) {
    return (
      <p role="alert" className="flex items-center gap-2 py-6 text-sm text-[var(--data-error-ink)]">
        <AlertTriangle className="h-4 w-4" aria-hidden /> No se pudieron leer los ingresos del mes.
        <button type="button" onClick={onReintentar} className="h-12 rounded-xl px-3 font-semibold text-[var(--accent-ink)] hover:bg-[var(--surface-sunken)]">Reintentar</button>
      </p>
    );
  }
  if (cargando || !calculo) {
    return (
      <p className="flex items-center gap-2 py-8 text-sm text-[var(--text-secondary)]" aria-live="polite">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Calculando el mes…
      </p>
    );
  }

  const venc = ventanaVencimientoReferencial(ruc);
  const l = calculo.lecturaIgv;
  const igvTexto =
    !l ? "No se pudo leer"
    : l.tipo === "sin_registro" ? "Sin IGV registrado"
    : l.tipo === "exoneradas" ? textoExoneradas(l.facturas)
    : null;
  const igvAyuda =
    l?.tipo === "registrado"
      ? `IGV de ${l.comprobantes} comprobantes (${formatCurrency(l.debito)}) − IGV de ${l.conIgv} de ${l.gastos} gastos (${formatCurrency(l.credito)}).${calculo.saldoAFavor > 0 ? ` Saldo a favor de ${formatCurrency(calculo.saldoAFavor)}: pasa al mes siguiente.` : ""}`
      : "Sin comprobantes electrónicos ni gastos con su IGV anotado, no se estima con el 18 %. En la Amazonía muchas ventas están exoneradas (Ley 27037): consulta con tu contador.";

  return (
    <section aria-label={`A pagar por ${nombreDelMes(mes)}`} className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <p className="text-sm text-[var(--text-secondary)]">A pagar por {nombreDelMes(mes)}</p>
          <p className="text-3xl font-bold tabular-nums text-[var(--text-primary)]">{formatCurrency(calculo.total)}</p>
        </div>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
            <CalendarDays className="h-4 w-4" aria-hidden /> Vence
          </p>
          {venc ? (
            <p className="flex items-center gap-1.5 text-base font-semibold text-[var(--text-primary)]">
              {venc.rango.replace("del mes siguiente", `de ${mesDeVencimiento(mes)}`)}
              <InfoTip what={`RUC terminado en ${venc.ultimoDigito}. Es referencial: confirma la fecha en el cronograma oficial de SUNAT.`} />
            </p>
          ) : (
            <button type="button" onClick={onRuc} className="h-12 rounded-xl px-2 -mx-2 text-base font-semibold text-[var(--accent-ink)] hover:bg-[var(--surface-sunken)] dark:text-[var(--accent)]">
              Agrega tu RUC para ver la fecha
            </button>
          )}
        </div>
        <span className={cn("ml-auto inline-flex h-8 items-center rounded-full px-3 text-sm font-semibold", ESTADO[estado].clase)}>
          {ESTADO[estado].rotulo}
        </span>
      </div>

      <ul className="mt-3 divide-y divide-[var(--rule-soft)] border-t border-[var(--rule-soft)]">
        <Fila rotulo="IGV" ayuda={igvAyuda}>
          {igvTexto ? <span className={SIN_DATO}>{igvTexto}</span> : <span className={MONTO}>{formatCurrency(calculo.igvAPagar)}</span>}
        </Fila>
        {calculo.esNrus ? (
          <Fila rotulo="Cuota del Nuevo RUS" ayuda="Cuota fija mensual según tu categoría: S/ 20 o S/ 50. No es un porcentaje de lo que vendes.">
            <span className={SIN_DATO}>Cuota fija</span>
          </Fila>
        ) : (
          <Fila
            rotulo="Renta (pago a cuenta)"
            ayuda={`${textoTasa(calculo.tasaRenta)} × ingresos netos del mes (${formatCurrency(calculo.baseRenta)}), ${regimen}.${calculo.rentaEstimada ? " En el Régimen General manda el coeficiente del año anterior si es mayor: esto es el piso." : ""}`}
          >
            <span className={MONTO}>{formatCurrency(calculo.renta)}</span>
          </Fila>
        )}
      </ul>
    </section>
  );
}
