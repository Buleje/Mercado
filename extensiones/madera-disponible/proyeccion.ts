/**
 * Pieza `madera-disponible` — de «Productos disponibles» del libro a lo que se
 * puede mostrar en una página PÚBLICA. Puro: sin servidor, sin fecha propia.
 *
 * Qué entra (01-10):
 *  · sólo lo LIBRE: lo apartado ya tiene dueño (ADR-418) y lo marcado como
 *    usado ya no está (la DB class ya lo deja afuera);
 *  · sólo lo PROPIO: lo que se asierra por encargo (`duenoMadera = tercero`) o
 *    viene de una guía de servicio (`maderaDeTercero`, ADR-437) no es del
 *    centro y no se puede vender. En Blas es TODO lo disponible hoy (WASACO).
 *
 * Qué NUNCA sale: costos, proveedores, titulares, permisos, guías, lotes, a
 * quién está apartado. La corrida se copia a una forma nueva con esos campos
 * vacíos ANTES de calcular nada: así ni siquiera viajan dentro de la caché.
 *
 * Las cifras reusan las de la pestaña (`filasDeProductos` → `porGrupo`): el m³
 * es el SALDO DEL LIBRO y el pt es m³ × 424 (madera ya aserrada), los mismos
 * números que ve el dueño en el panel.
 */
import {
  SIN_ESPECIE,
  filasDeProductos,
  porGrupo,
  totalDeGrupos,
  type ApartadoProducto,
  type CorridaDisponible,
  type FilaProducto,
} from "@/lib/forestal/productos-disponibles-resumen";

/** La parte de una corrida de `ForestCtpDB.productosDisponibles` que esta pieza mira. */
export interface CorridaDelLibro {
  id: string;
  fecha: string;
  especie: string | null;
  producto: string | null;
  presentacion: string | null;
  unidad: string | null;
  duenoMadera?: string | null;
  usadoAt: string | null;
  producido: number;
  despachado: number;
  reprocesado: number;
  disponible: number;
  apartado?: unknown;
  costoConsumos?: readonly { maderaDeTercero?: boolean | null }[];
  costoPorGtf?: readonly { maderaDeTercero?: boolean | null }[];
  paquetes: readonly {
    id: string;
    codigo: string;
    producto: string | null;
    presentacion: string | null;
    cantidad: number;
    volumenM3: number;
    espesorCm: number | null;
    anchoCm: number | null;
    largoM: number | null;
    apartado?: unknown;
  }[];
}

export interface ProductoPublico {
  nombre: string;
  pt: number;
}

export interface EspeciePublica {
  nombre: string;
  pt: number;
  m3: number;
  /** `null` = alguna fila no dice sus piezas (corrida sin paquete): no se inventa un total. */
  piezas: number | null;
  productos: ProductoPublico[];
}

export interface MaderaPublica {
  /** Cuándo se tomó la foto del patio (ISO). La portada lo dice: es una foto, no un contador vivo. */
  tomadaAt: string;
  total: { pt: number; m3: number; piezas: number | null };
  /** Más volumen primero. */
  especies: EspeciePublica[];
}

/** Marca «tiene dueño» sin copiar a quién: la fila sale como apartada y nada más. */
const APARTADO_SIN_DATOS: ApartadoProducto = {
  id: "",
  para: "",
  hasta: null,
  nota: null,
  creadoAt: "",
};

export function esMaderaDeTercero(c: CorridaDelLibro): boolean {
  return (
    (c.duenoMadera ?? "").trim().toLowerCase() === "tercero" ||
    (c.costoConsumos ?? []).some((x) => x.maderaDeTercero === true) ||
    (c.costoPorGtf ?? []).some((x) => x.maderaDeTercero === true)
  );
}

/** La corrida con SÓLO lo que la portada necesita; el resto, vacío. */
export function aCorridaPublica(c: CorridaDelLibro): CorridaDisponible {
  return {
    id: c.id,
    lineNo: null,
    fecha: c.fecha,
    especie: c.especie,
    especieCientifica: null,
    producto: c.producto,
    presentacion: c.presentacion,
    unidad: c.unidad,
    lote: null,
    cantidad: null,
    volumenConsumidoM3: null,
    producido: c.producido,
    despachado: c.despachado,
    reprocesado: c.reprocesado,
    disponible: c.disponible,
    observations: null,
    titularOrigen: [],
    gtfOrigen: [],
    usadoAt: c.usadoAt,
    usadoMotivo: null,
    apartado: c.apartado ? APARTADO_SIN_DATOS : null,
    paquetes: c.paquetes.map((p) => ({
      id: p.id,
      codigo: "",
      producto: p.producto,
      presentacion: p.presentacion,
      cantidad: p.cantidad,
      volumenM3: p.volumenM3,
      espesorCm: p.espesorCm,
      anchoCm: p.anchoCm,
      largoM: p.largoM,
      observations: null,
      apartado: p.apartado ? APARTADO_SIN_DATOS : null,
    })),
  };
}

/**
 * «MADERA ASERRADA (COMERCIAL)» → «Madera aserrada (comercial)», «TORNILLO» →
 * «Tornillo». Lo que ya viene en mayúsculas y minúsculas se deja como está, y
 * las palabras con números (los códigos «T9», «Z3») no se tocan.
 */
export function legible(texto: string): string {
  const t = texto.trim().replace(/\s+/g, " ");
  if (!t || t !== t.toLocaleUpperCase("es-PE")) return t;
  const bajo = t
    .split(" ")
    .map((w) => (/\d/.test(w) ? w : w.toLocaleLowerCase("es-PE")))
    .join(" ");
  return bajo.charAt(0).toLocaleUpperCase("es-PE") + bajo.slice(1);
}

const piezasSiSeSaben = (filas: readonly FilaProducto[]): number | null =>
  filas.length > 0 && filas.every((f) => f.piezas != null && f.piezas > 0)
    ? filas.reduce((a, f) => a + (f.piezas ?? 0), 0)
    : null;

export function maderaPublica(corridas: readonly CorridaDelLibro[], tomadaAt: Date): MaderaPublica {
  const propias = corridas.filter((c) => !esMaderaDeTercero(c)).map(aCorridaPublica);
  const libres = filasDeProductos(propias, null).filter(
    (f) => f.estado === "libre" && f.m3Libro > 0,
  );

  const grupos = porGrupo(libres, "especie").filter((g) => g.disponible.m3 > 0);
  const especies = grupos.map((g): EspeciePublica => {
    const deEsta = libres.filter((f) => f.especieClave === g.clave);
    return {
      nombre: g.clave
        ? legible(g.etiqueta)
        : g.etiqueta === SIN_ESPECIE
          ? "Otras maderas"
          : legible(g.etiqueta),
      pt: g.disponible.pt,
      m3: g.disponible.m3,
      piezas: piezasSiSeSaben(deEsta),
      productos: porGrupo(deEsta, "producto")
        .filter((p) => p.disponible.m3 > 0 && p.clave)
        .map((p) => ({ nombre: legible(p.etiqueta), pt: p.disponible.pt })),
    };
  });

  const total = totalDeGrupos(grupos).disponible;
  return {
    tomadaAt: tomadaAt.toISOString(),
    total: { pt: total.pt, m3: total.m3, piezas: piezasSiSeSaben(libres) },
    especies,
  };
}
