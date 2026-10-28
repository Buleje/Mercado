"use client";

/**
 * La cabecera del patio (Trozas, y Volumen disponible › Por troza).
 *
 * Compactación del libro (Brandon 2026-10-17): «los botones… al lado de las
 * pestañas en la esquina». Dentro del libro todo va al riel —ⓘ, «Sin título
 * declarado», «Plan del día», el último conteo y actualizar— y la vista
 * arranca en el escáner. Debajo de 80rem de riel quedan sólo los íconos con
 * su `title`; «Sin título» conserva su número: es una deuda, no un adorno.
 */

import { Axe, RefreshCw, ShieldAlert } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { CLASE_TEXTO_ACCION, TextoDeAccion } from "@/components/admin/shared/libro-acciones-vista";
import { cn } from "@/lib/utils";
import CtpConteosPatio from "./CtpConteosPatio";
import CtpGuiasSinRecibir from "./CtpGuiasSinRecibir";
import { BTN_ACCION_RIEL, CabeceraDeVista } from "./ctp-cabecera-vista";
import { BTN_ICONO_RIEL } from "./ctp-riel-piezas";
import { n2 } from "./ctp-trozas-ui";

export default function CtpTrozasCabecera({
  sinTitulo,
  m3SinTitulo,
  cargando,
  onVerSinTitulo,
  onVerPlan,
  onRecargar,
  sinInfo = false,
}: {
  /** Piezas paradas sin título habilitante (de TODO el patio, no del recorte). */
  sinTitulo: number;
  m3SinTitulo: number;
  cargando: boolean;
  onVerSinTitulo: () => void;
  onVerPlan: () => void;
  onRecargar: () => void;
  /** Dentro de Volumen › Por troza el ⓘ del apartado ya lo explica: uno solo. */
  sinInfo?: boolean;
}) {
  const fraseSinTitulo = `Sin título declarado: ${sinTitulo} ${sinTitulo === 1 ? "pieza" : "piezas"}, ${n2(m3SinTitulo)} m³. Ver cuáles y de qué guía`;
  return (
    <CabeceraDeVista
      titulo="El patio, troza por troza"
      info={
        sinInfo ? undefined : <InfoTip
          title="El patio, troza por troza"
          what="Qué hay parado hoy, qué se puede llevar a la sierra y qué lleva demasiado tiempo esperando."
          affects="Consumos cuenta m³ por guía; acá la unidad es la pieza. Toca una fila para ver su ficha y recorrer las demás con ‹ ›."
          example="Filtra «Días en el patio» desde 60 para ver las que ya se manchan."
        />
      }
    >
      {/* La deuda de origen legal, a la vista aunque los indicadores estén
          plegados. Sólo cuando existe: un cero en verde sería una
          felicitación que nadie pidió. */}
      {sinTitulo > 0 && (
        <button
          type="button"
          onClick={onVerSinTitulo}
          title={fraseSinTitulo}
          aria-label={fraseSinTitulo}
          className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-xl border border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10 px-3 text-sm font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--data-warning-500)]/20"
        >
          <ShieldAlert className="h-4 w-4 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" aria-hidden="true" />
          <TextoDeAccion>Sin título declarado</TextoDeAccion>
          <span className="font-mono tabular-nums">{sinTitulo}</span>
          <span className={cn("font-mono text-xs font-normal tabular-nums text-[var(--text-secondary)]", CLASE_TEXTO_ACCION)}>
            {n2(m3SinTitulo)} m³
          </span>
        </button>
      )}
      {/* Qué mandar hoy a la sierra (Brandon 05-10): las más viejas primero, por especie. */}
      <button
        type="button"
        onClick={onVerPlan}
        disabled={cargando}
        title="Plan del día: qué trozas mandar hoy a la sierra, las más viejas primero"
        className={cn(BTN_ACCION_RIEL, "border-[var(--accent)] text-[var(--accent-ink)] dark:text-[var(--accent)]")}
      >
        <Axe className="h-4 w-4" aria-hidden="true" />
        <TextoDeAccion>Plan del día</TextoDeAccion>
      </button>
      {/* Las guías sin fecha de llegada (las del importador sin la casilla «ya
          están en el patio»): sin ella los días en el patio cuentan desde el
          asiento y la guía sin validar queda fuera del conteo. Abre la
          recepción en bloque. */}
      <CtpGuiasSinRecibir onRecibidas={onRecargar} />
      {/* El conteo físico del patio (acta del modo patio, 2026-09-26). */}
      <CtpConteosPatio />
      <button
        type="button"
        onClick={onRecargar}
        disabled={cargando}
        title="Actualizar el patio"
        aria-label="Actualizar el patio"
        className={BTN_ICONO_RIEL}
      >
        <RefreshCw className={cn("h-4 w-4", cargando && "animate-spin")} aria-hidden="true" />
      </button>
    </CabeceraDeVista>
  );
}
