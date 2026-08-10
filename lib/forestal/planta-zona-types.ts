/**
 * planta-zona-types — modelo de las ZONAS físicas del aserradero (CTP), para el
 * Mapa de Planta. Cada zona es un polígono dibujado sobre el satélite con un
 * TIPO (dónde entra la madera, dónde se apila la troza, dónde se asierra, dónde
 * sale) — el gemelo espacial del Libro: el Libro dice CUÁNTA madera hay; el mapa
 * dice DÓNDE está y por dónde se mueve.
 *
 * Espeja el modelo de secciones del Campo de cacao (parcela), pero el criterio
 * de color es el TIPO de zona (no las labores). Persistido en KV (PlatformSetting,
 * sin migración), patrón ForestOrigenGeoDB / ForestCtpFicha.
 */

export type ZonaTipo =
  | "entrada"
  | "patio_trozas"
  | "aserrado"
  | "secado"
  | "patio_producto"
  | "despacho"
  | "oficina"
  | "otro";

export interface PlantaZona {
  id: string;
  /** Código corto e imprimible (ej. PT-01 = patio trozas 1). */
  codigo: string;
  nombre: string | null;
  tipo: ZonaTipo;
  /** Polígono como JSON de puntos `[[lat,lng], ...]` (≥3). Null = solo marcador. */
  poligono: string | null;
  /** Centroide (para "ir a" y marcadores sin polígono). */
  lat: number | null;
  lng: number | null;
  /** Superficie estimada del polígono en m² (el aserradero se mide en m², no ha). */
  areaM2: number | null;
  notas: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Config por tipo: etiqueta, color del anillo (token DS → resuelve en Leaflet) e ícono lucide. */
export const ZONA_TIPOS: {
  tipo: ZonaTipo;
  label: string;
  /** Color del contorno/relleno en el mapa. Token del DS (Leaflet resuelve `var(--…)`). */
  ring: string;
  hint: string;
  icon: string;
}[] = [
  { tipo: "entrada", label: "Entrada / Recepción GTF", ring: "var(--data-info-500)", hint: "Donde ingresa la materia prima con su GTF", icon: "LogIn" },
  { tipo: "patio_trozas", label: "Patio de trozas", ring: "var(--data-warning-500)", hint: "Madera rolliza apilada, esperando aserrío", icon: "Trees" },
  { tipo: "aserrado", label: "Zona de aserrado", ring: "var(--accent)", hint: "Sierra / línea de transformación primaria", icon: "Scissors" },
  { tipo: "secado", label: "Secado", ring: "var(--data-8)", hint: "Horno o cancha de secado de aserrada", icon: "Sun" },
  { tipo: "patio_producto", label: "Patio de producto", ring: "var(--data-success-500)", hint: "Madera aserrada terminada, lista para despacho", icon: "Package" },
  { tipo: "despacho", label: "Despacho / Salida", ring: "var(--data-error-500)", hint: "Carga y salida de producto con GTF de salida", icon: "Truck" },
  { tipo: "oficina", label: "Oficina / Administración", ring: "var(--text-tertiary)", hint: "Administración, balanza, control", icon: "Building2" },
  { tipo: "otro", label: "Otra zona", ring: "var(--data-info-700)", hint: "Cualquier otra área de la planta", icon: "MapPin" },
];

const ZONA_TIPO_SET = new Set<string>(ZONA_TIPOS.map((z) => z.tipo));

export function isZonaTipo(v: unknown): v is ZonaTipo {
  return typeof v === "string" && ZONA_TIPO_SET.has(v);
}

export function zonaTipoMeta(tipo: ZonaTipo) {
  return ZONA_TIPOS.find((z) => z.tipo === tipo) ?? ZONA_TIPOS[ZONA_TIPOS.length - 1];
}

/** Normaliza un registro crudo (de KV o del cliente) a una PlantaZona válida. */
export function normalizeZona(input: Partial<PlantaZona> & Record<string, unknown>): PlantaZona {
  const now = new Date().toISOString();
  const num = (v: unknown): number | null => {
    const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : null;
    return n != null && Number.isFinite(n) ? n : null;
  };
  const tipo = isZonaTipo(input.tipo) ? input.tipo : "otro";
  return {
    id: String(input.id ?? "").trim(),
    codigo: String(input.codigo ?? "").trim(),
    nombre: input.nombre != null && String(input.nombre).trim() ? String(input.nombre).trim() : null,
    tipo,
    poligono: typeof input.poligono === "string" && input.poligono.trim() ? input.poligono : null,
    lat: num(input.lat),
    lng: num(input.lng),
    areaM2: num(input.areaM2),
    notas: input.notas != null && String(input.notas).trim() ? String(input.notas).trim() : null,
    createdAt: typeof input.createdAt === "string" ? input.createdAt : now,
    updatedAt: now,
  };
}

// ─── Lo que se UBICA dentro de las zonas ───────────────────────────────────

/**
 * Las tres cosas que ocupan lugar físico en la planta, en el orden del flujo:
 * la troza que espera sierra, el producto terminado que espera despacho y el
 * despacho ya armado que espera camión.
 */
export type ItemKind = "troza" | "producto" | "despacho";

/** Un ítem ubicable: una línea del libro con cantidad y unidad propias. */
export interface Item {
  id: string;
  kind: ItemKind;
  label: string;
  /** Lo que se MUESTRA debajo del código (producto, destino o especie). */
  sub: string | null;
  /** Con lo que se AGRUPA el desglose del patio. Puede no ser lo mismo que
   *  `sub`: un mismo producto sale de especies distintas. */
  especie?: string | null;
  cantidad: number;
  unidad: string;
  cites: boolean;
}

/**
 * Inventario ubicado en UNA zona. Las trozas suman m³; producto y despacho se
 * cuentan por línea a propósito — sus unidades varían (pt, u, m³) y sumarlas
 * daría un total que no significa nada.
 */
export interface ZonaInv {
  trozas: number;
  m3: number;
  productos: number;
  despachos: number;
}
