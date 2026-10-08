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
 *
 * Vigilancia (08-10): el detector de personas también acá, como en cada cuadro
 * del mosaico — «Detectar personas», «Ver movimiento» (recordado), sus cajas
 * sobre el video, la pastilla con cuántas ve y las zonas que ignora. Abrir este
 * visor cierra el mosaico (`VisorNubeContexto`): nunca dos detectores mirando
 * la misma cámara.
 */

import { useState } from "react";
import { Battery, Tv, Video } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import { useApiCamaras } from "./api-camaras";
import BotonZonasDetector from "./BotonZonasDetector";
import CajasEnVivo from "./CajasEnVivo";
import { BTN } from "./camaras-ui";
import ChipPersonas from "./ChipPersonas";
import ControlesCamara from "./ControlesCamara";
import { DATOS_POR_HORA, MINUTOS_SIN_TOCAR } from "./hik-connect-teams";
import { InterruptoresDetector } from "./InterruptorVivo";
import { useAnalizarCuadro } from "./use-analizar-cuadro";
import { useAparicionReciente } from "./use-aviso-personas";
import { useDetectorDelVisor } from "./use-detector-del-visor";
import { useVerMovimiento } from "./use-ver-movimiento";
import { useVisorNube } from "./use-visor-nube";
import VisorNubeAnalisis from "./VisorNubeAnalisis";
import VisorNubeCapas from "./VisorNubeCapas";
import VisorNubeControles from "./VisorNubeControles";

/**
 * Ancho del modal: el 16:9 que entra con el encabezado, el aviso, la fila de
 * vigilancia y la de controles (~20rem medidos a 1280×900) a la vista, sin
 * pasar del 96 % de la ventana. Con 11 y 15rem la fila de SD/HD quedaba
 * cortada abajo; 17rem era sin la fila de vigilancia (08-10).
 */
const ANCHO_NORMAL = "sm:max-w-[min(96vw,calc((100dvh_-_20rem)*16/9))]";
const TEATRO = "sm:w-screen sm:max-w-none sm:h-dvh sm:max-h-none sm:rounded-none";

interface Props {
  camaraId: string;
  nombre: string;
  /** ¿Hay código de verificación cargado? Sin él, una cámara cifrada no se ve. */
  conCodigo: boolean;
  onCerrar: () => void;
  /** «Ver en Fotos» del aviso de «Analizar» y de «Foto». */
  onVerFotos: () => void;
  /** Base de la API (`TV_API_TV` = sólo mirar: sin mover, micrófono ni «Analizar»). */
  baseApi?: string;
  /**
   * «Verlo en el televisor»: el video de Hik-Connect se dibuja en un canvas y
   * no se puede transmitir; esto abre «Ver en otra pantalla» (Modo TV).
   */
  onVerEnTv?: () => void;
}

export default function VisorNube({
  camaraId,
  nombre,
  conCodigo,
  onCerrar,
  onVerFotos,
  baseApi,
  onVerEnTv,
}: Props) {
  const { base, soloMirar } = useApiCamaras(baseApi);
  const v = useVisorNube(camaraId, { baseApi: base });
  const a = useAnalizarCuadro(camaraId, v.tomarCuadro);
  const [detectar, setDetectar] = useState(!soloMirar);
  const [verMovimiento, setVerMovimiento] = useVerMovimiento();
  const enGrabacion = v.modo.tipo === "grabacion";
  /* Sólo el vivo: en una grabación guardaría fotos viejas con la hora de ahora. */
  const vigilar = detectar && !soloMirar && !enGrabacion;
  const { personas, zonas } = useDetectorDelVisor({ camaraId, nombre, v, activo: vigilar });
  const reciente = useAparicionReciente(personas.aparicion);
  const marcar = vigilar && v.estado === "viendo";
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

        {!soloMirar && !v.teatro && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1" data-vigilancia-visor>
            {enGrabacion ? (
              <span className="text-sm text-[var(--text-secondary)]" data-detector-pausado>
                En la grabación no se buscan personas: sólo en el vivo.
              </span>
            ) : (
              <InterruptoresDetector
                detectar={detectar}
                onDetectar={setDetectar}
                verMovimiento={verMovimiento}
                onVerMovimiento={setVerMovimiento}
                donde="camara"
              />
            )}
            <span className="ml-auto flex items-center gap-2">
              {marcar && <ChipPersonas d={personas} />}
              <BotonZonasDetector
                camaraId={camaraId}
                nombre={nombre}
                zonas={zonas}
                cargarImagen={v.tomarCuadroQuieto}
                className={BTN}
              />
            </span>
          </div>
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
              "relative w-full overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] transition-shadow",
              completa ? "min-h-0 flex-1 rounded-none border-0" : "aspect-video",
              reciente && "border-[var(--data-warning-500)] ring-2 ring-[var(--data-warning-500)]",
            )}
            data-persona-reciente={reciente || undefined}
          >
            {/* Vacío a propósito: EZUIKit dibuja acá adentro (React no le pone hijos). */}
            <div
              id={v.contenedorId}
              className="flex h-full w-full items-center justify-center"
              data-visor-nube={camaraId}
            />
            {marcar && (
              <CajasEnVivo
                personas={personas.personasEnVivo}
                movimiento={verMovimiento ? personas.movimientoEnVivo : []}
                contenedorId={v.contenedorId}
              />
            )}
            <VisorNubeCapas v={v} conCodigo={conCodigo} />
          </div>
          {!soloMirar && (
            <ControlesCamara
              camaraId={camaraId}
              nombre={nombre}
              marcoId={v.marcoId}
              viendo={v.estado === "viendo"}
              teclado="documento"
              onVerFotos={onVerFotos}
              tomarCuadro={v.tomarCuadro}
            />
          )}
        </div>

        <VisorNubeControles v={v} analisis={soloMirar ? undefined : a} />
        {!soloMirar && <VisorNubeAnalisis a={a} onVerFotos={onVerFotos} />}
        {onVerEnTv && !v.teatro && (
          <button
            type="button"
            onClick={onVerEnTv}
            className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--accent-ink)] underline-offset-4 hover:underline dark:text-[var(--accent)]"
            title="Este video no se puede transmitir: el Modo TV lo muestra en el navegador del televisor"
          >
            <Tv className="h-4 w-4" aria-hidden /> Verlo en el televisor
          </button>
        )}
      </div>
    </AdminModal>
  );
}
