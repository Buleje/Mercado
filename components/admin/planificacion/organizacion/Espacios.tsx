"use client";

/**
 * Organización › Espacios (ADR-497): los croquis y fotos del local, el
 * almacén o la parcela, y sus zonas con área y responsable.
 */
import { CabeceraSeccion } from "../comun/CabeceraSeccion";
import { CroquisGaleria } from "./CroquisGaleria";
import { ZonasTabla } from "./ZonasTabla";

export function Espacios() {
  return (
    <div className="space-y-6">
      <CabeceraSeccion
        seccion="espacios"
        titulo="Espacios"
        ayuda="Dónde funciona el negocio: un croquis o foto de cada lugar y sus zonas con el tamaño y quién las tiene a cargo."
        ejemplo="Planta del local (foto) · zonas: salón 80 m², almacén 30 m², parcela norte 12 ha."
      />
      <CroquisGaleria />
      <ZonasTabla />
    </div>
  );
}
