/**
 * El listado de adelantos, tal como se abre en Excel.
 *
 * Se exporta LO FILTRADO, no todo: si alguien está mirando «los vencidos de
 * Juan» y pide el CSV, lo que espera bajar es eso. Un export que ignora los
 * filtros obliga a rehacer el trabajo en la planilla.
 */

import { MODALIDAD_LABEL, STATUS_BADGE } from "@/components/admin/adelantos/shared";
import { cumplimientoDe, type ResumenPersona } from "@/lib/adelantos/saldo-persona";
import type { DbAdelanto, DbBeneficiario } from "@/lib/db/adelantos.db";

/**
 * Una celda de CSV, entrecomillada cuando hace falta.
 *
 * El separador de este archivo es `;` y no `,` porque Excel en es-PE usa la coma
 * como decimal: con `,` un «1,250.50» parte la fila en dos columnas. Igual se
 * entrecomilla todo lo que traiga separador, comillas o saltos — un motivo
 * escrito a mano tiene cualquier cosa adentro.
 */
export function celdaCsv(valor: string | number | null | undefined): string {
  const s = valor == null ? "" : String(valor);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const dia = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("es-PE") : "");

/**
 * Los totales de una persona vienen por moneda (saldo-persona.ts) — nunca un
 * número solo, para no repetir el bug de sumar soles y dólares que encontró
 * la auditoría de esta sesión. En la celda del CSV: "S/ X.XX", o "S/ X.XX ·
 * $ Y.YY" si la persona debe en las dos.
 */
const montoCsv = (m: Record<string, number>): string => {
  const partes = Object.entries(m).filter(([, v]) => v !== 0);
  if (partes.length === 0) return "0.00";
  return partes.map(([moneda, v]) => (moneda === "USD" ? `$ ${v.toFixed(2)}` : `S/ ${v.toFixed(2)}`)).join(" · ");
};

const COLUMNAS = [
  "Código",
  "Recibo",
  "Persona",
  "Documento",
  "Teléfono",
  "Fecha",
  "Modalidad",
  "Motivo",
  "Moneda",
  "Adelantado",
  "Entregado",
  "Saldo",
  "Avance %",
  "Estado",
  "Cuotas pactadas",
  "Cuotas cumplidas",
] as const;

/** El CSV completo (con BOM, o Excel se come las tildes) de los adelantos dados. */
export function adelantosACsv(adelantos: readonly DbAdelanto[]): string {
  const filas = adelantos.map((a) => {
    const entregado = Math.max(0, a.montoAdelantado - a.saldoPendiente);
    const avance = a.montoAdelantado > 0 ? Math.round((entregado / a.montoAdelantado) * 100) : 0;
    return [
      a.codigoOperacion ?? "",
      a.reciboManual ?? "",
      a.beneficiario?.nombre ?? "",
      a.beneficiario?.documento ?? "",
      a.beneficiario?.telefono ?? "",
      dia(a.fechaAdelanto),
      MODALIDAD_LABEL[a.modalidad] ?? a.modalidad,
      a.notas ?? "",
      a.moneda,
      a.montoAdelantado.toFixed(2),
      entregado.toFixed(2),
      a.saldoPendiente.toFixed(2),
      String(avance),
      STATUS_BADGE[a.status]?.label ?? a.status,
      String(a.entregasPactadas.length),
      String(a.entregasPactadas.filter((p) => p.cumplidaEn).length),
    ].map(celdaCsv).join(";");
  });
  return `﻿${COLUMNAS.join(";")}\n${filas.join("\n")}`;
}

/** Baja el CSV al disco. Sólo en el navegador. */
export function descargarCsvAdelantos(adelantos: readonly DbAdelanto[], nombre: string): void {
  const blob = new Blob([adelantosACsv(adelantos)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Personas ─────────────────────────────────────────────────────────────────

const COLUMNAS_PERSONAS = [
  "Nombre",
  "Documento",
  "Teléfono",
  "Tope de crédito",
  "Debe hoy",
  "Adelantado histórico",
  "Ya devolvió",
  "Cumplimiento %",
  "A favor de ella",
  "Adelantos abiertos",
  "Liquidados",
  "Cancelados",
  "Último adelanto",
  "Último recordatorio",
  "Notas",
] as const;

/** La libreta de personas tal como se ve en pantalla, para abrir en Excel. */
export function personasACsv(
  personas: readonly (DbBeneficiario & ResumenPersona)[],
): string {
  const filas = personas.map((p) => {
    const cumplimiento = cumplimientoDe(p);
    return [
      p.nombre,
      p.documento ?? "",
      p.telefono ?? "",
      p.limiteCredito != null ? p.limiteCredito.toFixed(2) : "",
      montoCsv(p.saldoPendiente),
      montoCsv(p.totalAdelantado),
      montoCsv(p.totalEntregado),
      cumplimiento == null ? "" : String(cumplimiento),
      montoCsv(p.saldoAFavor),
      String(p.adelantosAbiertos),
      String(p.adelantosLiquidados),
      String(p.adelantosCancelados),
      dia(p.ultimoAdelanto),
      dia(p.ultimoRecordatorio),
      p.notas ?? "",
    ].map(celdaCsv).join(";");
  });
  return `﻿${COLUMNAS_PERSONAS.join(";")}\n${filas.join("\n")}`;
}

/** Baja el CSV de personas al disco. Sólo en el navegador. */
export function descargarCsvPersonas(
  personas: readonly (DbBeneficiario & ResumenPersona)[],
  nombre: string,
): void {
  const blob = new Blob([personasACsv(personas)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}
