/**
 * Constantes compartidas del LO-TH (ADR-125), seguras para cliente y servidor.
 * NO importar nada de `lib/db/*` ni `@/lib/prisma` acá (server-only).
 */

export const LOTH_SECTIONS = [
  "tala",
  "trozado",
  "despacho_troza",
  "consumo_troza",
  "producto_terminado",
  "despacho_producto",
] as const;

export type LothSection = (typeof LOTH_SECTIONS)[number];

/** DTO de una entrada del LO-TH tal como la devuelve la API (Decimals → string). */
export interface LothEntryDTO {
  id: string;
  section: LothSection;
  lineNo: number;
  entryDate: string;
  treeCode: string | null;
  trozaCode: string | null;
  despachoCode: string | null;
  isRama: boolean;
  speciesCommon: string | null;
  speciesScientific: string | null;
  cites: boolean;
  diamMayorM: string | null;
  diamMenorM: string | null;
  lengthM: string | null;
  volumeM3: string | null;
  productType: string | null;
  quantity: string | null;
  unit: string | null;
  pieces: number | null;
  gtfNumber: string | null;
  discarded: boolean;
  consumoInterno: boolean;
  observations: string | null;
  status: "registrado" | "anulado";
  annulledReason: string | null;
}
