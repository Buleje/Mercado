/**
 * ctp-section-shared — tipos y primitivos de tabla compartidos entre
 * CtpEntriesView (Producción/Despacho) y CtpSaldosView del Libro CTP (ADR-127).
 */

import { claveSalida, SALIDA_LABEL, type ClaveSalida } from "@/lib/forestal/ctp-secciones-filtro";

export type CtpSection = "produccion" | "despacho";

export interface CtpEntry {
  id: string; section: CtpSection; lineNo: number; entryDate: string;
  gtfIngreso: string | null; materiaPrimaRef: string | null;
  speciesCommon: string | null; speciesScientific: string | null; cites: boolean;
  productType: string | null; volumeInputM3: string | null; rendimientoPct: string | null;
  quantity: string | null; unit: string | null; pieces: number | null;
  gtfNumber: string | null; destino: string | null; observations: string | null;
  /**
   * Datos de la GTF de salida tal como los devuelve el endpoint (JSON crudo; lo
   * valida `leerGtfDatos`). Estaba en la respuesta y no en el tipo, así que
   * quien lo necesitaba tenía que castear a ciegas.
   */
  gtfDatos?: unknown;
  status: "registrado" | "anulado"; annulledReason: string | null;
  /** El código pintado en el atado (ADR-314 · casillero 9 de la Sección 4). */
  codigoProducto?: string | null;
  /** Cuánto de ESTA corrida ya salió y cuánto se reprocesó — el "¿ya se fue?". */
  despachadoQty?: number;
  reprocesadoQty?: number;
  /**
   * Sólo en producción: m³ de materia prima de ESTA corrida que están atados a
   * un ingreso con GTF. Menos que `volumeInputM3` es producto sin origen
   * declarado (ver `origenDeCorrida`).
   */
  mpAtribuidaM3?: number;
  /**
   * Sólo en despacho: cuánto de lo despachado tiene corrida de origen declarada.
   * Lo agrega el listado para que la fila pueda avisar del faltante sin abrir la
   * ficha de cadena de custodia (ver `lib/forestal/atribucion-despacho.ts`).
   */
  atribuidoQty?: number;
  /**
   * Sólo en producción: N° de Permiso/Código de origen (`WoodEntry.originCode`)
   * de los ingresos que alimentaron esta corrida. La corrida no tiene permiso
   * propio, hereda el de la madera consumida — por eso es una lista, no un
   * campo: dos guías de dos permisos distintos pueden aserrarse juntas.
   */
  permisoOrigen?: string[];
}

/**
 * Columnas OPCIONALES de la tabla de Producción (ocultables por el operador,
 * ADR del 2026-08-31 — mismo patrón que Documentos). Fecha/Especie/Producto/
 * Producido/Estado/Acciones quedan siempre fijas: son las que identifican la
 * fila, ocultarlas dejaría una tabla sin forma de saber qué corrida es cuál.
 */
export const COLUMNAS_PRODUCCION_OPCIONALES = [
  { key: "consumido", label: "Consumido (m³)" },
  { key: "piezas", label: "Piezas" },
  { key: "rend", label: "Rend." },
  { key: "salida", label: "Salida" },
  /* Nueva, arranca oculta: no cambiar lo que ya se venía viendo por defecto
     (mismo criterio que Etiquetas/Vencimiento en Documentos). */
  { key: "permiso", label: "N° Permiso", porDefecto: false },
] as const;
export type ColProduccionKey = (typeof COLUMNAS_PRODUCCION_OPCIONALES)[number]["key"];
export type ColsProduccionVisibles = Record<ColProduccionKey, boolean>;

/**
 * Cómo se escribe cada unidad. Estaba copiado en la tabla, la card mobile y la
 * ficha del despacho: tres lugares donde agregar una unidad nueva y olvidarse de
 * dos deja "pt" crudo en pantalla.
 */
export const UNIT_LABELS: Record<string, string> = { m3: "m³", kg: "Kg", pt: "pt", unidad: "unidad" };

/**
 * En qué anda el paquete: sigue en el patio, salió a medias o ya se fue.
 *
 * Un paquete parcialmente despachado es lo normal (un camión no se lleva todo),
 * y no verlo obliga a abrir el detalle para saber si queda algo.
 *
 * La REGLA vive en `claveSalida` (módulo puro), porque el filtro de la columna
 * «Salida» hace exactamente la misma pregunta: si cada uno la calculara por su
 * cuenta, la fila podría decir «En patio» y el filtro «En patio» esconderla.
 * Acá queda sólo cómo se ESCRIBE — incluido el «queda X», que es del badge.
 */
export function estadoSalida(
  /* `Pick` y no `CtpEntry` entero: la misma pregunta —¿esto ya salió?— se la
     hace la tarjeta del LOTE de aserrío sobre su corrida (ADR-337), y ahí no hay
     una fila del libro sino cuatro números. La regla vive una sola vez. */
  e: Pick<CtpEntry, "section" | "quantity" | "despachadoQty" | "reprocesadoQty">,
): { label: string; tono: ClaveSalida } | null {
  const tono = claveSalida(e);
  if (!tono) return null;
  if (tono === "stock") return { label: SALIDA_LABEL.stock, tono };
  if (tono === "salido") return { label: SALIDA_LABEL.salido, tono };
  const queda = Number(e.quantity ?? 0) - Number(e.despachadoQty ?? 0) - Number(e.reprocesadoQty ?? 0);
  return { label: `Parcial · queda ${queda.toFixed(2)}`, tono };
}

export const n2 = (v: number) => v.toFixed(2);

export function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-3 font-bold text-[var(--text-primary)] ${className ?? ""}`}>{children}</th>;
}
export function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className ?? ""}`}>{children}</td>;
}
