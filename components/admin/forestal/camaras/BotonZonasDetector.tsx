"use client";

/**
 * El ojo tachado del vivo: abre «Zonas que el detector ignora» sobre el cuadro
 * en vivo (08-10; lo que cae ahí no cuenta como persona). Lo usan el cuadro
 * del mosaico y el visor de una cámara sola. El modal va encima del otro
 * (`aboveModals`): los dos visores ya son diálogos.
 */

import { useState } from "react";
import { EyeOff } from "@buleje/design-system/icons";
import type { ZonaIgnorada } from "@/lib/camaras/zonas-ignorar";
import ZonasDetectorModal from "./ZonasDetectorModal";

interface Props {
  camaraId: string;
  nombre: string;
  zonas: readonly ZonaIgnorada[];
  /** El cuadro en vivo sin contar como toque (`tomarCuadroQuieto`). */
  cargarImagen: () => Promise<string | null>;
  className: string;
}

export default function BotonZonasDetector({
  camaraId,
  nombre,
  zonas,
  cargarImagen,
  className,
}: Props) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className={`${className} max-sm:h-11 ${zonas.length ? "" : "w-9 justify-center px-0 max-sm:w-11"}`}
        title="Zonas que el detector de personas ignora (un poste, una casaca colgada)"
        aria-label={`Zonas que el detector ignora en ${nombre}${zonas.length ? `: ${zonas.length}` : ""}`}
        data-zonas-boton={camaraId}
      >
        <EyeOff className="h-4 w-4" aria-hidden />
        {zonas.length > 0 && <span className="tabular-nums">{zonas.length}</span>}
      </button>
      {abierto && (
        <ZonasDetectorModal
          camaraId={camaraId}
          nombre={nombre}
          cargarImagen={cargarImagen}
          origen="Cuadro en vivo"
          sinImagen="Sin video todavía: espera a que la cámara se vea y toca «Otro cuadro»."
          renovable
          aboveModals
          onCerrar={() => setAbierto(false)}
        />
      )}
    </>
  );
}
