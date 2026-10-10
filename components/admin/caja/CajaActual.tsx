"use client";

/**
 * Caja › Hoy: lo de la caja de hoy, una sección a la vez (`?sub=`).
 *  · Resumen (`hoy`): el aviso de exceso de efectivo y el parte del servidor
 *    —¿cuadra con las ventas? y de dónde vino el efectivo—.
 *  · Movimientos: lista o línea de tiempo, con sus filtros.
 *  · Medios de pago: ventas por medio, Yape/Plin contra la app y por hora.
 *  · Cuadrar: contar billetes y monedas contra el esperado.
 * Arriba de todas, en UNA fila: «Indicadores» (con el esperado adentro) y las
 * acciones de la caja abierta (ingreso, retiro, cerrar).
 *
 * Sin caja abierta no hay secciones que mirar: va `CajaCerrada` (último
 * cierre y los anteriores), y «Abrir caja» en la cabecera.
 */
import type { ReactNode } from "react";
import { WarningAlert } from "@buleje/design-system";
import { ArrowDown, ArrowUp, Lock } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import type { ParteDelDia } from "@/lib/caja/parte-del-dia";
import { CajaCerrada } from "./CajaCerrada";
import { CajaContar } from "./CajaContar";
import { CajaCuadreDelDia } from "./CajaCuadreDelDia";
import { CajaMovimientos } from "./CajaMovimientos";
import { CajaPorMedio } from "./CajaPorMedio";
import { useIndicadoresCaja } from "./use-indicadores-caja";
import type { DatosCaja } from "./use-caja-registradora";
import { fmt, type CashRegister, type VistaCaja } from "./tipos";

interface Props {
  vista: VistaCaja;
  datos: DatosCaja;
  parte: { parte: ParteDelDia | null; cargando: boolean; error: string | null; releer: () => void };
  puedeCambiarMedio: boolean;
  onMovimiento: (tipo: "ingreso" | "egreso") => void;
  onCerrarCaja: () => void;
  onVerCaja: (r: CashRegister) => void;
  onIrA: (v: VistaCaja) => void;
  /** Cambia cuando un arqueo hecho desde «Más» termina: el contador se vuelve a montar y relee. */
  versionConteo: number;
  /** «Más» va en la fila de las acciones de la caja abierta (en la cabecera no entraba). */
  mas: ReactNode;
}

const BOTON_ACCION = "inline-flex min-h-12 items-center gap-1.5 rounded-xl px-4 text-sm font-bold transition-colors";

export function CajaActual(props: Props) {
  const { datos, onVerCaja, onIrA } = props;
  const caja = datos.currentRegister;
  if (!caja) {
    return <CajaCerrada cerradas={datos.closedRegisters} tolerancia={datos.cashTolerance} onVerCaja={onVerCaja} onVerHistorial={() => onIrA("historial")} />;
  }
  return <CajaAbierta {...props} caja={caja} />;
}

function CajaAbierta({ vista, datos, parte, puedeCambiarMedio, onMovimiento, onCerrarCaja, onIrA, versionConteo, mas, caja }: Props & { caja: CashRegister }) {
  const { stats, timeline, paymentBreakdown, cashAlertMax, fetchData } = datos;
  const indicadores = useIndicadoresCaja(caja.openingAmount, stats);
  const efectivo = stats?.expectedCash ?? 0;

  return (
    <div className="space-y-4">
      {/* Una fila que fluye: en el celular los botones siguen al de indicadores en vez de bajar en bloque. */}
      <div className="flex flex-wrap items-center gap-2">
        {indicadores.boton}
        <span className="hidden flex-1 sm:block" aria-hidden />
        <button type="button" title="Ingreso (tecla I)" onClick={() => onMovimiento("ingreso")} className={`${BOTON_ACCION} bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] hover:bg-[var(--data-success-500)]/20 dark:text-[var(--data-success-500)]`}>
          <ArrowUp className="h-4 w-4" aria-hidden /> Ingreso
        </button>
        <button type="button" title="Retiro (tecla R)" onClick={() => onMovimiento("egreso")} className={`${BOTON_ACCION} bg-[var(--data-error-500)]/10 text-[var(--data-error-700)] hover:bg-[var(--data-error-500)]/20 dark:text-[var(--data-error-500)]`}>
          <ArrowDown className="h-4 w-4" aria-hidden /> Retiro
        </button>
        <button type="button" onClick={onCerrarCaja} className={button({ variant: "primary", className: "rounded-xl" })}>
          <Lock className="h-4 w-4" aria-hidden /> Cerrar caja
        </button>
        {mas}
      </div>
      {indicadores.panel}

      {vista === "hoy" && (
        <>
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
                <button type="button" onClick={() => onMovimiento("egreso")} className="min-h-12 shrink-0 rounded-xl bg-[var(--data-warning-700)] px-4 text-sm font-bold text-white transition-opacity hover:opacity-90">
                  Registrar retiro
                </button>
              }
            />
          )}
          <CajaCuadreDelDia parte={parte.parte} cargando={parte.cargando} error={parte.error} onReintentar={parte.releer} />
        </>
      )}
      {vista === "movimientos" && (
        <CajaMovimientos caja={caja} timeline={timeline} efectivoActual={efectivo} puedeCambiarMedio={puedeCambiarMedio} onCambiado={() => void fetchData()} />
      )}
      {vista === "medios" && <CajaPorMedio breakdown={paymentBreakdown} stats={stats} />}
      {vista === "cuadrar" && <CajaContar key={versionConteo} onIrACaja={() => onIrA("hoy")} />}
    </div>
  );
}
