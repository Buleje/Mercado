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

// ─── Fórmulas SERFOR (puras, testeables, sin deps) ─────────────────────────

/** Cubicación de troza (Smalian/SERFOR): 0.7854 × ((Ø mayor + Ø menor)/2)² × Longitud (m³). */
export function smalianVolume(diamMayorM: number, diamMenorM: number, lengthM: number): number {
  if (!(diamMayorM > 0) || !(diamMenorM > 0) || !(lengthM > 0)) return 0;
  const dProm = (diamMayorM + diamMenorM) / 2;
  return Math.round(0.7854 * dProm * dProm * lengthM * 10000) / 10000;
}

/** Volumen comercial del árbol en pie (SERFOR): 0.7854 × DAP² × Hc × ff. */
export function censusVolume(dapM: number, hcM: number, ff = 0.65): number {
  if (!(dapM > 0) || !(hcM > 0)) return 0;
  return Math.round(0.7854 * dapM * dapM * hcM * ff * 10000) / 10000;
}

export interface BalanceSpeciesInput {
  speciesCommon: string;
  cites: boolean;
  volumenAutorizadoM3: number;
  precioVentaSoles?: number | null;
  valorEstadoNaturalSoles?: number | null;
}
export interface BalanceMovement {
  section: string;
  speciesCommon: string | null;
  trozaCode: string | null;
  volumeM3: number | null;
  quantity: number | null;
  unit: string | null;
}
export interface BalanceRowOut {
  species: string; cites: boolean; autorizado: number; talado: number; movilizado: number;
  saldo: number; pctMovilizado: number; precioVenta: number; valorMovilizado: number;
  pagoDerecho: number; exceso: boolean;
}

/**
 * Balance de extracción puro (SERFOR): autorizado − movilizado(GTF) por especie.
 * - talado    = Σ volumen de Tala por especie
 * - movilizado = Σ volumen de trozas despachadas (resuelto vía Trozado) +
 *                Σ cantidad de producto terminado despachado en m³
 * - pago área  = 0.01% UIT × ha ; pago derecho especie = VEN × movilizado
 */
export function computeBalance(
  species: BalanceSpeciesInput[],
  movements: BalanceMovement[],
  opts: { uitRef?: number; areaHa?: number } = {},
): { rows: BalanceRowOut[]; pagoArea: number; pagoDerechoTotal: number; valorTotal: number } {
  const trozaMap = new Map<string, { species: string | null; vol: number }>();
  const talado: Record<string, number> = {};
  for (const e of movements) {
    if (e.section === "trozado" && e.trozaCode) {
      trozaMap.set(e.trozaCode, { species: e.speciesCommon, vol: Number(e.volumeM3 ?? 0) });
    }
    if (e.section === "tala" && e.speciesCommon) {
      talado[e.speciesCommon] = (talado[e.speciesCommon] ?? 0) + Number(e.volumeM3 ?? 0);
    }
  }
  const movilizado: Record<string, number> = {};
  for (const e of movements) {
    if (e.section === "despacho_troza" && e.trozaCode) {
      const t = trozaMap.get(e.trozaCode);
      if (t?.species) movilizado[t.species] = (movilizado[t.species] ?? 0) + t.vol;
    }
    if (e.section === "despacho_producto" && e.speciesCommon && e.unit === "m3") {
      movilizado[e.speciesCommon] = (movilizado[e.speciesCommon] ?? 0) + Number(e.quantity ?? 0);
    }
  }
  const uit = Number(opts.uitRef ?? 0);
  const area = Number(opts.areaHa ?? 0);
  const pagoArea = Math.round(0.0001 * uit * area * 100) / 100;

  let pagoDerechoTotal = pagoArea;
  let valorTotal = 0;
  const rows = species.map((s) => {
    const autorizado = Number(s.volumenAutorizadoM3);
    const mov = movilizado[s.speciesCommon] ?? 0;
    const tal = talado[s.speciesCommon] ?? 0;
    const saldo = Math.round((autorizado - mov) * 10000) / 10000;
    const precio = Number(s.precioVentaSoles ?? 0);
    const ven = Number(s.valorEstadoNaturalSoles ?? 0);
    const valorMovilizado = Math.round(mov * precio * 100) / 100;
    const pagoDerecho = Math.round(mov * ven * 100) / 100;
    valorTotal += valorMovilizado;
    pagoDerechoTotal += pagoDerecho;
    return {
      species: s.speciesCommon, cites: s.cites, autorizado,
      talado: Math.round(tal * 10000) / 10000, movilizado: Math.round(mov * 10000) / 10000,
      saldo, pctMovilizado: autorizado > 0 ? Math.round((mov / autorizado) * 1000) / 10 : 0,
      precioVenta: precio, valorMovilizado, pagoDerecho,
      exceso: tal > autorizado + 1e-6 || mov > autorizado + 1e-6,
    };
  });
  return { rows, pagoArea, pagoDerechoTotal: Math.round(pagoDerechoTotal * 100) / 100, valorTotal: Math.round(valorTotal * 100) / 100 };
}

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
