"use client";

/**
 * T9 en la vista previa de «Importar guías despachadas» (ADR-461, 04-10): las
 * especies que la guía deja por encima de su cupo, con la MISMA medición que
 * la importación (`cupoDeLaGuia` en el servidor). Contra lo AUTORIZADO pide un
 * motivo de una línea —sin él la guía no entra—; contra lo censado sólo avisa
 * (el censo puede estar incompleto y la importación no lo frena).
 *
 * T6 (lo DESPACHADO pasa lo autorizado, ADR-468): si la guía está VERIFICADA
 * en SERFOR y quien mira es admin o dueño (`t6`), sus cuentas van acá en rojo
 * y piden el MISMO motivo (uno solo vale para la tala y el despacho).
 *
 * `InfoT6`: el ⓘ del aviso que bloquea la guía por T6 (leída de una foto o
 * PDF, o vista por otro rol): ahí no se ofrece motivo.
 */

import { useId } from "react";
import { AlertTriangle } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { MOTIVO_CUPO_MIN, limpiarMotivo, motivoCupoValido } from "@/lib/forestal/loth-cupo-especie";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { SobreAutorizadoDeLaGuia, SobreCupoDeLaGuia } from "@/lib/forestal/loth-importar-guia-tipos";

const ROJO = "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]";
const AMBAR = "text-[var(--data-warning-ink)]";

/** «Despacho de Azúcar huayo: 10 + 40 = 50 de 45 m³ autorizados — exceso 5 m³». */
const lineaT6 = (f: SobreAutorizadoDeLaGuia) =>
  `Despacho de ${f.especie}: ${fmtM3(f.yaSalioM3)} + ${fmtM3(f.despachaM3)} = ${fmtM3(f.yaSalioM3 + f.despachaM3)} de ` +
  `${fmtM3(f.autorizadoM3)} m³ ${f.plantacion ? "registrados" : "autorizados"} — exceso ${fmtM3(f.excesoM3)} m³`;

export default function LothImportarGuiasCupo({
  filas,
  t6 = [],
  motivo,
  onMotivo,
  activa,
}: {
  filas: SobreCupoDeLaGuia[];
  /** T6 con motivo (guía verificada, admin o dueño): lo despachado sobre lo autorizado. */
  t6?: SobreAutorizadoDeLaGuia[];
  motivo: string;
  onMotivo: (texto: string) => void;
  /** La guía va marcada para importar: si no, el motivo no se pide. */
  activa: boolean;
}) {
  const id = useId();
  if (filas.length === 0 && t6.length === 0) return null;
  const pideT9 = filas.some((f) => f.exigeMotivo);
  const pideMotivo = pideT9 || t6.length > 0;
  const valido = motivoCupoValido(motivo);
  const escrito = limpiarMotivo(motivo).length > 0;
  const dondeQueda = pideT9 && t6.length > 0
    ? "Un solo motivo vale para la tala y el despacho: se anota en la tala y en la auditoría."
    : t6.length > 0
      ? "Se anota en la auditoría, para OSINFOR."
      : "Se anota en la tala y en la auditoría.";
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
        {t6.map((f) => (
          <li key={`t6-${f.especie}`} data-t6-con-motivo className={`flex items-start gap-2 font-semibold ${ROJO}`}>
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span className="tabular-nums">{lineaT6(f)}</span>
          </li>
        ))}
      </ul>
      {t6.length > 0 && (
        <p className="text-xs text-[var(--text-secondary)]">
          SERFOR ya emitió y verificó esta guía: entra con motivo y queda el aviso en la auditoría.
        </p>
      )}
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
              what={
                t6.length > 0
                  ? "El permiso autoriza un volumen por especie. Lo que despacha esta guía, sumado a lo que ya salió, lo pasa. La guía ya la emitió SERFOR: el libro la anota igual, con el motivo."
                  : "El plan autoriza un volumen por especie. Esta guía, con sus talas nuevas o agrandadas, lo pasa."
              }
              affects="Sin motivo no se importa. Con él, queda en la auditoría con tu usuario: es lo que cruza OSINFOR. El Control del permiso marcará el exceso."
              example={
                t6.length > 0
                  ? `${lineaT6(t6[0])}. Motivo: SERFOR emitió la guía con el volumen medido en el bosque.`
                  : "Tornillo: 8 de 7 m³ autorizados — exceso 1 m³. Motivo: ampliación de volumen en trámite."
              }
              side="left"
            />
          </div>
          <p id={`${id}-nota`} className={`mt-1 text-xs font-semibold ${valido ? "text-[var(--text-secondary)]" : ROJO}`}>
            {valido
              ? dondeQueda
              : escrito
                ? `El motivo necesita ${MOTIVO_CUPO_MIN} letras o más.`
                : "Sin motivo no se importa esta guía."}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * El detalle de T6 detrás del ⓘ: cuánto salió, cuánto despacha la guía y el
 * tope del permiso. `verificada`: SERFOR ya la emitió (sólo falta el rol).
 */
export function InfoT6({ filas, verificada = false }: { filas: SobreAutorizadoDeLaGuia[]; verificada?: boolean }) {
  const f = filas[0];
  if (!f) return null;
  const tope = f.plantacion ? "registrado de la plantación" : "autorizado por el permiso";
  return (
    <InfoTip
      title="Pasa lo autorizado de despacho"
      what={
        verificada
          ? `Lo que sale del bosque de una especie no puede pasar lo ${tope}. Esta guía ya la emitió SERFOR: el dueño o el administrador pueden importarla con motivo, y queda en la auditoría para OSINFOR.`
          : `Lo que sale del bosque de una especie no puede pasar lo ${tope}. Es el tope legal que fiscaliza OSINFOR: una guía leída de una foto o PDF no entra ni con motivo.`
      }
      affects={
        verificada
          ? "Pídele al dueño o al administrador que la importe. O que la ARFFS amplíe el volumen autorizado, o corrige el plan si lo autorizado está mal cargado."
          : "Si SERFOR ya la emitió, impórtala por su N° de registro (queda verificada) y el dueño o el administrador podrán importarla con motivo. Si no: que la ARFFS amplíe el volumen autorizado, o corrige el plan."
      }
      example={filas
        .map((x) => `${x.especie}: salieron ${fmtM3(x.yaSalioM3)} m³ + esta guía ${fmtM3(x.despachaM3)} m³ = ${fmtM3(x.yaSalioM3 + x.despachaM3)} de ${fmtM3(x.autorizadoM3)} m³ (exceso ${fmtM3(x.excesoM3)} m³).`)
        .join(" ")}
      side="left"
    />
  );
}
