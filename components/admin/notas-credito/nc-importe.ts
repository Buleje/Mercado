/**
 * Cuánto lleva la nota según la forma de su motivo (auditoría de comprobantes F11/F12, 17-10).
 * Es la vista previa: el servidor vuelve a hacer la cuenta y pone el tope (`topeNotaCredito`,
 * `cerrarPorTodo`). Sin `"use client"`: puro, con test.
 *
 * - `todo` (01/02/06): exactamente lo que queda del documento, con IGV.
 * - `lineas` (07/08) y `descripcion` (03): Σ unidades × precio cobrado de verdad, nunca más que lo que queda.
 * - `importe` (04/05/09/10): la base sin IGV escrita, hasta la base que queda.
 * Sin documento (o sin líneas), las de líneas pasan a importe escrito.
 */
import { desgloseNotaCredito } from "@/lib/pos/reembolso";
import { importeDeLineas, type LineaAjustable, type RemanenteDocumento } from "@/lib/notas-credito/remanente";
import { reglaMotivo, type FormaMotivo } from "@/lib/notas-credito/motivos";
import { formatCurrency } from "@/lib/format";

export interface ImporteNota {
  /** La forma que se usa de verdad (sin documento, las de líneas pasan a importe). */
  forma: FormaMotivo;
  /** Lo que viaja al POST: con IGV (todo y líneas) o la base escrita (importe). null = todavía no. */
  cuerpo: { totalConIgv: number } | { monto: number } | null;
  desglose: { monto: number; igv: number; total: number };
  /** Por qué no se puede seguir; null = lista. */
  problema: string | null;
}

const CERO = { monto: 0, igv: 0, total: 0 };

export function importeDeLaNota(p: {
  codigo: string;
  conDocumento: boolean;
  remanente: RemanenteDocumento | null;
  /** Error al leer lo que queda (se muestra en lugar de «Leyendo…»). */
  errorDocumento?: string | null;
  lineas: readonly LineaAjustable[];
  cantidades: readonly number[];
  baseEscrita: string;
  tasa: number;
}): ImporteNota {
  const regla = reglaMotivo(p.codigo);
  const sinLineas = !p.conDocumento || p.lineas.length === 0;
  const forma: FormaMotivo = (regla.forma === "lineas" || regla.forma === "descripcion") && sinLineas ? "importe" : regla.forma;
  const no = (problema: string, desglose = CERO): ImporteNota => ({ forma, cuerpo: null, desglose, problema });

  if (!p.codigo) return no("Elige un motivo.");
  if (regla.requiereDocumento && !p.conDocumento) {
    return no("Este motivo va por todo el documento: vuelve al paso 1 y elígelo, o usa 09 o 10.");
  }
  const rem = p.remanente;
  if (p.conDocumento && !rem) return no(p.errorDocumento ?? "Leyendo lo que queda del documento…");
  if (rem && rem.disponibleConIgv <= 0) return no("Este documento ya está acreditado entero: no admite otra nota.");

  if (forma === "todo") {
    if (!rem) return no("Este motivo necesita el documento de origen.");
    const total = rem.disponibleConIgv;
    return { forma, cuerpo: { totalConIgv: total }, desglose: desgloseNotaCredito({ totalConIgv: total }, p.tasa), problema: null };
  }

  if (forma === "lineas" || forma === "descripcion") {
    const total = importeDeLineas(p.lineas, p.cantidades, rem?.disponibleConIgv ?? 0);
    if (total <= 0) return no(forma === "descripcion" ? "Elige los productos que se corrigen." : "Elige al menos una unidad.");
    return { forma, cuerpo: { totalConIgv: total }, desglose: desgloseNotaCredito({ totalConIgv: total }, p.tasa), problema: null };
  }

  const base = Number(p.baseEscrita.replace(",", "."));
  if (!Number.isFinite(base) || base <= 0) return no("Escribe el importe sin IGV.");
  const desglose = desgloseNotaCredito({ base }, p.tasa);
  if (desglose.monto <= 0) return no("El importe debe ser de al menos S/ 0,01.");
  if (rem && desglose.monto > rem.disponibleBase) {
    return no(`Pasa lo que queda del documento: hasta ${formatCurrency(rem.disponibleBase)} sin IGV.`, desglose);
  }
  // Como el servidor: por base, el IGV redondeado puede pasarse 1 céntimo de lo que queda y se cierra exacto.
  const cerrado = rem && desglose.total > rem.disponibleConIgv
    ? { monto: desglose.monto, igv: Math.round((rem.disponibleConIgv - desglose.monto) * 100) / 100, total: rem.disponibleConIgv }
    : desglose;
  return { forma, cuerpo: { monto: desglose.monto }, desglose: cerrado, problema: null };
}
