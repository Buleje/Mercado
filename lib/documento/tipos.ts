/**
 * La forma de una consulta de documento, y las reglas que NO necesitan red.
 *
 * Vive aparte de `lookup.ts` porque ese módulo es `server-only` (habla con
 * RENIEC y SUNAT con tokens que no pueden salir al navegador), y la pantalla
 * necesita las mismas reglas para decidir cuándo vale la pena consultar. Un
 * `import "server-only"` alcanzado desde un componente cliente rompe el build
 * en runtime, no en `tsc` — y así se cayó la primera versión de esto.
 */

export type TipoDocumento = "DNI" | "RUC";

export type DocumentoEncontrado = {
  encontrado: true;
  tipo: TipoDocumento;
  numero: string;
  /** Nombre de la persona o razón social de la empresa. */
  nombre: string;
  /** Sólo RUC: la razón social tal cual figura, por si se muestra aparte. */
  razonSocial?: string;
  direccion?: string;
  /** El ubigeo separado, como lo manda SUNAT: cada uno a su columna. */
  departamento?: string;
  provincia?: string;
  distrito?: string;
  /** Sólo RUC. "ACTIVO" | "BAJA DE OFICIO" | … */
  estado?: string;
  /** Sólo RUC. "HABIDO" | "NO HABIDO" — decide si su factura es deducible. */
  condicion?: string;
  /** De dónde salió el dato: se muestra para que nadie crea que lo inventamos. */
  fuente: string;
  /**
   * El dato es de DEMOSTRACIÓN, no del padrón.
   *
   * Pasa cuando no hay credenciales o el proveedor no contesta: se responde
   * igual para que la pantalla funcione, pero mentir sobre el origen sería
   * peor que no responder.
   */
  demo?: boolean;
  /** Qué hay que arreglar, si el problema es de configuración y no del número. */
  avisoConfig?: string;
};

export type DocumentoNoEncontrado = {
  encontrado: false;
  tipo?: TipoDocumento;
  numero: string;
  /** En español y accionable: se muestra tal cual al usuario. */
  motivo: string;
};

export type ResultadoDocumento = DocumentoEncontrado | DocumentoNoEncontrado;

/** Sólo dígitos: la gente escribe «12.345.678» o «20 123 456 789». */
export function normalizarNumero(v: string): string {
  return (v ?? "").replace(/\D/g, "");
}

/**
 * Qué padrón corresponde, según el largo. `null` = todavía no es consultable, y
 * eso NO es un error: es alguien a mitad de tipear.
 */
export function tipoDeDocumento(numero: string): TipoDocumento | null {
  const n = normalizarNumero(numero);
  if (n.length === 8) return "DNI";
  if (n.length === 11 && /^(10|15|16|17|20)/.test(n)) return "RUC";
  return null;
}

/**
 * Un RUC que no puede facturar como corresponde.
 *
 * No bloquea nada — se le puede adelantar plata igual — pero es lo que uno
 * querría saber ANTES de pagar, no cuando el contador rechaza la factura.
 */
export function avisoDeSunat(r: DocumentoEncontrado): string | null {
  if (r.tipo !== "RUC") return null;
  if (r.condicion && r.condicion.toUpperCase() !== "HABIDO") {
    return `SUNAT lo tiene como ${r.condicion}: su factura no sería deducible.`;
  }
  if (r.estado && r.estado.toUpperCase() !== "ACTIVO") {
    return `Su RUC figura ${r.estado} en SUNAT.`;
  }
  return null;
}
