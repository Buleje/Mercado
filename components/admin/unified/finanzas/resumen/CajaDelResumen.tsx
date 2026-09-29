"use client";

/**
 * La caja abierta, en una línea: desde cuándo, cuánto efectivo espera y qué
 * hacer si el número no puede existir.
 *
 * Reemplaza al efectivo inventado del Resumen (`ingresos * 0.3`). En el negocio
 * real (2026-09-28) la misma caja lleva abierta desde el 11/06 y espera
 * −S/ 6 424: eso no es «poca plata», es una caja que hay que arquear. Si no hay
 * caja abierta se dice; no se rellena con un número.
 */

import { Wallet, RefreshCw } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { avisoCajaAbierta, fechaCortaLima } from "@/lib/caja/caja-abierta";
import type { UsoCajaAbierta } from "@/hooks/use-caja-abierta";

const soles = (v: number) => `${v < 0 ? "−" : ""}${formatCurrency(Math.abs(v))}`;

/** Salto a «Cuadrar caja» dentro de Ventas y caja. */
function irACuadrarCaja() {
  window.dispatchEvent(new CustomEvent("admin:navigate", { detail: { tab: "ventas-caja", vista: "arqueo" } }));
}

type Tono = "neutro" | "aviso" | "error";
const TONO: Record<Tono, { caja: string; icono: string; frase: string }> = {
  neutro: { caja: "border-[var(--rule-base)] bg-[var(--surface-raised)]", icono: "text-[var(--text-tertiary)]", frase: "text-[var(--text-primary)]" },
  aviso: { caja: "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10", icono: "text-[var(--data-warning-ink)]", frase: "text-[var(--data-warning-ink)]" },
  error: { caja: "border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10", icono: "text-[var(--data-error-ink)]", frase: "text-[var(--data-error-ink)]" },
};

function Linea({ tono, children }: { tono: Tono; children: React.ReactNode }) {
  return (
    <div
      role="status"
      data-testid="caja-del-resumen"
      className={cn("flex items-start gap-2 rounded-xl border px-3 py-2 text-sm text-[var(--text-primary)]", TONO[tono].caja)}
    >
      {/* El ícono va aparte del texto: a 400 px, con el texto en flex-wrap, quedaba solo en su renglón. */}
      <Wallet className={cn("mt-2 h-4 w-4 shrink-0", TONO[tono].icono)} aria-hidden />
      <div className="flex min-h-9 min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">{children}</div>
    </div>
  );
}

const BOTON = "ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors";

export default function CajaDelResumen({ caja, cargando, error, recargar }: UsoCajaAbierta) {
  if (cargando && !caja) {
    return <div className="h-11 rounded-xl bg-[var(--surface-sunken)] animate-pulse" aria-label="Cargando la caja" />;
  }

  if (error || !caja) {
    return (
      <Linea tono="neutro">
        <span>No se pudo leer la caja.</span>
        <button type="button" onClick={recargar} className={BOTON}>
          <RefreshCw className="h-4 w-4" aria-hidden /> Reintentar
        </button>
      </Linea>
    );
  }

  if (!caja.abierta) {
    return (
      <Linea tono="neutro">
        <span className="font-semibold">No hay una caja abierta</span>
        <span className="text-[var(--text-secondary)]">· el resumen no muestra efectivo</span>
        <InfoTip
          title="Efectivo del negocio"
          what="Sale de la caja abierta: apertura + ventas en efectivo + ingresos − egresos."
          affects="Sin caja abierta no hay un monto que afirmar, así que la liquidez queda sin dato."
          example="Abre la caja en Ventas y caja al empezar el día y ciérrala al terminar."
        />
      </Linea>
    );
  }

  const aviso = avisoCajaAbierta(caja.desde);
  const desde = `abierta desde el ${fechaCortaLima(caja.desde)}${aviso ? ` (${aviso.dias} ${aviso.dias === 1 ? "día" : "días"})` : ""}`;
  const cuenta = `Apertura ${soles(caja.apertura)} + ventas en efectivo ${soles(caja.ventasEfectivo)} + ingresos ${soles(caja.ingresos)} − egresos ${soles(caja.egresos)} = ${soles(caja.esperado)}.`;

  if (caja.veredicto === "imposible") {
    return (
      <Linea tono="error">
        <span className={cn("font-semibold", TONO.error.frase)}>Cierra o arquea la caja: espera un saldo negativo</span>
        <span className="font-semibold tabular-nums">{soles(caja.esperado)}</span>
        <span className="text-[var(--text-secondary)]">· {desde}</span>
        <InfoTip
          title="Caja con saldo imposible"
          what={cuenta}
          affects="Una caja física no puede tener plata negativa: mientras no se cuadre, el resumen no toma este monto como efectivo y la liquidez queda sin dato."
          example="Pasa cuando se pagan adelantos o compras desde la caja sin registrar la plata que entró. Cuenta el efectivo, registra lo que falte y ciérrala."
        />
        <button type="button" onClick={irACuadrarCaja} className={BOTON}>Cuadrar caja</button>
      </Linea>
    );
  }

  const vieja = aviso !== null;
  return (
    <Linea tono={vieja ? "aviso" : "neutro"}>
      <span className={cn("font-semibold", vieja && TONO.aviso.frase)}>
        {vieja ? "Arquea y cierra la caja" : "Caja abierta hoy"}
      </span>
      <span className="tabular-nums">· espera {soles(caja.esperado)} en efectivo</span>
      {vieja && <span className="text-[var(--text-secondary)]">· {desde}</span>}
      <InfoTip
        title="Efectivo esperado en caja"
        what={cuenta}
        affects="Es lo que debería haber si se cuenta ahora. Alimenta la liquidez del resumen."
        example={vieja ? "Una caja abierta desde otro día junta ventas de varios días en un solo cuadre." : "Al cerrar, el sistema compara este monto con lo que cuentes."}
      />
      {vieja && <button type="button" onClick={irACuadrarCaja} className={BOTON}>Cuadrar caja</button>}
    </Linea>
  );
}
