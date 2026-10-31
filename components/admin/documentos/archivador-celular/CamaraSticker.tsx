"use client";

import { Camera, Flashlight, FlashlightOff, QrCode } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import type { EstadoCamara, useCamaraSticker } from "./use-camara-sticker";

const TEXTO: Record<EstadoCamara, string> = {
  iniciando: "Prendiendo la cámara…",
  lista: "Apunta al QR del sticker.",
  sin_https: "La cámara sólo se prende si entras al panel por la dirección segura (https). Mientras, escribe el número del sticker.",
  sin_lector: "Este navegador no lee QR: ábrelo en Chrome. Mientras, escribe el número del sticker.",
  sin_permiso: "No diste permiso para la cámara (candado de la barra › Cámara › Permitir). Mientras, escribe el número.",
  sin_camara: "No encontré la cámara. Escribe el número del sticker.",
};

/** El video de la cámara de atrás con el recuadro, o el porqué no hay cámara. */
export default function CamaraSticker({ cam }: { cam: ReturnType<typeof useCamaraSticker> }) {
  const { videoRef, estado, hayLinterna, linterna, alternarLinterna } = cam;
  const conVideo = estado === "iniciando" || estado === "lista";
  if (!conVideo) {
    return (
      <p role="status" data-qa="camara-estado" data-estado={estado} className="flex items-start gap-2 rounded-xl bg-[var(--surface-sunken)] p-3 text-sm text-[var(--text-secondary)]">
        <Camera className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {TEXTO[estado]}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {/* Apaisada y baja: en un celular de 860 px la tarjeta del último sticker tiene que verse sin bajar. */}
      <div className="relative aspect-video max-h-[28dvh] w-full overflow-hidden rounded-xl bg-[var(--surface-sunken)]">
        <video ref={videoRef} muted playsInline aria-label="Cámara para leer el sticker" className="h-full w-full object-cover" />
        <span aria-hidden className="pointer-events-none absolute inset-[15%] rounded-xl border-2 border-[var(--accent)]" />
        {hayLinterna && (
          <button
            type="button"
            onClick={alternarLinterna}
            aria-pressed={linterna}
            title={linterna ? "Apagar la linterna" : "Prender la linterna"}
            className={button({ variant: "secondary", className: "absolute bottom-2 right-2 w-12 px-0" })}
          >
            {linterna ? <FlashlightOff className="h-5 w-5" aria-hidden /> : <Flashlight className="h-5 w-5" aria-hidden />}
          </button>
        )}
      </div>
      <p role="status" data-qa="camara-estado" data-estado={estado} className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <QrCode className="h-4 w-4 shrink-0" aria-hidden /> {TEXTO[estado]}
      </p>
    </div>
  );
}
