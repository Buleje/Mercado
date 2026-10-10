"use client";

/**
 * El parlante del vivo de la nube (visor de una cámara y cada cuadro del
 * mosaico) y, al lado, un ⓘ cuando no se va a oír nada: la cámara manda el
 * video sin audio (micrófono apagado o «sólo video») o el navegador no abrió
 * el sonido. Antes el clic no cambiaba nada y el aviso quedaba escondido
 * detrás del video (`use-sonido-nube.ts`, 08-10).
 */

import { Volume2, VolumeX } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { VisorNubeEstado } from "./use-visor-nube";

interface Props {
  v: VisorNubeEstado;
  className: string;
  /** Para el lector de pantalla del mosaico («Escuchar Patio de trozas»). */
  nombre?: string;
  /** Sólo el ícono (cuadro del mosaico). */
  soloIcono?: boolean;
}

const LINEA = "block";

export default function BotonSonido({ v, className, nombre, soloIcono = false }: Props) {
  const viendo = v.estado === "viendo";
  const codec = v.audio.codec
    ? ` · audio ${v.audio.codec}`
    : v.audio.trae === false
      ? " · el video llegó sin audio"
      : "";
  const titulo = v.sonido ? `Silenciar el vivo${codec}` : `Escuchar lo que oye la cámara${codec}`;
  const audioAttr = v.audio.trae === null ? "sin-saber" : v.audio.trae ? "con-audio" : "sin-audio";

  /* El parlante y su ⓘ juntos: en una fila que se parte, el ⓘ no queda solo. */
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => void v.alternarSonido()}
        disabled={!viendo}
        aria-pressed={v.sonido}
        className={className}
        title={titulo}
        aria-label={
          soloIcono
            ? `${v.sonido ? "Silenciar" : "Escuchar"}${nombre ? ` ${nombre}` : ""}`
            : undefined
        }
        data-control="sonido"
        data-audio={audioAttr}
      >
        {v.sonido ? (
          <Volume2 className="h-4 w-4" aria-hidden />
        ) : (
          <VolumeX className="h-4 w-4" aria-hidden />
        )}
        {!soloIcono && <span className="max-sm:sr-only">{v.sonido ? "Sonido" : "Sin sonido"}</span>}
      </button>
      {viendo && v.fallaSonido && <AyudaSonido falla={v.fallaSonido} />}
    </span>
  );
}

function AyudaSonido({ falla }: { falla: "sin-audio" | "no-abre" }) {
  const sinAudio = falla === "sin-audio";
  return (
    <span data-ayuda-sonido={falla} className="inline-flex">
      <InfoTip
        title={sinAudio ? "La cámara no manda sonido" : "El sonido no arrancó"}
        ariaLabel={`Por qué no se oye: ${sinAudio ? "la cámara no manda sonido" : "el sonido no arrancó"}`}
        ancho="w-80"
        side="bottom"
        body={
          <span className="block space-y-1.5">
            <span className={LINEA}>
              {sinAudio
                ? "El video llegó sin audio: no hay nada que escuchar."
                : "Este navegador no abrió el audio. Toca el parlante otra vez y revisa que la pestaña no esté silenciada (clic derecho en la pestaña › Activar sonido) ni el volumen del equipo en 0."}
            </span>
            <span className={LINEA}>
              1. Prende el micrófono de la cámara: el botón del micrófono encima del video (si tu
              cámara lo tiene) o en Hik-Connect › la cámara › Ajustes › Audio.
            </span>
            <span className={LINEA}>
              2. Cierra y vuelve a abrir el vivo: el audio se elige al empezar a transmitir.
            </span>
            <span className={LINEA}>
              3. Si sigue mudo, en la configuración de la cámara (iVMS-4200 o su página web): Video
              › Tipo de flujo «Video y audio», y Audio › Codificación G.711 o AAC.
            </span>
          </span>
        }
      />
    </span>
  );
}
