"use client";

/**
 * Lo de EUDR que va al riel del libro (compactación 17-10): la cobertura de
 * origen se mira en el Radar —la cadena hasta el título— y el GeoJSON es el
 * archivo del dossier UE.
 */

import { Download, Route } from "@buleje/design-system/icons";
import { AccionesDeLaVista, TextoDeAccion } from "@/components/admin/shared/libro-acciones-vista";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { BTN_ACCION_RIEL } from "./ctp-cabecera-vista";

const HREF_RADAR = "/admin?tab=ctp-libro-operaciones&vista=radar";

export default function RielDeEudr({
  onNavigate,
  geolocalizados,
  onGeoJson,
}: {
  onNavigate?: (vista: string) => void;
  geolocalizados: number;
  onGeoJson: () => void;
}) {
  return (
    <AccionesDeLaVista>
      <button
        type="button"
        onClick={() => (onNavigate ? onNavigate("radar") : irAEnlace(HREF_RADAR))}
        title="Cobertura de origen en el Radar: qué guías trazan hasta su título habilitante"
        className={BTN_ACCION_RIEL}
      >
        <Route className="h-4 w-4 shrink-0" aria-hidden />
        <TextoDeAccion>Cobertura en el Radar</TextoDeAccion>
      </button>
      <button
        type="button"
        onClick={onGeoJson}
        disabled={geolocalizados === 0}
        title={
          geolocalizados > 0
            ? "Descargar la geolocalización de los orígenes en GeoJSON (dossier UE)"
            : "Geolocaliza al menos un origen"
        }
        className={BTN_ACCION_RIEL}
      >
        <Download className="h-4 w-4 shrink-0" aria-hidden />
        <TextoDeAccion>GeoJSON</TextoDeAccion>
      </button>
    </AccionesDeLaVista>
  );
}
