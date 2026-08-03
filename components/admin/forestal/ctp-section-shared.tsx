/**
 * ctp-section-shared — tipos y primitivos de tabla compartidos entre
 * CtpEntriesView (Producción/Despacho) y CtpSaldosView del Libro CTP (ADR-127).
 */

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
}

/**
 * En qué anda el paquete: sigue en el patio, salió a medias o ya se fue.
 *
 * Un paquete parcialmente despachado es lo normal (un camión no se lleva todo),
 * y no verlo obliga a abrir el detalle para saber si queda algo.
 */
/**
 * Cómo se escribe cada unidad. Estaba copiado en la tabla, la card mobile y la
 * ficha del despacho: tres lugares donde agregar una unidad nueva y olvidarse de
 * dos deja "pt" crudo en pantalla.
 */
export const UNIT_LABELS: Record<string, string> = { m3: "m³", kg: "Kg", pt: "pt", unidad: "unidad" };

export function estadoSalida(e: CtpEntry): { label: string; tono: "stock" | "parcial" | "salido" } | null {
  if (e.section !== "produccion") return null;
  const producido = Number(e.quantity ?? 0);
  if (!(producido > 0)) return null;
  const fuera = Number(e.despachadoQty ?? 0) + Number(e.reprocesadoQty ?? 0);
  if (fuera <= 0.0001) return { label: "En patio", tono: "stock" };
  if (producido - fuera > 0.0001) return { label: `Parcial · queda ${(producido - fuera).toFixed(2)}`, tono: "parcial" };
  return { label: "Despachado", tono: "salido" };
}

export const n2 = (v: number) => v.toFixed(2);

export function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-3 font-bold text-[var(--text-primary)] ${className ?? ""}`}>{children}</th>;
}
export function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className ?? ""}`}>{children}</td>;
}
