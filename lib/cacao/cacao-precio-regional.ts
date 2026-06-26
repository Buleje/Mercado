/**
 * cacao-precio-regional.ts — estima a cuánto se VENDE el cacao EN SOLES por plaza,
 * partiendo de la referencia internacional (ICE → S//kg seco). PURO y client-safe
 * (sin prisma, sin fetch, sin "server-only") → se puede importar en componentes.
 *
 * Los factores son FRACCIONES de la referencia internacional, basados en la
 * estructura real de la cadena del cacao en la Selva Central peruana:
 *
 *   internacional (ICE/FOB) ─▶ exportador Lima ─▶ acopio regional ─▶ en chacra
 *
 * Ciudad Constitución (Pasco, frontera de colonización de la Selva Central) está
 * LEJOS del Callao: más flete y más eslabones de intermediación que las zonas
 * cercanas a puerto → el productor recibe MENOS por kg que en Lima o un exportador.
 * El "fino de aroma" peruano bien fermentado cotiza con premio sobre el bulk ICE.
 *
 * TODO ES ESTIMADO — la UI debe rotularlo. No reemplaza una cotización real.
 */

/** Fracción del precio internacional (grano SECO) que llega a cada eslabón. */
const FACTOR = {
  internacional: 1.0, // ICE New York = referencia mundial (bulk)
  fob: 0.92, // puesto en Callao, grado exportable
  lima: 0.83, // comprador / planta exportadora en Lima
  acopio: 0.74, // acopiador regional (Oxapampa / Pucallpa)
  chacra: 0.66, // en chacra Ciudad Constitución, grano seco, al productor
} as const;

/** 1 kg de baba (fresco) rinde ~0.40 kg seco → su precio/kg ≈ seco × este factor. */
const BABA_YIELD = 0.4;
/** Premio del fino de aroma bien fermentado sobre el bulk (coop/export/chacra). */
const FINO_PREMIUM = 0.12;
/** Banda de incertidumbre del estimado (±%). */
const RANGO_PCT = 0.07;

export type CacaoPlazaId = "internacional" | "fob" | "lima" | "acopio" | "chacra-cc" | "baba-cc";

export interface CacaoPlazaPrecio {
  id: CacaoPlazaId;
  plaza: string; // nombre largo p/ la fila
  zona: string; // etiqueta corta (Mundo, Lima, Selva Central…)
  estado: "seco" | "baba";
  solKg: number; // estimado central S//kg
  rango: [number, number]; // [mín, máx] del estimado
  pctRef: number; // % respecto a la referencia internacional
  destacar: boolean; // true = la plaza que le importa al usuario (CC)
  nota: string;
}

export interface CacaoPreciosRegionales {
  refSolKg: number; // referencia internacional S//kg seco
  finoAroma: boolean;
  plazas: CacaoPlazaPrecio[];
  disclaimer: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const rango = (v: number): [number, number] => [r2(v * (1 - RANGO_PCT)), r2(v * (1 + RANGO_PCT))];

/**
 * Estima los precios por plaza a partir de la referencia internacional en S//kg
 * seco (la que ya calcula cacao-market: ICE/1000 × FX). Si `finoAroma`, aplica el
 * premio del fino sobre los eslabones nacionales (no sobre el bulk ICE).
 */
export function estimarPreciosRegionales(
  refSolKgSeco: number | null | undefined,
  finoAroma = false,
): CacaoPreciosRegionales | null {
  const ref = typeof refSolKgSeco === "number" && refSolKgSeco > 0 ? refSolKgSeco : null;
  if (ref == null) return null;

  const fino = finoAroma ? 1 + FINO_PREMIUM : 1;
  const internacional = ref * FACTOR.internacional;
  const fob = ref * FACTOR.fob * fino;
  const lima = ref * FACTOR.lima * fino;
  const acopio = ref * FACTOR.acopio * fino;
  const chacra = ref * FACTOR.chacra * fino;
  const baba = chacra * BABA_YIELD;

  const mk = (
    id: CacaoPlazaId,
    plaza: string,
    zona: string,
    estado: "seco" | "baba",
    valor: number,
    destacar: boolean,
    nota: string,
  ): CacaoPlazaPrecio => ({
    id,
    plaza,
    zona,
    estado,
    solKg: r2(valor),
    rango: rango(valor),
    pctRef: Math.round((valor / ref) * 100),
    destacar,
    nota,
  });

  const plazas: CacaoPlazaPrecio[] = [
    mk("internacional", "Precio internacional (ICE New York)", "Mundo", "seco", internacional, false,
      "Referencia mundial del grano seco. No es lo que cobra el productor."),
    mk("fob", "Exportación FOB Callao", "Puerto", "seco", fob, false,
      "Grano seco grado I puesto en el puerto, listo para exportar."),
    mk("lima", "Comprador / planta en Lima", "Lima", "seco", lima, false,
      "Exportador o planta que compra en Lima; descuenta su margen y logística."),
    mk("acopio", "Acopio regional (Oxapampa / Pucallpa)", "Selva Central", "seco", acopio, false,
      "Acopiador intermedio de la región; paga rápido pero menos que Lima."),
    mk("chacra-cc", "Ciudad Constitución — en chacra (seco)", "Ciudad Constitución", "seco", chacra, true,
      "Lo que recibe el productor por grano seco en CC. Lejos del puerto = más flete y más intermediarios."),
    mk("baba-cc", "Ciudad Constitución — en baba (fresco)", "Ciudad Constitución", "baba", baba, true,
      "Cacao fresco sin fermentar/secar. ~2,5 kg de baba hacen 1 kg seco."),
  ];

  return {
    refSolKg: r2(ref),
    finoAroma,
    plazas,
    disclaimer:
      "Estimado: parte del precio internacional de hoy y aplica los descuentos típicos de la cadena " +
      "(flete, secado, márgenes). El precio real cambia por calidad, humedad, fermentación y comprador.",
  };
}

/** Fracción para convertir el precio internacional (S//kg seco) a "en chacra CC seco". */
export const CHACRA_CC_SECO_FACTOR = FACTOR.chacra;
