"use client";

/**
 * T9 en la vista previa de «Importar guías despachadas» (ADR-461, 04-10): las
 * especies que la guía deja por encima de su cupo, con la MISMA medición que
 * la importación (`cupoDeLaGuia` en el servidor). Contra lo AUTORIZADO pide un
 * motivo de una línea —sin él la guía no entra—; contra lo censado sólo avisa
 * (el censo puede estar incompleto y la importación no lo frena).
 *
 * `InfoT6`: el ⓘ del aviso que bloquea la guía por T6 (lo DESPACHADO pasaría
 * lo autorizado): ahí no se ofrece motivo, porque el servidor no lo admite.
 */

import { useId } from "react";
import { AlertTriangle } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { MOTIVO_CUPO_MIN, limpiarMotivo, motivoCupoValido } from "@/lib/forestal/loth-cupo-especie";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { SobreAutorizadoDeLaGuia, SobreCupoDeLaGuia } from "@/lib/forestal/loth-importar-guia-tipos";

const ROJO = "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]";
const AMBAR = "text-[var(--data-warning-ink)]";

export default function LothImportarGuiasCupo({
  filas,
  motivo,
  onMotivo,
  activa,
}: {
  filas: SobreCupoDeLaGuia[];
  motivo: string;
  onMotivo: (texto: string) => void;
  /** La guía va marcada para importar: si no, el motivo no se pide. */
  activa: boolean;
}) {
  const id = useId();
  if (filas.length === 0) return null;
  const pideMotivo = filas.some((f) => f.exigeMotivo);
  const valido = motivoCupoValido(motivo);
  const escrito = limpiarMotivo(motivo).length > 0;
  return (
    <div
      data-aviso-cupo={pideMotivo ? "autorizado" : "censo"}
      className={`mx-3 mb-2 space-y-2 rounded-lg border px-3 py-2 text-sm ${
        pideMotivo
          ? "border-[var(--data-error-500)]/60 bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/12"
          : "border-[var(--data-warning-500)]/60 bg-[var(--data-warning-500)]/10"
      }`}
    >
      <ul className="space-y-1">
        {filas.map((f) => (
          <li key={f.especie} className={`flex items-start gap-2 font-semibold ${f.exigeMotivo ? ROJO : AMBAR}`}>
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span className="tabular-nums">{f.mensaje}</span>
          </li>
        ))}
      </ul>
      {pideMotivo && (
        <div className={activa ? "" : "opacity-60"}>
          <div className="flex items-center gap-2">
            <label htmlFor={id} className={`shrink-0 text-xs font-semibold ${ROJO}`}>
              Motivo
            </label>
            <input
              id={id}
              value={motivo}
              onChange={(e) => onMotivo(e.target.value)}
              maxLength={500}
              disabled={!activa}
              placeholder="Ej.: el árbol salió más grande que lo censado"
              aria-invalid={activa && !valido ? true : undefined}
              aria-describedby={`${id}-nota`}
              className="h-11 min-w-0 flex-1 rounded-lg border border-[var(--data-error-500)]/50 bg-[var(--surface-raised)] px-2.5 text-base text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)] disabled:cursor-not-allowed sm:h-10 sm:text-sm"
            />
            <InfoTip
              title="Pasa lo autorizado"
              what="El plan autoriza un volumen por especie. Esta guía, con sus talas nuevas o agrandadas, lo pasa."
              affects="Sin motivo no se importa. Con él, la tala se anota con el motivo y queda en la auditoría: es lo que cruza OSINFOR."
              example="Tornillo: 8 de 7 m³ autorizados — exceso 1 m³. Motivo: ampliación de volumen en trámite."
              side="left"
            />
          </div>
          <p id={`${id}-nota`} className={`mt-1 text-xs font-semibold ${valido ? "text-[var(--text-secondary)]" : ROJO}`}>
            {valido
              ? "Se anota en la tala y en la auditoría."
              : escrito
                ? `El motivo necesita ${MOTIVO_CUPO_MIN} letras o más.`
                : "Sin motivo no se importa esta guía."}
          </p>
        </div>
      )}
    </div>
  );
}

/** El detalle de T6 detrás del ⓘ: cuánto salió, cuánto despacha la guía y el tope del permiso. */
export function InfoT6({ filas }: { filas: SobreAutorizadoDeLaGuia[] }) {
  const f = filas[0];
  if (!f) return null;
  const tope = f.plantacion ? "registrado de la plantación" : "autorizado por el permiso";
  return (
    <InfoTip
      title="Pasa lo autorizado de despacho"
      what={`Lo que sale del bosque de una especie no puede pasar lo ${tope}. Es el tope legal que fiscaliza OSINFOR: no admite motivo.`}
      affects="Para importarla, que la ARFFS amplíe el volumen autorizado, o corrige el plan si lo autorizado está mal cargado."
      example={filas
        .map((x) => `${x.especie}: salieron ${fmtM3(x.yaSalioM3)} m³ + esta guía ${fmtM3(x.despachaM3)} m³ = ${fmtM3(x.yaSalioM3 + x.despachaM3)} de ${fmtM3(x.autorizadoM3)} m³ (exceso ${fmtM3(x.excesoM3)} m³).`)
        .join(" ")}
      side="left"
    />
  );
}
