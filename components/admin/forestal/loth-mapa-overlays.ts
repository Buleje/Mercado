/**
 * loth-mapa-overlays — capas OFICIALES del Estado peruano que se superponen al
 * mapa del Libro TH para hacer, en pantalla, el mismo cruce que hace OSINFOR:
 * ¿la UMF pisa un Área Natural Protegida? ¿cae dentro de un Bosque de Producción
 * Permanente o sobre tierras de comunidades nativas?
 *
 * Son servicios ArcGIS MapServer públicos (no WMS): se consumen pidiendo un PNG
 * transparente del bbox visible (`/export`), sin dependencias extra —
 * `LothMapaCanvas` lo re-pide en cada `moveend`.
 *
 * Verificado el 2026-07-22 (HTTP 200 + PNG con contenido sobre Ucayali). Si un
 * servicio se cae, la capa simplemente no pinta: el mapa no se rompe.
 */

export interface OverlayDef {
  id: string;
  label: string;
  /** Qué responde esta capa, en una línea (va en el tooltip del toggle). */
  detalle: string;
  fuente: string;
  /** URL del MapServer (sin `/export`). */
  url: string;
  opacity: number;
  /** Color del chip/leyenda. */
  color: string;
}

export const OVERLAYS: OverlayDef[] = [
  {
    id: "anp",
    label: "ANP",
    detalle: "Áreas Naturales Protegidas y zonas de amortiguamiento",
    fuente: "SERNANP",
    url: "https://geoservicios.sernanp.gob.pe/arcgis/rest/services/gestion_de_anp/peru_sernanp_0214/MapServer",
    opacity: 0.55,
    color: "#16a34a",
  },
  {
    id: "ordenamiento",
    label: "Ordenamiento forestal",
    detalle: "Bosques de Producción Permanente, locales, protectores y de comunidades",
    fuente: "SERFOR",
    url: "https://geo.serfor.gob.pe/geoservicios/rest/services/Visor/Ordenamiento_Forestal/MapServer",
    opacity: 0.55,
    color: "#a16207",
  },
];

export type OverlayId = (typeof OVERLAYS)[number]["id"];
