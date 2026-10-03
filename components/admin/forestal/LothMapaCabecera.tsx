/**
 * LothMapaCabecera — el único título de la vista Mapa del Libro TH y, en una
 * línea, lo que hay en el mapa: operaciones con GPS, árboles del censo, la
 * parcela, cuántos caen fuera y cuántas rutas y puntos tiene el plano. Salió
 * de `LothMapaView` (29-09) cuando entraron las rutas.
 */

import { SectionTitle } from "@buleje/design-system";
import { Loader2 } from "@buleje/design-system/icons";
import { formatNumber } from "@/lib/format";

const plural = (n: number, uno: string, varios: string) => `${formatNumber(n)} ${n === 1 ? uno : varios}`;

interface Props {
  cargando: boolean;
  /**
   * De qué plan es el censo pintado (02-10-2026): el elegido en el chip del
   * libro o, sin elección, el plan activo. `null` = sin plan.
   */
  permiso?: { nombre: string; elegido: boolean } | null;
  operaciones: number;
  arboles: number;
  /** Hectáreas de la parcela declarada (null = no hay parcela). */
  areaHa: number | null;
  fuera: number;
  rutas: number;
  puntos: number;
}

export default function LothMapaCabecera({ cargando, permiso, operaciones, arboles, areaHa, fuera, rutas, puntos }: Props) {
  return (
    <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <SectionTitle>Mapa del área de aprovechamiento</SectionTitle>
      <p className="text-sm tabular-nums text-[var(--text-secondary)]" aria-live="polite">
        {cargando ? (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Cargando ubicaciones…
          </span>
        ) : (
          <>
            {permiso && (
              <span className="font-semibold text-[var(--text-primary)]">
                {permiso.elegido ? `Permiso ${permiso.nombre}` : `Plan activo ${permiso.nombre}`} ·{" "}
              </span>
            )}
            {plural(operaciones, "operación geolocalizada", "operaciones geolocalizadas")}
            {arboles > 0 && <> · {plural(arboles, "árbol del censo", "árboles del censo")}</>}
            {areaHa != null && <> · parcela {Number(areaHa).toFixed(1)} ha</>}
            {areaHa != null && fuera > 0 && <span className="font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"> · {fuera} fuera</span>}
            {rutas > 0 && <> · {plural(rutas, "ruta", "rutas")}</>}
            {puntos > 0 && <> · {plural(puntos, "punto", "puntos")}</>}
          </>
        )}
      </p>
    </header>
  );
}
