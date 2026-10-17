/**
 * organizacion/espacios-config.ts — tipos, nombres y cuentas de Espacios
 * (croquis y zonas, ADR-497). Puro.
 *
 * El área se suma por unidad y nunca se convierte: si anotaste el local en m²
 * y la parcela en ha, salen dos totales (mezclarlos esconde de dónde sale
 * cada cifra).
 */
import type { DatosSeccion, TIPOS_ESPACIO, UNIDADES_AREA } from "@/lib/planificacion/secciones";

export type Croquis = DatosSeccion<"espacios">["croquis"][number];
export type Zona = DatosSeccion<"espacios">["zonas"][number];
export type TipoEspacio = (typeof TIPOS_ESPACIO)[number];
export type UnidadArea = (typeof UNIDADES_AREA)[number];

export const MAX_CROQUIS = 20;
export const MAX_ZONAS = 100;

export const NOMBRE_TIPO: Readonly<Record<TipoEspacio, string>> = {
  local: "Local",
  almacén: "Almacén",
  oficina: "Oficina",
  patio: "Patio",
  parcela: "Parcela",
  campo: "Campo",
  otro: "Otro",
};

/** Lo que se mide en hectáreas; el resto, en m². */
const EN_HECTAREAS: ReadonlySet<TipoEspacio> = new Set(["parcela", "campo"]);
export const unidadSugerida = (tipo: TipoEspacio): UnidadArea => (EN_HECTAREAS.has(tipo) ? "ha" : "m²");

const NUMERO = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 });
export const formatoArea = (n: number, unidad: UnidadArea): string => `${NUMERO.format(n)} ${unidad}`;

export const zonaNueva = (id: string): Zona => ({ id, nombre: "", tipo: "local", area: null, unidad: "m²", uso: "", responsable: "", nota: "" });

export interface TotalArea {
  unidad: UnidadArea;
  total: number;
  zonas: number;
}

/** Suma del área por unidad (en el orden m², ha) y cuántas zonas no la tienen anotada. */
export function totalesArea(zonas: readonly Zona[]): { totales: TotalArea[]; sinArea: number } {
  const porUnidad = new Map<UnidadArea, TotalArea>();
  let sinArea = 0;
  for (const z of zonas) {
    if (z.area == null) {
      sinArea += 1;
      continue;
    }
    const t = porUnidad.get(z.unidad) ?? { unidad: z.unidad, total: 0, zonas: 0 };
    t.total += z.area;
    t.zonas += 1;
    porUnidad.set(z.unidad, t);
  }
  const orden: UnidadArea[] = ["m²", "ha"];
  return { totales: orden.flatMap((u) => porUnidad.get(u) ?? []), sinArea };
}
