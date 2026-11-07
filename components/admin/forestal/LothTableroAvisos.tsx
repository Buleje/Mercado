"use client";

/**
 * Los avisos del Control del permiso: una línea cada uno, con su ⓘ (ley de la
 * vista). Sólo lo que pide hacer algo: el permiso que vence o venció, la madera
 * que se está quedando en el patio, y la lista de permisos que no llegó.
 */

import { AlertTriangle, Clock } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { BandaPermiso } from "@/lib/forestal/loth-tablero-permiso";
import { UMBRAL_PATIO_DIAS, type ResumenViejas } from "@/lib/forestal/loth-tablero-trozas";

const LINEA = "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border-2 px-3 py-2 text-sm font-semibold";
const ROJO = "border-[var(--data-error-500)]/50 bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]";
const AMBAR = "border-[var(--data-warning-500)]/50 bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]";

export default function LothTableroAvisos({
  banda,
  viejas,
  soloViejas,
  onVerViejas,
  errorPlanes,
  disponibles,
}: {
  banda: BandaPermiso | null;
  viejas: ResumenViejas;
  soloViejas: boolean;
  onVerViejas: () => void;
  errorPlanes: string | null;
  /** Trozas en el patio de este permiso: con 0, un permiso vencido no apura. */
  disponibles: number;
}) {
  const v = banda?.vigencia;
  const vencido = v?.tono === "vencida";
  const porVencer = v?.tono === "atencion";
  const avisos: React.ReactNode[] = [];

  if (banda && (vencido || porVencer)) {
    avisos.push(
      <div key="vigencia" role={vencido ? "alert" : undefined} className={`${LINEA} ${vencido ? ROJO : AMBAR}`}>
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        {vencido
          ? `El permiso ${banda.nombre} está ${v?.texto.toLowerCase()}${disponibles > 0 ? `: quedan ${disponibles} trozas en el patio.` : "."}`
          : `El permiso ${banda.nombre}: ${v?.texto.toLowerCase()} de vigencia.`}
        <InfoTip
          title="Vigencia del permiso"
          what="Fuera de la vigencia no se puede movilizar madera con este título habilitante."
          affects="Despacha lo que queda en el patio antes del vencimiento, o tramita la ampliación."
          example={v?.rango ?? undefined}
        />
      </div>,
    );
  }

  if (viejas.criticas > 0 && !soloViejas) {
    avisos.push(
      <div key="viejas" className={`${LINEA} ${ROJO}`}>
        <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
        {viejas.criticas} {viejas.criticas === 1 ? "troza lleva" : "trozas llevan"} más de {UMBRAL_PATIO_DIAS.critico} días en el patio.
        <button
          type="button"
          onClick={onVerViejas}
          className="rounded-lg px-1.5 py-0.5 underline underline-offset-2 hover:bg-[var(--data-error-500)]/10"
        >
          Verlas
        </button>
        <InfoTip
          title="Madera vieja en el patio"
          what="La madera rolliza en la selva se mancha (mancha azul) y se raja si no se mueve en 2 a 4 semanas."
          affects={`Ámbar desde los ${UMBRAL_PATIO_DIAS.atencion} días, rojo desde los ${UMBRAL_PATIO_DIAS.critico}.`}
          example="Despáchala con guía o pásala a la sierra primero."
        />
      </div>,
    );
  }

  if (errorPlanes) {
    avisos.push(
      <div key="planes" className={`${LINEA} ${AMBAR}`}>
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        No se pudo leer la lista de permisos: se muestran todas las trozas. {errorPlanes}
      </div>,
    );
  }

  if (avisos.length === 0) return null;
  return <div className="space-y-2">{avisos}</div>;
}
