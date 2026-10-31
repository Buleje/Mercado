/**
 * ADR-516 — Código único de documento: cómo se escribe y cómo se lee.
 *
 * El número lo entrega la base (trigger `documento_asignar_codigo` sobre
 * `DocumentCodigoContador`): correlativo por negocio, nunca se repite ni se
 * reutiliza. Acá sólo vive su forma: `DOC-000123`. El prefijo es un parámetro
 * para que un negocio pueda tener el suyo el día que lo pida.
 *
 * Puro (sin server-only): lo usan la API, el buscador y la UI.
 */

export const PREFIJO_CODIGO_DOCUMENTO = "DOC";

/** Dígitos mínimos (con ceros adelante). Pasado 999999 crece solo, no se corta. */
export const DIGITOS_CODIGO_DOCUMENTO = 6;

/** `123` → `DOC-000123`. Sin código (null, 0, negativo, no entero) → null. */
export function formatoCodigoDocumento(
  codigo: number | null | undefined,
  prefijo: string = PREFIJO_CODIGO_DOCUMENTO,
): string | null {
  if (codigo == null || !Number.isInteger(codigo) || codigo <= 0) return null;
  return `${prefijo}-${String(codigo).padStart(DIGITOS_CODIGO_DOCUMENTO, "0")}`;
}

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Lee un código escrito como lo escribiría una persona, si la consulta ENTERA
 * es un código: `DOC-000123`, `doc-123`, `doc 123`, `DOC123`, `#123`, `123`.
 * Devuelve el número o null. «contrato 123» no es un código (es texto).
 */
export function leerCodigoDocumento(
  texto: string | null | undefined,
  prefijo: string = PREFIJO_CODIGO_DOCUMENTO,
): number | null {
  const t = (texto ?? "").trim();
  if (!t || t.length > 24) return null;
  const re = new RegExp(`^(?:${escapar(prefijo)}\\s*[-–—_.:#]?\\s*|#\\s*)?0*(\\d{1,9})$`, "i");
  const m = re.exec(t);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** ¿El documento tiene código pero todavía no se marcó como puesto en el papel físico? */
export function codigoFisicoPendiente(doc: {
  codigo?: number | null;
  codigoFisicoAt?: string | Date | null;
  deletedAt?: string | Date | null;
}): boolean {
  return doc.codigo != null && doc.codigo > 0 && !doc.codigoFisicoAt && !doc.deletedAt;
}
