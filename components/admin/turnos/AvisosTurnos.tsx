"use client";

/**
 * Avisos que piden acción: turno abierto hace mucho (a las 12 h el sistema lo
 * cierra sin conteo), turnos que cerró el sistema y diferencias altas.
 * Una línea cada uno + ⓘ con el detalle + la acción que lo resuelve.
 */
import { AlertTriangle, Clock } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { DIFF_ANORMAL_ABS, HORAS_CIERRE_SISTEMA, type AvisoTurnos } from "./tipos";

type Props = {
  avisos: AvisoTurnos[];
  onCerrarTurno: () => void;
  onVerAlertas: () => void;
};

function Linea({ tono, children, accion }: { tono: "error" | "warning"; children: React.ReactNode; accion?: React.ReactNode }) {
  const Icono = tono === "error" ? AlertTriangle : Clock;
  return (
    <div
      role={tono === "error" ? "alert" : "status"}
      className={tono === "error"
        ? "flex items-center gap-2 rounded-xl border border-[var(--data-error-500)]/30 bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/10 px-3 py-2 text-sm text-[var(--text-primary)]"
        : "flex items-center gap-2 rounded-xl border border-[var(--data-warning-500)]/30 bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/10 px-3 py-2 text-sm text-[var(--text-primary)]"}
    >
      <Icono className={tono === "error" ? "h-4 w-4 shrink-0 text-[var(--data-error-500)]" : "h-4 w-4 shrink-0 text-[var(--data-warning-500)]"} aria-hidden />
      <span className="min-w-0 flex-1 flex items-center gap-1 flex-wrap">{children}</span>
      {accion}
    </div>
  );
}

const BOTON = "shrink-0 rounded-lg px-3 min-h-9 text-sm font-semibold text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-[var(--surface-raised)]";

export function AvisosTurnos({ avisos, onCerrarTurno, onVerAlertas }: Props) {
  if (avisos.length === 0) return null;
  return (
    <div className="space-y-2">
      {avisos.map((a) => {
        if (a.tipo === "turno-largo") {
          return (
            <Linea key={a.tipo} tono="error" accion={<button type="button" className={BOTON} onClick={onCerrarTurno}>Cerrar turno</button>}>
              El turno lleva <b className="tabular-nums">{a.horas} h</b> abierto
              <InfoTip
                title="Turno olvidado"
                what={`A las ${HORAS_CIERRE_SISTEMA} h el sistema lo cierra solo, sin conteo de caja.`}
                affects="Un cierre sin conteo deja la diferencia sin dato y obliga a revisar el arqueo a mano."
              />
            </Linea>
          );
        }
        if (a.tipo === "cerrados-por-sistema") {
          return (
            <Linea key={a.tipo} tono="warning" accion={<button type="button" className={BOTON} onClick={onVerAlertas}>Ver</button>}>
              <b className="tabular-nums">{a.cantidad}</b> {a.cantidad === 1 ? "turno lo cerró" : "turnos los cerró"} el sistema sin conteo
              <InfoTip
                title="Cerrados por el sistema"
                what={`Turnos que quedaron abiertos más de ${HORAS_CIERRE_SISTEMA} h (últimos 30 días). Nadie contó la caja.`}
                affects="Revisa el arqueo de esos días en Cuadrar caja."
              />
            </Linea>
          );
        }
        return (
          <Linea key={a.tipo} tono="warning" accion={<button type="button" className={BOTON} onClick={onVerAlertas}>Ver</button>}>
            <b className="tabular-nums">{a.cantidad}</b> {a.cantidad === 1 ? "turno cerró" : "turnos cerraron"} con diferencia alta
            <InfoTip
              title="Diferencia alta"
              what={`Más de S/ ${DIFF_ANORMAL_ABS} o más del 5 % de lo esperado en el cajón (últimos 30 días).`}
              example="Esperado S/ 300 y contado S/ 270: faltante de S/ 30."
            />
          </Linea>
        );
      })}
    </div>
  );
}
