"use client";

/**
 * El video de la cámara de Hik-Connect DENTRO del panel (ADR-471): EZUIKit con
 * la URL EZOPEN que arma el servidor. El aviso de batería y datos va arriba y
 * en una línea: el vivo despierta la cámara solar y se corta solo a los 5 min
 * sin tocar nada.
 */

import {
  AlertTriangle,
  Battery,
  Loader2,
  Play,
  RefreshCw,
  Video,
} from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { BTN } from "./camaras-ui";
import { DATOS_POR_HORA, MINUTOS_SIN_TOCAR } from "./hik-connect-teams";
import { useVisorNube } from "./use-visor-nube";
import VisorNubeControles from "./VisorNubeControles";

interface Props {
  camaraId: string;
  nombre: string;
  /** ¿Hay código de verificación cargado? Sin él, una cámara cifrada no se ve. */
  conCodigo: boolean;
  onCerrar: () => void;
}

const CAPA =
  "absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[var(--surface-canvas)]/90 px-4 text-center text-sm text-[var(--text-primary)]";

export default function VisorNube({ camaraId, nombre, conCodigo, onCerrar }: Props) {
  const v = useVisorNube(camaraId);
  const enGrabacion = v.modo.tipo === "grabacion";

  return (
    <AdminModal
      open
      onClose={onCerrar}
      title={`${enGrabacion ? "Grabación" : "En vivo"} · ${nombre}`}
      description="Video de Hik-Connect dentro del panel"
      icon={Video}
      variant="wide"
      claveVentana="camara-nube"
    >
      <div
        className={`${MODAL_BODY} space-y-3`}
        onPointerDown={v.actividad}
        onKeyDown={v.actividad}
      >
        <p className="flex items-center gap-2 rounded-xl border border-[var(--data-warning-500)]/50 bg-[var(--data-warning-500)]/10 px-3 py-2 text-sm text-[var(--text-primary)]">
          <Battery className="h-4 w-4 shrink-0 text-[var(--data-warning-ink)]" aria-hidden />
          <span className="min-w-0 flex-1">El vivo despierta la cámara: ciérralo al terminar.</span>
          <InfoTip
            title="Batería y datos"
            what={`La cámara es solar y con chip 4G: mientras miras, transmite y gasta ${DATOS_POR_HORA} (SD gasta menos que HD).`}
            affects={`Si nadie toca el visor por ${MINUTOS_SIN_TOCAR} minutos, se corta solo. Cerrar esta ventana también lo corta.`}
            example="Para ver quién entró anoche, «Ver grabación» con la hora: no gasta batería en vivo."
          />
        </p>

        <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)]">
          {/* Vacío a propósito: EZUIKit dibuja acá adentro (React no le pone hijos). */}
          <div id={v.contenedorId} className="h-full w-full" data-visor-nube={camaraId} />
          {(v.estado === "pidiendo" || v.estado === "cargando") && (
            <div className={CAPA} role="status">
              <Loader2 className="h-6 w-6 animate-spin text-[var(--accent-ink)]" aria-hidden />
              {v.estado === "pidiendo"
                ? "Pidiendo el video a Hikvision…"
                : "Despertando la cámara… (puede tardar 10-20 s por 4G)"}
            </div>
          )}
          {v.estado === "error" && (
            <div className={CAPA} role="alert">
              <AlertTriangle className="h-6 w-6 text-[var(--data-error-ink)]" aria-hidden />
              <span className="max-w-sm">{v.error}</span>
              {!conCodigo && (
                <span className="max-w-sm text-xs text-[var(--text-tertiary)]">
                  Si la cámara tiene el video cifrado, carga su código de verificación en Cámaras →
                  Hik-Connect.
                </span>
              )}
              <button type="button" onClick={v.reintentar} className={BTN}>
                <RefreshCw className="h-4 w-4" aria-hidden /> Reintentar
              </button>
            </div>
          )}
          {v.estado === "cortado" && (
            <div className={CAPA} role="status">
              <Battery className="h-6 w-6 text-[var(--data-warning-ink)]" aria-hidden />
              Se cortó tras {MINUTOS_SIN_TOCAR} min sin tocar, para cuidar la batería.
              <button type="button" onClick={v.reintentar} className={BTN}>
                <Play className="h-4 w-4" aria-hidden /> Seguir viendo
              </button>
            </div>
          )}
        </div>

        <VisorNubeControles v={v} />
      </div>
    </AdminModal>
  );
}
