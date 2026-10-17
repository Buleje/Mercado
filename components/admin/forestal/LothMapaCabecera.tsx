/**
 * LothMapaCabecera — el único título de la vista Mapa del Libro TH y, en una
 * línea, lo que hay en el mapa: operaciones con GPS, árboles del censo, la
 * parcela, cuántos caen fuera y cuántas rutas y puntos tiene el plano. Salió
 * de `LothMapaView` (29-09) cuando entraron las rutas.
 */

import { SectionTitle } from "@buleje/design-system";
import { Loader2 } from "@buleje/design-system/icons";
import { formatNumber } from "@/lib/format";
import { areaVsDeclarada } from "./loth-mapa-alcance";

const plural = (n: number, uno: string, varios: string) => `${formatNumber(n)} ${n === 1 ? uno : varios}`;

export type PermisoCabecera =
  | { tipo: "todos" }
  | { tipo: "sin-permiso" }
  | { tipo: "plan"; nombre: string; activo: boolean };

/** Lo que va en negrita al comienzo de la línea. */
export function etiquetaPermiso(p: PermisoCabecera, areasPermisos: number): string {
  if (p.tipo === "todos") return `Todos los permisos · ${plural(areasPermisos, "área de permiso", "áreas de permiso")}`;
  if (p.tipo === "sin-permiso") return "Líneas sin permiso";
  return p.activo ? `Plan activo ${p.nombre}` : `Permiso ${p.nombre}`;
}

interface Props {
  cargando: boolean;
  /**
   * Qué permiso mira el mapa (02-10-2026): «Todos», uno elegido en el chip del
   * libro, «sin permiso», o —fuera del libro, sin chip— el plan activo.
   * `null` = sin plan.
   */
  permiso?: PermisoCabecera | null;
  /** El área es la del negocio (el permiso no tiene la suya): sin diferencia contra lo declarado. */
  heredada?: boolean;
  operaciones: number;
  arboles: number;
  /** Hectáreas de la parcela declarada (null = no hay parcela). */
  areaHa: number | null;
  /** Las que declara el plan (ADR-462 §6): junto a la dibujada, con la diferencia. */
  declaradaHa?: number | null;
  /** Con «Todos»: cuántos permisos tienen su propia área en el mapa. */
  areasPermisos?: number;
  fuera: number;
  rutas: number;
  puntos: number;
}

export default function LothMapaCabecera({ cargando, permiso, operaciones, arboles, areaHa, declaradaHa, heredada = false, areasPermisos = 0, fuera, rutas, puntos }: Props) {
  const vs = areaHa != null && declaradaHa != null ? areaVsDeclarada(areaHa, declaradaHa) : null;
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
                {etiquetaPermiso(permiso, areasPermisos)} ·{" "}
              </span>
            )}
            {plural(operaciones, "operación geolocalizada", "operaciones geolocalizadas")}
            {arboles > 0 && <> · {plural(arboles, "árbol del censo", "árboles del censo")}</>}
            {areaHa != null && !vs && <> · {heredada ? "área del negocio (heredada)" : "parcela"} {Number(areaHa).toFixed(1)} ha</>}
            {vs && (
              <span data-area-vs-declarada>
                {" "}· {heredada ? "área del negocio" : "área dibujada"} {vs.dibujada}
                {heredada && " (heredada)"}
                {vs.declarada && (
                  <>
                    {" "}· declarada {vs.declarada}
                    {!heredada && <> · <b className="font-semibold text-[var(--text-primary)]">{vs.diferencia}</b></>}
                  </>
                )}
              </span>
            )}
            {areasPermisos > 0 && permiso?.tipo !== "todos" && <> · {plural(areasPermisos, "área de permiso", "áreas de permisos")}</>}
            {areaHa != null && fuera > 0 && <span className="font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"> · {fuera} fuera</span>}
            {rutas > 0 && <> · {plural(rutas, "ruta", "rutas")}</>}
            {puntos > 0 && <> · {plural(puntos, "punto", "puntos")}</>}
          </>
        )}
      </p>
    </header>
  );
}
