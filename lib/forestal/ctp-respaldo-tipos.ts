/**
 * lib/forestal/ctp-respaldo-tipos.ts — contrato de los Respaldos del Libro CTP (ADR-530).
 *
 * Lo comparten el servidor (`lib/db/forest-ctp-respaldo.db.ts`, las rutas de
 * `app/api/admin/forestal/ctp/respaldos/**`) y la pestaña «Respaldos»
 * (`components/admin/forestal/CtpRespaldosView.tsx`). Sin "server-only": son
 * tipos y etiquetas, nada de Prisma.
 *
 * Un respaldo es una FOTO del libro entero (vivas y dadas de baja). Comparar
 * dice qué cambió desde la foto; recuperar trae de vuelta SOLO lo borrado o
 * dado de baja, sin pisar nada de hoy. «Volver todo atrás» no existe a propósito
 * (borraría trabajo posterior y desharía guías ya declaradas a SERFOR).
 */

/** Quién disparó el respaldo. Los «antes_*» los toma el servidor solo, antes de la acción. */
export const TIPOS_RESPALDO = ["manual", "diario", "antes_vaciar", "antes_anular_dia", "antes_cierre"] as const;
export type TipoRespaldo = (typeof TIPOS_RESPALDO)[number];

export const ETIQUETA_TIPO_RESPALDO: Readonly<Record<TipoRespaldo, string>> = {
  manual: "Guardado a mano",
  diario: "Automático de la noche",
  antes_vaciar: "Antes de vaciar el libro",
  antes_anular_dia: "Antes de anular un día",
  antes_cierre: "Antes de cerrar el mes",
};

/**
 * Las tablas del libro, en el ORDEN DE INSERCIÓN al recuperar (padres primero;
 * en `WoodEntryTroza`, madres y luego retrozos). Fuera a propósito:
 * `ForestCtpComplianceSnapshot` (es un cálculo), `ForestGtf` (Libro TH).
 */
export const TABLAS_RESPALDO = [
  "WoodEntry",
  "ForestLoteMixto",
  "ForestLoteAserrio",
  "ForestCtpEntry",
  "WoodEntryTroza",
  "ForestCtpPaquete",
  "ForestCtpApartado",
  "ForestCtpConsumo",
  "ForestCtpDespachoOrigen",
  "ForestCtpReproceso",
  "ForestProdLote",
  "ForestProdLoteMiembro",
  "ForestCuentaMov",
  "CampoPersonalizadoValor",
  "ForestGuiaGuardada",
] as const;
export type TablaRespaldo = (typeof TABLAS_RESPALDO)[number];

/** Cómo se nombra cada tabla en pantalla (las palabras del libro, no las del código). */
export const ETIQUETA_TABLA_RESPALDO: Readonly<Record<TablaRespaldo, string>> = {
  WoodEntry: "Ingresos (GTF)",
  ForestLoteMixto: "Lotes mixtos",
  ForestLoteAserrio: "Lotes de aserrío",
  ForestCtpEntry: "Corridas y salidas",
  WoodEntryTroza: "Trozas",
  ForestCtpPaquete: "Paquetes",
  ForestCtpApartado: "Apartados",
  ForestCtpConsumo: "Consumos",
  ForestCtpDespachoOrigen: "Origen de las salidas",
  ForestCtpReproceso: "Reprocesos",
  ForestProdLote: "Lotes de producción",
  ForestProdLoteMiembro: "Corridas en lotes",
  ForestCuentaMov: "Cargos del aserrío",
  CampoPersonalizadoValor: "Campos propios",
  ForestGuiaGuardada: "Guías a medio llenar",
};

/** Filas de una tabla en el respaldo: todas y cuántas de ellas estaban dadas de baja. */
export interface ConteoTablaRespaldo {
  total: number;
  deBaja: number;
}
export type ConteosRespaldo = Partial<Record<TablaRespaldo, ConteoTablaRespaldo>>;

/** Una fila de la lista (sin los datos: la lista no descomprime nada). */
export interface RespaldoResumen {
  id: string;
  tipo: TipoRespaldo;
  nota: string | null;
  conteos: ConteosRespaldo;
  /** Suma de `total` de todas las tablas. */
  filas: number;
  /** Tamaño comprimido. */
  bytes: number;
  createdBy: string;
  /** ISO. */
  createdAt: string;
}

/** Topes de guardado y poda (los mismos números que aplica el servidor). */
export const TOPES_RESPALDO = {
  /** Manuales: tope; al llegar, guardar otro pide borrar uno (nunca se podan solos). */
  manuales: 20,
  /** Diarios que se guardan (los más viejos se podan). */
  diarios: 30,
  /** Los «antes de» viven estos días… */
  diasAntesDe: 90,
  /** …pero siempre quedan al menos estos. */
  minimoAntesDe: 10,
} as const;

/** GET /api/admin/forestal/ctp/respaldos */
export interface RespaldosListado {
  respaldos: RespaldoResumen[];
  manualesUsados: number;
  topes: typeof TOPES_RESPALDO;
}

/** POST /api/admin/forestal/ctp/respaldos → `{ respaldo }` (201). Body: `{ nota?: string ≤200 }`. */
export interface RespaldoCreado {
  respaldo: RespaldoResumen;
}

// ── Comparar ────────────────────────────────────────────────────────────────

/**
 * Estado de una fila del respaldo frente a hoy:
 *  · `borrada`  — estaba en el respaldo y hoy no existe;
 *  · `de_baja`  — estaba viva en el respaldo y hoy tiene `deletedAt` (o la corrida está anulada);
 *  · `cambiada` — existe en los dos con otros valores (informativo: NO se recupera, no se pisa);
 *  · `nueva`    — existe hoy y no en el respaldo (informativo).
 */
export type EstadoDiffRespaldo = "borrada" | "de_baja" | "cambiada" | "nueva";

/** Cómo agrupa la pantalla: por la cosa que el operador reconoce. */
export type GrupoDiffTipo = "corrida" | "salida" | "ingreso" | "lote" | "otro";

export interface ConteoDiffTabla {
  borradas: number;
  deBaja: number;
  cambiadas: number;
  nuevas: number;
}

export interface GrupoDiffRespaldo {
  /** Lo que se manda en `seleccion` al recuperar: `"<tipo>:<id de la fila cabeza>"`. */
  clave: string;
  tipo: GrupoDiffTipo;
  /** Estado de la cabeza (la corrida, el ingreso…); si solo cambiaron hijas, el de ellas. */
  estado: EstadoDiffRespaldo;
  /** Ej. «Corrida 12/10/2026 · Tornillo» o «GTF 123-2026 · Juan Pérez». */
  etiqueta: string;
  /** Date-only ISO (`YYYY-MM-DD`) del libro, o null. Formatear con timeZone:"UTC". */
  fecha: string | null;
  /** Cifras del grupo EN EL RESPALDO (lo que se recuperaría). Null = no aplica. */
  pt: number | null;
  m3: number | null;
  piezas: number | null;
  /** Filas por tabla dentro del grupo. */
  filas: Partial<Record<TablaRespaldo, ConteoDiffTabla>>;
  /** Se puede marcar para recuperar. Solo `borrada`/`de_baja` pueden serlo. */
  recuperable: boolean;
  /** Por qué no (mes cerrado, troza ya usada por otra corrida, código repetido…). Null si es recuperable. */
  motivo: string | null;
}

/** GET /api/admin/forestal/ctp/respaldos/[id]/comparar */
export interface ComparacionRespaldo {
  respaldo: RespaldoResumen;
  /**
   * Huella del libro de HOY al comparar. Se devuelve tal cual como `esperado`
   * al recuperar: si el libro cambió entre comparar y recuperar → 409 y se
   * vuelve a comparar (lo que el operador vio es lo que se recupera).
   */
  huellaHoy: string;
  /** Filas por estado, todas las tablas. */
  totales: Record<EstadoDiffRespaldo, number>;
  grupos: GrupoDiffRespaldo[];
}

// ── Recuperar ───────────────────────────────────────────────────────────────

/** POST /api/admin/forestal/ctp/respaldos/[id]/recuperar — body. */
export interface RecuperarRespaldoPedido {
  /** Claves de `GrupoDiffRespaldo` marcadas, o todo lo recuperable. */
  seleccion: string[] | "todo_lo_borrado";
  /** `huellaHoy` de la comparación que vio el operador. */
  esperado: string;
}

export interface SaltadaRecuperar {
  clave: string;
  etiqueta: string;
  motivo: string;
}

/** Respuesta 200 de recuperar. 409 `{ error, code: "LIBRO_CAMBIO" }` si la huella no coincide. */
export interface ResultadoRecuperar {
  /** Filas que volvieron, por tabla (insertadas + bajas deshechas). */
  recuperadas: Partial<Record<TablaRespaldo, number>>;
  total: number;
  /** Grupos pedidos que no se pudieron traer, con el motivo en palabras del libro. */
  saltadas: SaltadaRecuperar[];
  /** Ej. «el proveedor X ya no existe: el ingreso volvió sin proveedor». */
  avisos: string[];
}

/** GET /api/admin/forestal/ctp/respaldos/[id]/descargar → `application/gzip`, archivo `libro-ctp-<slug>-<fecha>.json.gz`. */
