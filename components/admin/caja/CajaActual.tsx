"use client";

/**
 * Vista «Actual» de la caja, en el orden en que se pregunta:
 *  1. ¿Cuánto debería haber? — indicadores + las acciones de uso constante.
 *  2. ¿Hay que sacar plata? — alerta de exceso de efectivo (una línea).
 *  3. ¿Cuadra con las ventas y de dónde vino? — el parte del servidor.
 *  4. El detalle — movimientos (lista o línea de tiempo) y ventas por medio.
 * Sin caja abierta: una tarjeta con «Abrir caja» y el último cierre.
 */
import { WarningAlert } from "@buleje/design-system";
import { ArrowDown, ArrowUp, Lock, Unlock } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { ParteDelDia } from "@/lib/caja/parte-del-dia";
import { cn } from "@/lib/utils";
import { CajaCuadreDelDia } from "./CajaCuadreDelDia";
import { CajaIndicadores } from "./CajaIndicadores";
import { CajaMovimientos } from "./CajaMovimientos";
import { CajaPorMedio } from "./CajaPorMedio";
import type { DatosCaja } from "./use-caja-registradora";
import { BOTON_PRIMARIO, fmt, fmtDate, type CashRegister } from "./tipos";

interface Props {
  datos: DatosCaja;
  parte: { parte: ParteDelDia | null; cargando: boolean; error: string | null; releer: () => void };
  puedeCambiarMedio: boolean;
  onAbrir: () => void;
  onMovimiento: (tipo: "ingreso" | "egreso") => void;
  onCerrarCaja: () => void;
  onVerCaja: (r: CashRegister) => void;
}

const BOTON_ACCION = "inline-flex items-center gap-1.5 px-3 min-h-10 rounded-xl text-sm font-bold transition-colors";

export function CajaActual({ datos, parte, puedeCambiarMedio, onAbrir, onMovimiento, onCerrarCaja, onVerCaja }: Props) {
  const { currentRegister: caja, stats, timeline, paymentBreakdown, cashAlertMax, closedRegisters, fetchData } = datos;

  if (!caja) {
    const ultima = closedRegisters[0];
    return (
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-5 sm:p-6 flex flex-wrap items-center gap-4">
        <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Lock className="h-6 w-6 text-primary" strokeWidth={1.75} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-[var(--text-primary)]">Caja cerrada</p>
          <p className="text-sm text-[var(--text-tertiary)]">
            {ultima ? (
              <>
                Último cierre: {fmtDate(ultima.closedAt ?? ultima.openedAt)} con {fmt(ultima.closingAmount ?? 0)}{" "}
                <span className={cn("font-semibold", Math.abs(ultima.difference ?? 0) <= datos.cashTolerance ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>
                  ({(ultima.difference ?? 0) >= 0 ? "+" : "−"}
                  {fmt(Math.abs(ultima.difference ?? 0))})
                </span>{" "}
                <button type="button" onClick={() => onVerCaja(ultima)} className="font-semibold text-primary hover:underline">
                  Ver parte
                </button>
              </>
            ) : (
              "Abre una caja para registrar las ventas en efectivo del día."
            )}
          </p>
        </div>
        <button type="button" onClick={onAbrir} className={`${BOTON_PRIMARIO} min-h-11 px-6 text-base`}>
          <Unlock className="h-5 w-5" aria-hidden /> Abrir caja
        </button>
      </div>
    );
  }

  const efectivo = stats?.expectedCash ?? 0;

  return (
    <div className="space-y-4">
      <CajaIndicadores
        apertura={caja.openingAmount}
        stats={stats}
        acciones={
          <>
            <button type="button" title="Ingreso (tecla I)" onClick={() => onMovimiento("ingreso")} className={`${BOTON_ACCION} bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] hover:bg-[var(--data-success-500)]/20`}>
              <ArrowUp className="h-4 w-4" aria-hidden /> Ingreso
            </button>
            <button type="button" title="Retiro (tecla R)" onClick={() => onMovimiento("egreso")} className={`${BOTON_ACCION} bg-[var(--data-error-500)]/10 text-[var(--data-error-500)] hover:bg-[var(--data-error-500)]/20`}>
              <ArrowDown className="h-4 w-4" aria-hidden /> Retiro
            </button>
            <button type="button" onClick={onCerrarCaja} className={`${BOTON_ACCION} bg-[var(--text-primary)] text-[var(--surface-canvas)] hover:opacity-90`}>
              <Lock className="h-4 w-4" aria-hidden /> Cerrar caja
            </button>
          </>
        }
      />

      {/* Mejora 7: alerta de exceso de efectivo (umbral de Configuración → Caja). */}
      {efectivo > cashAlertMax && (
        <WarningAlert
          title={
            <span className="inline-flex items-center gap-1.5">
              Hay unos {fmt(efectivo)} en efectivo en el cajón
              <InfoTip what={`Pasa el tope de ${fmt(cashAlertMax)} que pusiste en Configuración → Caja.`} affects="Un retiro parcial reduce lo que se pierde si hay un robo." />
            </span>
          }
          action={
            <button type="button" onClick={() => onMovimiento("egreso")} className="px-3 min-h-9 rounded-lg bg-[var(--data-warning-500)] text-white text-xs font-bold hover:opacity-90 transition-opacity shrink-0">
              Registrar retiro
            </button>
          }
        />
      )}

      <CajaCuadreDelDia parte={parte.parte} cargando={parte.cargando} error={parte.error} onReintentar={parte.releer} />

      <CajaMovimientos caja={caja} timeline={timeline} efectivoActual={efectivo} puedeCambiarMedio={puedeCambiarMedio} onCambiado={() => void fetchData()} />

      <CajaPorMedio breakdown={paymentBreakdown} stats={stats} />
    </div>
  );
}
