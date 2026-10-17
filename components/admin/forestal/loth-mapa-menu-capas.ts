/**
 * loth-mapa-menu-capas — el menú «Capas» del mapa del Libro TH, en tres grupos:
 * **Base** (lo que va debajo de todo), **Encima** (lo que viene de afuera y se
 * superpone) y **Tus datos** (cuadrícula, censo, operaciones). Separado de
 * `loth-mapa-menus` al sumar las imágenes recientes (29-09): ese archivo pasaba
 * de 400 líneas.
 */

import { CloudSun, Eye, EyeOff, Flame, Globe, Grid3x3, History, Map as MapaIcono, Route, Satellite, ShieldCheck, Tag, Tags, TreePine, Waves } from "@buleje/design-system/icons";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import { fechaCorta, nubesDeEscena } from "@/lib/forestal/loth-imagenes";
import { OVERLAYS } from "./loth-mapa-overlays";
import { SECTION_LABEL } from "./loth-mapa-shared";
import { MODO_ETIQUETAS_LABEL, MODOS_ETIQUETAS, type ModoEtiquetas } from "./loth-mapa-etiquetas";
import type { LothMapaHerramientasEstado } from "./hooks/use-loth-mapa-herramientas";
import type { LothMapaDerivados } from "./hooks/use-loth-mapa-derivados";
import type { LothMapaImagenes } from "./hooks/use-loth-mapa-imagenes";

/** La capa de ríos y caminos de OpenStreetMap (la misma que usa el planificador). */
export interface OsmDelMenu {
  activo: boolean;
  cargando: boolean;
  alternar: () => void;
}

/** Qué dice la etiqueta sobre cada árbol del censo (se recuerda en este navegador). */
export interface EtiquetasDelMenu {
  modo: ModoEtiquetas;
  cambiar: (m: ModoEtiquetas) => void;
}

const HINT_ETIQUETAS: Record<ModoEtiquetas, string> = {
  etapa: "«114 · Trozado ×3»: el código y en qué va, según el libro",
  codigo: "Sólo el número de cada árbol, como en la placa",
  ninguna: "El mapa limpio: el árbol se lee al pasar el mouse o al tocarlo",
};
const ICONO_ETIQUETAS: Record<ModoEtiquetas, MenuAccion["icon"]> = { etapa: Tags, codigo: Tag, ninguna: EyeOff };

/** Lo que el menú necesita de las imágenes recientes (Sentinel-2, Esri, NASA). */
export type ImagenesDelMenu = Pick<LothMapaImagenes, "estado" | "escena" | "esri" | "colorReal" | "nubesHoy" | "setNubesHoy" | "focos" | "setFocos">;

/**
 * Capas en tres grupos (29-09): **Base** (lo que va debajo de todo: mapa,
 * foto de Esri, Sentinel-2 reciente, calles, la imagen histórica), **Encima**
 * (lo que viene de afuera y se superpone: ríos y caminos, ANP, ordenamiento,
 * nubes y humo de hoy, focos de calor) y **Tus datos** (cuadrícula, censo y
 * sus etiquetas, operaciones del libro).
 */
export function menuCapas(h: LothMapaHerramientasEstado, der: LothMapaDerivados, etiquetas?: EtiquetasDelMenu, osm?: OsmDelMenu, img?: ImagenesDelMenu): MenuAccion[] {
  const BASE = "Base";
  const ENCIMA = "Encima";
  const TUYO = "Tus datos";
  const esri = img?.esri ? `la foto de tu área es del ${fechaCorta(img.esri.fecha)}` : "Esri no dice de cuándo es la foto";
  const sinEscena = !img?.escena;
  const bases: MenuAccion[] = [
    { id: "base-topo", seccion: BASE, label: "Mapa topográfico", hint: "Relieve, ríos y quebradas (Esri)", icon: MapaIcono, activo: h.basemap === "topo", onSelect: () => h.setBasemap("topo") },
    { id: "base-sat", seccion: BASE, label: "Imagen satelital Esri", hint: `Alta definición, pero no es de ahora: ${esri}`, icon: Globe, activo: h.basemap === "sat", onSelect: () => h.setBasemap("sat") },
    ...(img
      ? [
          {
            id: "base-s2",
            seccion: BASE,
            label: "Satélite reciente (Sentinel-2)",
            hint: img.escena
              ? `${Math.round(nubesDeEscena(img.escena))} % nubes ${img.escena.nubesAreaPct == null ? "en el cuadro del satélite" : "sobre tu área"} · pasa cada 2 a 5 días, se ven caminos y claros`
              : img.estado === "cargando"
                ? "Buscando las pasadas de los últimos 90 días…"
                : "Todavía no hay pasadas de tu área",
            icon: Satellite,
            meta: img.escena ? fechaCorta(img.escena.fecha, false) : undefined,
            busy: img.estado === "cargando" && sinEscena,
            disabled: sinEscena,
            activo: h.basemap === "s2",
            onSelect: () => h.setBasemap("s2"),
          },
        ]
      : []),
    { id: "base-street", seccion: BASE, label: "Calles", hint: "Carreteras y centros poblados (OpenStreetMap)", icon: Route, activo: h.basemap === "street", onSelect: () => h.setBasemap("street") },
    {
      id: "base-historica",
      seccion: BASE,
      label: "Imagen histórica (antes del corte EUDR)",
      hint: h.releases.length === 0 && !h.cargandoReleases ? "El archivo de Esri no respondió" : "La misma zona a fines de 2020, con una cortina para comparar",
      icon: History,
      activo: !!h.wayback,
      busy: h.cargandoReleases,
      disabled: h.releases.length === 0,
      onSelect: () => (h.wayback ? h.setWayback(null) : h.verCorteEudr()),
    },
  ];
  const encima: MenuAccion[] = [
    ...(osm
      ? [
          {
            id: "osm",
            seccion: ENCIMA,
            label: "Ríos y caminos (OpenStreetMap)",
            hint: "Los que ya existen en la zona de los árboles; el planificador los usa",
            icon: Waves,
            activo: osm.activo,
            busy: osm.cargando,
            onSelect: osm.alternar,
          },
        ]
      : []),
    ...OVERLAYS.map((o) => ({
      id: `ov-${o.id}`,
      seccion: ENCIMA,
      label: o.label === "ANP" ? "Áreas Naturales Protegidas" : o.label,
      hint: `${o.detalle} — ${o.fuente}`,
      icon: ShieldCheck,
      activo: h.overlays.includes(o.id),
      onSelect: () => h.toggleOverlay(o.id),
    })),
    ...(img
      ? [
          {
            id: "vivo-nubes",
            seccion: ENCIMA,
            label: "Nubes y humo de hoy",
            hint: img.colorReal
              ? `NASA, ${fechaCorta(img.colorReal.fecha)} (${img.colorReal.satelite}): se ve la nube, no el árbol`
              : img.estado === "cargando"
                ? "Mirando si NASA ya tiene la imagen de hoy…"
                : "NASA todavía no tiene la imagen de hoy ni la de ayer",
            icon: CloudSun,
            meta: img.colorReal ? fechaCorta(img.colorReal.fecha, false) : undefined,
            disabled: !img.colorReal,
            activo: img.nubesHoy && !!img.colorReal,
            onSelect: () => img.setNubesHoy((v) => !v),
          },
          {
            id: "vivo-focos",
            seccion: ENCIMA,
            label: "Focos de calor (últimas 24-48 h)",
            hint: "Fuego visto por satélite ayer y hoy (NASA VIIRS, 375 m)",
            icon: Flame,
            activo: img.focos,
            onSelect: () => img.setFocos((v) => !v),
          },
        ]
      : []),
  ];
  const tuyo: MenuAccion[] = [
    { id: "grid", seccion: TUYO, label: "Cuadrícula UTM", hint: "Las líneas con su Este y Norte, como en el plano", icon: Grid3x3, activo: h.showGrid, onSelect: () => h.setShowGrid((v) => !v) },
    ...(der.censoAll.length > 0
      ? [{ id: "censo", seccion: TUYO, label: "Censo forestal", hint: "Cada árbol pintado por su categoría del POA", icon: TreePine, meta: String(der.censoAll.length), activo: h.showCenso, onSelect: () => h.setShowCenso((v) => !v) }]
      : []),
    ...(der.censoAll.length > 0 && h.showCenso && etiquetas
      ? MODOS_ETIQUETAS.map((m) => ({
          id: `etq-${m}`,
          seccion: TUYO,
          label: MODO_ETIQUETAS_LABEL[m],
          hint: HINT_ETIQUETAS[m],
          icon: ICONO_ETIQUETAS[m],
          activo: etiquetas.modo === m,
          onSelect: () => etiquetas.cambiar(m),
        }))
      : []),
    ...(der.sectionsPresent.length > 1
      ? der.sectionsPresent.map((s) => ({
          id: `sec-${s}`,
          seccion: TUYO,
          label: `Operaciones · ${SECTION_LABEL[s] ?? s}`,
          hint: "Mostrar u ocultar los puntos de esta sección del libro",
          icon: Eye,
          activo: !h.hidden.has(s),
          onSelect: () => h.toggleSection(s),
        }))
      : []),
  ];
  return [...bases, ...encima, ...tuyo];
}
