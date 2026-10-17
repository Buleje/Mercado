"use client";

/**
 * «Hoy» separado de la sesión (auditoría 15-10, H01/M23). Sólo aparece cuando
 * la caja sigue abierta desde un día anterior: ahí el Resumen, el esperado y
 * el cuadre suman TODA la sesión, y esta línea dice lo que se movió hoy.
 * Las cifras vienen del servidor (`ParteDelDia.hoy`); acá no se suma nada.
 */
import { CalendarClock } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { diasCalendarioLima, fechaCortaLima } from "@/lib/caja/caja-abierta";
import type { FlujoDeHoy } from "@/lib/caja/parte-del-dia";
import { formatTime } from "@/lib/format";
import { fmt } from "./tipos";

export function CajaHoyYSesion({ abiertaEn, hoy }: { abiertaEn: string; hoy: FlujoDeHoy }) {
  const dias = diasCalendarioLima(abiertaEn) ?? 0;
  const desde = `${fechaCortaLima(abiertaEn)}, ${formatTime(abiertaEn)}`;
  const diaDeHoy = fechaCortaLima(`${hoy.dia}T12:00:00-05:00`);
  return (
    <div
      data-qa="caja-hoy-y-sesion"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-2.5 text-sm"
    >
      <CalendarClock className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" aria-hidden />
      <span className="font-bold text-[var(--text-primary)]">Hoy, {diaDeHoy}:</span>
      {hoy.movimientos === 0 ? (
        <span className="text-[var(--text-secondary)]">sin movimientos todavía</span>
      ) : (
        <span className="tabular-nums text-[var(--text-primary)]">
          ventas en efectivo {fmt(hoy.ventasEfectivo)} · entró {fmt(hoy.ingresos)} · salió {fmt(hoy.egresos)}
        </span>
      )}
      <span className="text-[var(--text-secondary)]">· lo demás, desde el {desde}</span>
      <InfoTip
        what={`La caja sigue abierta desde el ${desde} (${dias === 1 ? "ayer" : `hace ${dias} días`}). El esperado, el cuadre y los indicadores suman toda esa sesión; esta línea sólo recorta lo que se movió hoy en efectivo.`}
        affects="Para ver cada día por separado, cierra la caja al terminar la jornada y ábrela con el fondo al día siguiente."
        example="Abierta el miércoles 10/06 con S/ 100: hoy vendiste S/ 50 en efectivo, pero el esperado sigue contando desde junio."
      />
    </div>
  );
}
