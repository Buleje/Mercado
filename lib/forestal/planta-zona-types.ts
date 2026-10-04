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

export type PlanoPlanta = "satelite" | "croquis";

export type ZonaTipo =
  | "entrada"
  | "patio_trozas"
  | "aserrado"
  | "secado"
  | "patio_producto"
  | "reserva"
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
  /**
   * En qué plano está dibujada (ADR-465, croquis 2026-10-03). Sin el campo =
   * «satelite»: `poligono` en `[[lat,lng]]` y `areaM2` geodésica. En «croquis»:
   * `poligono` en `[[y,x]]` METROS sobre el plano (origen en la esquina
   * inferior izquierda del terreno, y hacia arriba — el `CRS.Simple` de
   * Leaflet), `lat/lng` = centroide en `[y,x]` y `areaM2` con fórmula plana.
   */
  plano?: PlanoPlanta;
  /**
   * Qué ES según la leyenda del plano (03-10): «15 Cinta principal» →
   * maquinaria. Sin el campo = zona vieja o dibujada a mano (se ve por su
   * tipo). Va en el mismo KV: sin migración.
   */
  componente?: ComponenteZona;
  createdAt: string;
  updatedAt: string;
}

// ─── Componente del plano (la leyenda del croquis, 03-10) ──────────────────

/**
 * Qué ES una zona según la leyenda del plano —madera, una máquina, un techo,
 * el baño—, que no es lo mismo que qué se HACE ahí (el `ZonaTipo`). El
 * catálogo (formato, ícono, clasificador) vive en `croquis-componentes.ts`.
 */
export const CATEGORIAS_COMPONENTE = [
  "madera", "maquinaria", "techo", "servicio", "oficina", "seguridad", "acceso", "limite", "naturaleza", "otro",
] as const;
export type CategoriaComponente = (typeof CATEGORIAS_COMPONENTE)[number];

export interface ComponenteZona {
  /** El número de la leyenda (el círculo del plano); null = sin número. */
  numero: number | null;
  /** El renglón de la leyenda («Cinta principal»). */
  nombre: string;
  categoria: CategoriaComponente;
}

const CATEGORIA_SET = new Set<string>(CATEGORIAS_COMPONENTE);

export function isCategoriaComponente(v: unknown): v is CategoriaComponente {
  return typeof v === "string" && CATEGORIA_SET.has(v);
}

/** De un valor crudo (KV o cliente) a un componente válido; null = la zona no tiene. */
export function normalizarComponente(v: unknown): ComponenteZona | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!isCategoriaComponente(o.categoria)) return null;
  const n = typeof o.numero === "number" && Number.isInteger(o.numero) && o.numero > 0 && o.numero < 1000 ? o.numero : null;
  return { numero: n, nombre: typeof o.nombre === "string" ? o.nombre.trim().slice(0, 120) : "", categoria: o.categoria };
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
  // La reserva es una cancha APARTADA: lo que se apila ahí ya tiene dueño. Por
  // eso es su propio tipo y no un patio más — desde ella se emite la guía con
  // los productos que tiene adentro ya cargados.
  { tipo: "reserva", label: "Reserva para despacho", ring: "var(--data-6)", hint: "Cancha apartada para un cliente o lote; desde acá se emite su guía", icon: "BookmarkCheck" },
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

/** Lo que llega de KV o del cliente: el componente puede venir roto o en null (= borrarlo). */
export type ZonaCruda = Partial<Omit<PlantaZona, "componente">> & { componente?: unknown } & Record<string, unknown>;

/** Normaliza un registro crudo (de KV o del cliente) a una PlantaZona válida. */
export function normalizeZona(input: ZonaCruda): PlantaZona {
  const now = new Date().toISOString();
  const num = (v: unknown): number | null => {
    const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : null;
    return n != null && Number.isFinite(n) ? n : null;
  };
  const tipo = isZonaTipo(input.tipo) ? input.tipo : "otro";
  const componente = normalizarComponente(input.componente);
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
    ...(input.plano === "croquis" ? { plano: "croquis" as const } : {}),
    ...(componente ? { componente } : {}),
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
  /* ── Croquis (ADR-465): lo que pide la ficha de zona y los filtros ── */
  /** Pie tablar, si la línea lo tiene (aserrada) o se puede derivar (troza con Oxapampino). */
  pt?: number | null;
  piezas?: number | null;
  /** Dueño de la madera (titular/proveedor del ingreso o de la corrida); null = no cargado. */
  dueno?: string | null;
  permiso?: string | null;
  /**
   * Las trozas de una pila (ítem «troza» = la guía/ingreso). Una troza que se
   * separa se ubica sola con la clave `claveTroza(id)` y manda sobre su pila.
   */
  trozas?: TrozaUbicable[];
}

export interface TrozaUbicable {
  id: string;
  /** Código de planta o codificación de la troza (lo que está pintado en la madera). */
  codigo: string | null;
  m3: number | null;
  pt: number | null;
}

/**
 * Clave de ubicación: la PILA se ubica por su `entryId` (como siempre); una
 * troza SEPARADA, por `troza:<id>`, y su ubicación manda sobre la de su pila.
 */
export const claveTroza = (trozaId: string): string => `troza:${trozaId}`;
export const esClaveTroza = (clave: string): boolean => clave.startsWith("troza:");

/** Una ubicación en el plano: zona y, opcionalmente, el punto (lat/lng en satélite, y/x en metros en croquis). */
export interface UbicacionPlanta {
  zonaId: string;
  lat?: number | null;
  lng?: number | null;
}

/** Un cambio de ubicación del PUT por lote (varias a la vez = UNA escritura). `zonaId: null` = sacar del plano. */
export interface AsignacionPlanta {
  clave: string;
  zonaId: string | null;
  lat?: number | null;
  lng?: number | null;
}

/** Una máquina del croquis (D1 cargador, D2/D3 forestales, D4–D6 camiones, D7 oruga). */
export interface MaquinaPlanta {
  codigo: string;
  nombre: string;
  /** Posición en metros sobre el plano. */
  x: number;
  y: number;
  /** «A veces están en otro almacén»: fuera = no está en la planta. */
  fuera: boolean;
}

/** El croquis del aserradero de un negocio (KV `ctp-planta-croquis:{tenantId}`). */
export interface PlantaCroquis {
  version: number;
  anchoM: number;
  altoM: number;
  /** Imagen de fondo (plano escaneado/dibujado); null = solo zonas. */
  imagenUrl: string | null;
  maquinas: MaquinaPlanta[];
  actualizadoEn: string;
}

/** Un hecho de la vida de una troza, con la fecha que el Libro ya guarda (ADR-465: no se inventan estaciones). */
export interface EventoTroza {
  tipo: "recepcion" | "apartado" | "lote" | "lote_mixto" | "consumo" | "retrozado" | "descarte" | "despacho";
  /** ISO; las date-only del libro se formatean con `timeZone: "UTC"`. */
  fecha: string;
  /** Lo que se nombra: N° de guía, código de lote, N° de corrida, N° de GTF de salida. */
  ref: string | null;
  detalle: string | null;
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
