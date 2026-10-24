/**
 * Qué pide cada motivo de nota de crédito (catálogo 09 de SUNAT) y la regla que el servidor hace
 * cumplir. Auditoría de comprobantes F11 (17-10): «sólo se exigen los campos pertinentes» — antes
 * todos los motivos mostraban lo mismo (ítems + monto) y la corrección de descripción pedía un monto.
 *
 * Formas:
 * - `todo`: anula o devuelve TODO lo que queda del documento (01, 02, 06). Va por lo que queda, exacto.
 * - `lineas`: se eligen productos y cantidades (07 devolución parcial, 08 bonificación).
 * - `descripcion`: texto que salió y cómo debe decir; el importe es el de las líneas corregidas (03).
 * - `importe`: un importe sobre la base que queda (04, 05, 09, 10).
 *
 * Sin `"use client"`: lo usa la ruta y el asistente.
 */
export type FormaMotivo = "todo" | "lineas" | "descripcion" | "importe";

export interface ReglaMotivo {
  forma: FormaMotivo;
  /** Sin documento de origen no tiene sentido (anular o devolver TODO, ¿de qué?). */
  requiereDocumento: boolean;
  /** Qué escribir en el campo del importe o de las líneas (para la etiqueta). */
  queSeAcredita: string;
}

export const REGLAS_MOTIVO: Readonly<Record<string, ReglaMotivo>> = {
  "01": { forma: "todo", requiereDocumento: true, queSeAcredita: "Todo lo que queda del documento" },
  "02": { forma: "todo", requiereDocumento: true, queSeAcredita: "Todo lo que queda del documento" },
  "03": { forma: "descripcion", requiereDocumento: false, queSeAcredita: "El importe de los productos corregidos" },
  "04": { forma: "importe", requiereDocumento: false, queSeAcredita: "El descuento sobre el total" },
  "05": { forma: "importe", requiereDocumento: false, queSeAcredita: "El descuento de los productos elegidos" },
  "06": { forma: "todo", requiereDocumento: true, queSeAcredita: "Todo lo que queda del documento" },
  "07": { forma: "lineas", requiereDocumento: false, queSeAcredita: "Los productos y cantidades devueltos" },
  "08": { forma: "lineas", requiereDocumento: false, queSeAcredita: "Los productos regalados" },
  "09": { forma: "importe", requiereDocumento: false, queSeAcredita: "Cuánto baja el valor" },
  "10": { forma: "importe", requiereDocumento: false, queSeAcredita: "El importe del ajuste" },
};

/**
 * Versión de estas reglas. Una plantilla guardada con otra (o sin ninguna, antes del 17-10) se señala
 * al usarla para que se revise su texto (auditoría F14: «una regla vencida se señala al usarla»).
 */
export const REGLAS_VERSION = "2026-10-17";

/** Catálogo 09 de SUNAT (01-13). Antes el servidor aceptaba cualquier texto de 1-10 letras. */
export const MOTIVO_SUNAT_RE = /^(0[1-9]|1[0-3])$/;

export function reglaMotivo(codigo: string): ReglaMotivo {
  return REGLAS_MOTIVO[codigo] ?? { forma: "importe", requiereDocumento: false, queSeAcredita: "El importe del ajuste" };
}

/** Las que anulan o devuelven todo: la nota va por lo que queda, ni más ni menos. */
export const MOTIVOS_POR_TODO: ReadonlySet<string> = new Set(
  Object.entries(REGLAS_MOTIVO).filter(([, r]) => r.forma === "todo").map(([c]) => c),
);

/**
 * Texto del motivo armado con los campos de su forma. Para 03 deja «Decía … · Debe decir …»;
 * para 02, el RUC que salió y el correcto. Lo demás pasa tal cual.
 */
export function descripcionArmada(
  codigo: string,
  campos: { libre: string; decia?: string; debeDecir?: string; rucMal?: string; rucBien?: string },
): string {
  const libre = campos.libre.trim();
  if (codigo === "03" && (campos.decia?.trim() || campos.debeDecir?.trim())) {
    const partes = [`Decía «${campos.decia?.trim() ?? ""}»`, `debe decir «${campos.debeDecir?.trim() ?? ""}»`];
    return [libre, partes.join(" · ")].filter(Boolean).join(". ").slice(0, 500);
  }
  if (codigo === "02" && (campos.rucMal?.trim() || campos.rucBien?.trim())) {
    const partes = [`RUC que salió ${campos.rucMal?.trim() || "—"}`, `RUC correcto ${campos.rucBien?.trim() || "—"}`];
    return [libre, partes.join(" · ")].filter(Boolean).join(". ").slice(0, 500);
  }
  return libre.slice(0, 500);
}

export interface CierrePorTodo {
  ok: boolean;
  /** Desglose a guardar: puede subir 1 céntimo de IGV para cerrar exacto lo que queda. */
  desglose: { monto: number; igv: number; total: number };
  error?: string;
}

/**
 * 01/02/06 anulan o devuelven el documento entero: la nota va por TODO lo que queda (SUNAT las rechaza
 * por una parte). Por base, el IGV redondeado puede quedar 1 céntimo corto (10,00 → 8,47 + 1,52 = 9,99):
 * ahí se cierra exacto. Más de 1 céntimo de diferencia = es una parte → 400 con lo que queda.
 */
export function cerrarPorTodo(params: {
  desglose: { monto: number; igv: number; total: number };
  disponibleConIgv: number;
  porBase: boolean;
}): CierrePorTodo {
  const dispC = Math.round(params.disponibleConIgv * 100);
  const totalC = Math.round(params.desglose.total * 100);
  const baseC = Math.round(params.desglose.monto * 100);
  if (totalC === dispC) return { ok: true, desglose: params.desglose };
  if (params.porBase && dispC - totalC === 1 && baseC > 0) {
    return { ok: true, desglose: { monto: baseC / 100, igv: (dispC - baseC) / 100, total: dispC / 100 } };
  }
  return {
    ok: false,
    desglose: params.desglose,
    error: `La anulación o la devolución total va por todo lo que queda del documento: S/ ${(dispC / 100).toFixed(2)}. Para una parte usa 07 (devolución parcial) o 09 (disminución en el valor).`,
  };
}
