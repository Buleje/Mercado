import type { DbContract } from "@/lib/types/contracts";

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * El contrato tal como lo devuelve la API. Antes este tipo declaraba
 * `montoTotal`/`clienteDocumento`/`fechaContrato` mientras el backend mandaba
 * `monto`/`clienteDoc`/`fecha`, así que TODO monto salía S/ 0.00 y el documento
 * de la contraparte salía vacío. Ahora es el mismo tipo de la capa de datos.
 */
export type ContratoAPI = DbContract;

export const MODULE_ID = "contratos";

export type TabId = "dashboard" | "plantillas" | "contratos" | "crear" | "editor";

/** Las vistas direccionables, estables: el hook las usa como dependencia. */
export const CONTRATOS_VISTAS = ["dashboard", "plantillas", "contratos", "crear", "editor"] as const;

// ── Icon Map ────────────────────────────────────────────────────────────

export const PER_PAGE = 12;

/** Cómo se lee cada evento del historial, en criollo. */
export const EVENTO_LABELS: Record<string, string> = {
  CREADO: "Se creó el contrato",
  EDITADO: "Se editó",
  PDF_GENERADO: "Se generó el PDF",
  ENVIADO_FIRMA: "Se envió a firmar",
  FIRMADO: "Lo firmaron",
  RECHAZADO: "Lo rechazaron",
  VENCIMIENTO_AVISADO: "Se avisó del vencimiento",
  RENOVADO: "Se renovó",
  ANULADO: "Se anuló",
  TERMINADO: "Se dio por terminado",
  REVISADO_IA: "Lo revisó la IA",
};

