"use client";

/**
 * El video de la cámara de Hik-Connect DENTRO del panel (ADR-471 + ADR-472):
 * EZUIKit con la URL EZOPEN que arma el servidor, en grande.
 *
 * Tamaño: el modal es tan ancho como deja el alto de la ventana para un 16:9
 * (hasta el 96 % del ancho); «Teatro» lo lleva a toda la ventana y «Pantalla
 * completa» pone el marco (video + controles) en la pantalla entera. Encima del
 * video van los controles del aparato (mover, foto, detección, micrófono,
 * alarma) que se esconden solos en la PC; en el celular van debajo.
 *
 * El aviso de batería y datos va arriba en una línea: el vivo despierta la
 * cámara solar y se corta solo a los 5 min sin tocar nada.
 */

import { Battery, Video } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import ControlesCamara from "./ControlesCamara";
import { DATOS_POR_HORA, MINUTOS_SIN_TOCAR } from "./hik-connect-teams";
import { useAnalizarCuadro } from "./use-analizar-cuadro";
import { useVisorNube } from "./use-visor-nube";
import VisorNubeAnalisis from "./VisorNubeAnalisis";
import VisorNubeCapas from "./VisorNubeCapas";
import VisorNubeControles from "./VisorNubeControles";

/**
 * Ancho del modal: el 16:9 que entra con el encabezado, el aviso y la fila de
 * controles (~17rem medidos a 1280×900) a la vista, sin pasar del 96 % de la
 * ventana. Con 11 y 15rem la fila de SD/HD quedaba cortada abajo.
 */
const ANCHO_NORMAL = "sm:max-w-[min(96vw,calc((100dvh_-_17rem)*16/9))]";
const TEATRO = "sm:w-screen sm:max-w-none sm:h-dvh sm:max-h-none sm:rounded-none";

interface Props {
  camaraId: string;
  nombre: string;
  /** ¿Hay código de verificación cargado? Sin él, una cámara cifrada no se ve. */
  conCodigo: boolean;
  onCerrar: () => void;
  /** «Ver en Fotos» del aviso de «Analizar» y de «Foto». */
  onVerFotos: () => void;
}

export default function VisorNube({ camaraId, nombre, conCodigo, onCerrar, onVerFotos }: Props) {
  const v = useVisorNube(camaraId);
  const a = useAnalizarCuadro(camaraId, v.tomarCuadro);
  const enGrabacion = v.modo.tipo === "grabacion";
  const completa = v.enPantallaCompleta;

  return (
    <AdminModal
      open
      onClose={onCerrar}
      title={`${enGrabacion ? "Grabación" : "En vivo"} · ${nombre}`}
      description="Video de Hik-Connect dentro del panel"
      icon={Video}
      variant="info"
      ventana={false}
      className={v.teatro ? TEATRO : ANCHO_NORMAL}
    >
      <div
        className={`${MODAL_BODY} space-y-3`}
        onPointerDown={v.actividad}
        onKeyDown={v.actividad}
      >
        {!v.teatro && (
          <p className="flex items-center gap-2 rounded-xl border border-[var(--data-warning-500)]/50 bg-[var(--data-warning-500)]/10 px-3 py-1.5 text-sm text-[var(--text-primary)]">
            <Battery className="h-4 w-4 shrink-0 text-[var(--data-warning-ink)]" aria-hidden />
            <span className="min-w-0 flex-1">
              El vivo despierta la cámara: ciérralo al terminar.
            </span>
            <InfoTip
              title="Batería y datos"
              what={`La cámara es solar y con chip 4G: mientras miras, transmite y gasta ${DATOS_POR_HORA} (SD gasta menos que HD).`}
              affects={`Si nadie toca el visor por ${MINUTOS_SIN_TOCAR} minutos, se corta solo. Cerrar esta ventana también lo corta.`}
              example="Para ver quién entró anoche, «Ver grabación» con la hora: no gasta batería en vivo."
            />
          </p>
        )}

        {/* El marco va a pantalla completa con sus controles adentro. */}
        <div
          id={v.marcoId}
          className={cn(
            "relative",
            completa && "flex h-full w-full flex-col bg-[var(--surface-canvas)]",
            v.teatro && !completa && "mx-auto w-full max-w-[calc((100dvh_-_8rem)*16/9)]",
          )}
        >
          <div
            className={cn(
              "relative w-full overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)]",
              completa ? "min-h-0 flex-1 rounded-none border-0" : "aspect-video",
            )}
          >
            {/* Vacío a propósito: EZUIKit dibuja acá adentro (React no le pone hijos). */}
            <div
              id={v.contenedorId}
              className="flex h-full w-full items-center justify-center"
              data-visor-nube={camaraId}
            />
            <VisorNubeCapas v={v} conCodigo={conCodigo} />
          </div>
          <ControlesCamara
            camaraId={camaraId}
            nombre={nombre}
            marcoId={v.marcoId}
            viendo={v.estado === "viendo"}
            teclado="documento"
            onVerFotos={onVerFotos}
            tomarCuadro={v.tomarCuadro}
          />
        </div>

        <VisorNubeControles v={v} analisis={a} />
        <VisorNubeAnalisis a={a} onVerFotos={onVerFotos} />
      </div>
    </AdminModal>
  );
}
