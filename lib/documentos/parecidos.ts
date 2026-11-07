/**
 * parecidos — "¿qué otros papeles son de lo mismo?".
 *
 * Cuando abrís la factura de un proveedor, la pregunta que sigue casi siempre
 * es la misma: ¿le compré antes?, ¿dónde está el contrato con ellos?, ¿esta
 * boleta es la del pago de esa factura? Hoy eso se contesta volviendo al drive
 * y buscando a mano.
 *
 * Esto lo contesta sin llamar a ninguna IA: usa lo que la IA YA extrajo de cada
 * documento (RUC, empresas, personas, montos, etiquetas). Y dice POR QUÉ se
 * parecen, porque una lista de archivos sin explicación no se puede confiar.
 */

import type { DocBuscable } from "./relevancia";

export interface DocConId extends DocBuscable {
  id: string;
  folderId?: string | null;
}

export interface Parecido<T> {
  doc: T;
  /** En castellano, para mostrar: "Mismo RUC 20512345678". */
  motivos: string[];
  puntaje: number;
}

interface Señas {
  ruc: string;
  docType: string;
  total: string;
  orgs: Map<string, string>;
  people: Map<string, string>;
  etiquetas: Map<string, string>;
  folderId: string | null;
}

const norm = (s: unknown): string => (typeof s === "string" ? s.trim().toLowerCase() : "");

/** Normalizado → como estaba escrito: se compara plegado, se muestra lindo. */
function conjunto(valores: unknown): Map<string, string> {
  const m = new Map<string, string>();
  if (!Array.isArray(valores)) return m;
  for (const v of valores) {
    if (typeof v !== "string") continue;
    const clave = norm(v);
    if (clave.length > 2 && !m.has(clave)) m.set(clave, v.trim());
  }
  return m;
}

/** Lo que identifica a un documento, sacado de lo que ya está guardado. */
function señasDe(doc: DocConId): Señas {
  const meta = (doc.ocrMetadata ?? {}) as Record<string, unknown>;
  const structured = (meta.structured ?? {}) as Record<string, unknown>;
  const entities = (meta.entities ?? {}) as Record<string, unknown>;
  const total = structured.total;
  return {
    ruc: norm(structured.ruc),
    docType: norm(structured.docType),
    total: total === null || total === undefined || total === "" ? "" : String(total),
    orgs: conjunto([...(Array.isArray(entities.orgs) ? entities.orgs : []), structured.razonSocial]),
    people: conjunto(entities.people),
    etiquetas: conjunto([...(doc.tags ?? []), ...(doc.aiTags ?? [])]),
    folderId: doc.folderId ?? null,
  };
}

/** Lo que comparten, devuelto TAL COMO ESTABA ESCRITO en el documento abierto. */
const comunes = (a: Map<string, string>, b: Map<string, string>): string[] =>
  [...a.entries()].filter(([clave]) => b.has(clave)).map(([, original]) => original);

/**
 * Los documentos más parecidos al abierto, del más al menos parecido.
 * Sólo devuelve los que comparten algo REAL: si no hay señas en común, la
 * lista viene vacía en vez de rellenarse con cualquier cosa.
 */
export function documentosParecidos<T extends DocConId>(actual: T, todos: T[], max = 5): Parecido<T>[] {
  const a = señasDe(actual);
  const salida: Parecido<T>[] = [];

  for (const otro of todos) {
    if (otro.id === actual.id) continue;
    const b = señasDe(otro);
    const motivos: string[] = [];
    let puntaje = 0;

    // El RUC es la seña más fuerte: identifica a la empresa sin ambigüedad.
    if (a.ruc && a.ruc === b.ruc) { puntaje += 6; motivos.push(`Mismo RUC ${a.ruc}`); }

    const orgs = comunes(a.orgs, b.orgs);
    if (orgs.length > 0) { puntaje += 5; motivos.push(`También es de ${orgs[0]}`); }

    const gente = comunes(a.people, b.people);
    if (gente.length > 0) { puntaje += 4; motivos.push(`También menciona a ${gente[0]}`); }

    // Mismo monto exacto: suele ser el par factura ↔ comprobante de pago.
    if (a.total && a.total === b.total) { puntaje += 3; motivos.push(`Mismo importe (${a.total})`); }

    const tags = comunes(a.etiquetas, b.etiquetas);
    if (tags.length > 0) {
      puntaje += Math.min(tags.length, 3) * 2;
      motivos.push(tags.length === 1 ? `Etiqueta "${tags[0]}"` : `${tags.length} etiquetas en común`);
    }

    if (a.docType && a.docType === b.docType) { puntaje += 1; motivos.push(`También es ${a.docType}`); }
    if (a.folderId && a.folderId === b.folderId) puntaje += 1; // sin motivo: se ve solo

    // Un solo tag compartido ("documento") no alcanza para llamarlo parecido.
    if (puntaje >= 3) salida.push({ doc: otro, motivos: motivos.slice(0, 2), puntaje });
  }

  return salida.sort((x, y) => y.puntaje - x.puntaje).slice(0, max);
}
