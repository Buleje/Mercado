"use client";

/**
 * LothMapaVacio — lo que dice el mapa del Libro TH cuando todavía no tiene
 * nada que mostrar, y el renglón «Toca un punto del mapa» cuando no hay
 * censo. Salió de `LothMapaMarco` tal cual (29-09), cuando entraron las rutas.
 */

import { Camera, MapPin } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";

/** Encima del mapa: sin polígono, sin censo y sin operaciones con GPS. */
export function LothMapaSinGeo() {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-6">
      <div className="pointer-events-auto max-w-md rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]/95 p-5 text-center shadow-lg backdrop-blur">
        <MapPin className="mx-auto mb-2 h-8 w-8 text-[var(--text-tertiary)]" aria-hidden="true" />
        <p className="flex items-center justify-center gap-1 text-sm font-bold text-[var(--text-primary)]">
          Todavía no hay geolocalización
          <InfoTip
            title="Cómo se completa el plano"
            what="Dibuja la parcela de aprovechamiento (Dibujar → Área de aprovechamiento)."
            affects="Carga el censo con sus coordenadas UTM y captura el GPS al registrar cada tala."
            example="Los tres alimentan el plano y el cumplimiento EUDR."
          />
        </p>
      </div>
    </div>
  );
}

/** Debajo del mapa, sin censo: qué pasa al tocar un punto. */
export function LothMapaTocaUnPunto() {
  return (
    <p className="flex items-center gap-1.5 border-t border-[var(--rule-soft)] px-3 py-2 text-xs text-[var(--text-tertiary)]">
      <Camera className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> Toca un punto del mapa
      <InfoTip icono="ayuda" title="Tocar un punto del mapa" what="Muestra su coordenada UTM, la especie del árbol y la foto de campo, si la tiene." />
    </p>
  );
}
