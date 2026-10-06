"use client";

/**
 * El video de la cámara de Hik-Connect DENTRO del panel (ADR-471): EZUIKit con
 * la URL EZOPEN que arma el servidor. El aviso de batería y datos va arriba y
 * en una línea: el vivo despierta la cámara solar y se corta solo a los 5 min
 * sin tocar nada.
 */

import { Battery, Video } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { DATOS_POR_HORA, MINUTOS_SIN_TOCAR } from "./hik-connect-teams";
import { useAnalizarCuadro } from "./use-analizar-cuadro";
import { useVisorNube } from "./use-visor-nube";
import VisorNubeAnalisis from "./VisorNubeAnalisis";
import VisorNubeCapas from "./VisorNubeCapas";
import VisorNubeControles from "./VisorNubeControles";

interface Props {
  camaraId: string;
  nombre: string;
  /** ¿Hay código de verificación cargado? Sin él, una cámara cifrada no se ve. */
  conCodigo: boolean;
  onCerrar: () => void;
  /** «Ver en Fotos» del aviso de «Analizar». */
  onVerFotos: () => void;
}

export default function VisorNube({ camaraId, nombre, conCodigo, onCerrar, onVerFotos }: Props) {
  const v = useVisorNube(camaraId);
  const a = useAnalizarCuadro(camaraId, v.tomarCuadro);
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
          <VisorNubeCapas v={v} conCodigo={conCodigo} />
        </div>

        <VisorNubeControles v={v} analisis={a} />
        <VisorNubeAnalisis a={a} onVerFotos={onVerFotos} />
      </div>
    </AdminModal>
  );
}
