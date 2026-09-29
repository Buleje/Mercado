"use client";

/**
 * LothMapaFechaImagen — la FECHA de lo que se está mirando, siempre a la vista
 * en la esquina del mapa (al lado del zoom):
 *
 *   · Sentinel-2: «Imagen del 21 set 2026», el selector de fechas con las
 *     nubes sobre el área, «Comparar» (cortina entre dos fechas) y «buscar
 *     imágenes nuevas».
 *   · Foto de Esri: de cuándo es en el centro del área y hace cuánto (sobre
 *     Blas, junio de 2022), con el atajo a la reciente.
 *   · Mapa topográfico o calles: sólo el atajo «Satélite del 21 set».
 *   · Nubes y humo de hoy / focos de calor, con su día.
 *
 * Una foto sin fecha se lee como «así está hoy» y en el monte eso engaña: la
 * trocha abierta este año no está en la foto de hace cuatro.
 */

import { useEffect } from "react";
import { CloudSun, Flame, Globe, Loader2, RefreshCw, Satellite, Columns2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { diasEntre, etiquetaEscena, fechaCorta, GIBS_COLOR_REAL_VISIBLE_HASTA } from "@/lib/forestal/loth-imagenes";
import { limaDateKey } from "@/lib/utils";
import type { BasemapId } from "./loth-mapa-canvas-ctx";
import { avisarTapasDelMapa } from "./loth-mapa-etiquetas";
import type { LothMapaImagenes } from "./hooks/use-loth-mapa-imagenes";

interface Props {
  basemap: BasemapId;
  onBase: (b: BasemapId) => void;
  img: LothMapaImagenes;
  /** Zoom del mapa: las nubes de hoy sólo se dibujan de lejos. */
  zoom: number;
  /** Aleja el mapa a la zona (~15 km alrededor del área). */
  onVerZona: () => void;
}

/* Prendido y apagado en clases SEPARADAS: `${MINI} bg-…` no pisa el fondo de
   MINI (gana el orden del CSS, no el del string) y el botón quedaba blanco sobre blanco. */
const MINI_BASE = "inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold transition-colors disabled:opacity-50";
const MINI = `${MINI_BASE} border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:border-[var(--accent)]`;
const MINI_ON = `${MINI_BASE} border-transparent bg-[var(--brand-ink)] text-white`;

/** «hace 4 años», «hace 8 meses», «hace 5 días». */
function haceCuanto(dias: number): string {
  if (dias >= 365) {
    const a = Math.floor(dias / 365);
    return `hace ${a} ${a === 1 ? "año" : "años"}`;
  }
  if (dias >= 60) return `hace ${Math.floor(dias / 30)} meses`;
  return dias <= 0 ? "de hoy" : `hace ${dias} ${dias === 1 ? "día" : "días"}`;
}

export default function LothMapaFechaImagen({ basemap, onBase, img, zoom, onVerZona }: Props) {
  const { escena, esri } = img;
  const hoy = limaDateKey();
  const s2 = basemap === "s2" && escena;
  const conNubes = img.nubesHoy && img.colorReal;
  const conFocos = img.focos && img.fechasFocos.length > 0;
  const atajo = !s2 && escena && basemap !== "sat";
  const aviso = img.avisos[0] ?? null;
  const hayAlgo = s2 || basemap === "sat" || atajo || conNubes || conFocos || (basemap === "s2" && (img.estado === "cargando" || aviso));

  // Crece o se achica: las etiquetas de los árboles se re-acomodan para no quedar debajo.
  const huella = `${basemap}|${escena?.fecha ?? ""}|${conNubes}|${conFocos}|${!!img.comparada}|${aviso ?? ""}`;
  useEffect(() => {
    avisarTapasDelMapa();
  }, [huella]);

  if (!hayAlgo) return null;
  const esriDias = esri ? diasEntre(esri.fecha, hoy) : null;

  // Con el mapa topográfico y nada más prendido: sólo el atajo, sin caja alrededor.
  if (atajo && !conNubes && !conFocos) {
    return (
      <button
        type="button"
        data-tapa-mapa
        data-fecha-imagen
        onClick={() => onBase("s2")}
        className="absolute left-14 top-3 z-20 inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]/95 px-3 text-xs font-bold text-[var(--text-primary)] shadow-md backdrop-blur transition-colors hover:border-[var(--accent)]"
      >
        <Satellite className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden="true" /> Satélite del {fechaCorta(escena.fecha, false)}
      </button>
    );
  }

  return (
    <div
      data-tapa-mapa
      data-fecha-imagen
      className="absolute left-14 top-3 z-20 max-w-[calc(100%-4.5rem)] space-y-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]/95 px-3 py-2 shadow-md backdrop-blur sm:max-w-[27rem]"
    >
      {s2 && (
        <>
          {/* En el celular el mapa mide 420 px: la fecha la dice el selector (una sola fila). */}
          <div className="flex items-center gap-2 max-sm:hidden">
            <Satellite className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden="true" />
            <p className="text-sm font-bold text-[var(--text-primary)]">
              Imagen del {fechaCorta(escena.fecha)}
              <span className="ml-1.5 font-semibold text-[var(--text-tertiary)]">{haceCuanto(diasEntre(escena.fecha, hoy))}</span>
            </p>
            <InfoTip
              title="Satélite reciente (Sentinel-2)"
              what="Una foto de 10 m por píxel que pasa cada 2 a 5 días. Se ven caminos, claros, ríos y lo talado; un árbol suelto, no."
              affects="Las nubes de cada fecha (con su sombra) están medidas SOBRE TU ÁREA, no en el cuadro entero del satélite. De entrada se muestra la más nueva con hasta 30 % tapado."
              example="Abriste una trocha la semana pasada: elige la fecha más nueva y compárala con la de hace un mes."
              side="bottom"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <select
              value={escena.fecha}
              onChange={(e) => img.elegirFecha(e.target.value)}
              aria-label="Fecha de la imagen de Sentinel-2"
              className="h-9 w-auto min-w-0 flex-1 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-xs font-bold text-[var(--text-primary)] sm:flex-none"
            >
              {img.escenas.map((e) => (
                <option key={e.fecha} value={e.fecha}>
                  {etiquetaEscena(e)}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => img.comparar(img.comparada ? null : undefined)} aria-pressed={!!img.comparada} className={img.comparada ? MINI_ON : MINI} disabled={img.escenas.length < 2}>
              <Columns2 className="h-3.5 w-3.5" aria-hidden="true" /> <span className="max-sm:sr-only">Comparar</span>
            </button>
            <button type="button" onClick={img.refrescar} disabled={img.estado === "cargando"} className={MINI} aria-label="Buscar imágenes nuevas" title="Buscar imágenes nuevas (el satélite pasa cada 2 a 5 días)">
              {img.estado === "cargando" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
            </button>
          </div>
        </>
      )}

      {basemap === "s2" && !escena && (
        <p className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)]">
          {img.estado === "cargando" && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          {img.estado === "cargando" ? "Buscando las pasadas del satélite… mientras, la foto de Esri." : "Sin imagen reciente: se muestra la foto de Esri."}
        </p>
      )}

      {basemap === "sat" && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <Globe className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />
          <p className="text-sm font-bold text-[var(--text-primary)]">
            {esri ? `Foto de Esri del ${fechaCorta(esri.fecha)}` : "Esri: fecha desconocida"}
            {esriDias != null && (
              <span className={`ml-1.5 font-semibold ${esriDias > 365 ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" : "text-[var(--text-tertiary)]"}`}>{haceCuanto(esriDias)}</span>
            )}
          </p>
          <InfoTip
            title="De cuándo es la foto de Esri"
            what={
              esri
                ? `Es la foto que Esri usa en el centro de tu área${esri.sensor ? ` (${esri.sensor}` : ""}${esri.resolucionM ? `, ${esri.resolucionM} m` : ""}${esri.sensor ? ")" : ""}. Esri junta fotos de distintas fechas: en otro punto del mapa puede ser otra.`
                : "Esri junta fotos de distintas fechas y su servicio no respondió cuál es la de tu área."
            }
            affects="Tiene más detalle que Sentinel-2, pero no muestra lo que cambió después: trochas nuevas, claros, lo talado."
            example="Para ver cómo está hoy, elige «Satélite reciente» en Capas."
            side="bottom"
          />
          {escena && (
            <button type="button" onClick={() => onBase("s2")} className={MINI}>
              <Satellite className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden="true" /> Ver la del {fechaCorta(escena.fecha, false)}
            </button>
          )}
        </div>
      )}

      {atajo && (
        <button type="button" onClick={() => onBase("s2")} className={MINI}>
          <Satellite className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden="true" /> Satélite del {fechaCorta(escena.fecha, false)}
        </button>
      )}

      {conNubes && img.colorReal && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)]">
            <CloudSun className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Nubes y humo: {img.colorReal.fecha === hoy ? "hoy" : fechaCorta(img.colorReal.fecha, false)} · NASA {img.colorReal.satelite}
            {zoom > GIBS_COLOR_REAL_VISIBLE_HASTA && <span className="font-semibold text-[var(--text-tertiary)]">· se ven de lejos</span>}
          </p>
          {zoom > GIBS_COLOR_REAL_VISIBLE_HASTA && img.zonaAmplia.length > 0 && (
            <button type="button" onClick={onVerZona} className={MINI}>
              Ver la zona
            </button>
          )}
        </div>
      )}
      {conFocos && (
        <p className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)]">
          <Flame className="h-3.5 w-3.5 shrink-0 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" aria-hidden="true" />
          Focos de calor: {img.fechasFocos.map((f) => fechaCorta(f, false)).join(" y ")}
        </p>
      )}

      {aviso && basemap === "s2" && <p className="text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">{aviso}</p>}
    </div>
  );
}
