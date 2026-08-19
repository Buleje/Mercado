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

/**
 * ANCLA de calibración del precio de compra local (Brandon, 2026-08-19): el
 * miércoles 19-ago-2026 en Ciudad Constitución se compró el seco a S/ 17.80/kg,
 * cuando la conversión oficial de ese día (ICE US$ 6,008/t × FX 3.3568) daba
 * S/ 20.17/kg → factor real ≈ 0.883 del oficial. Reemplaza el ancla anterior
 * (S/ 18.20 del 10-jul-2026, ≈0.905): re-calibrar = editar SOLO este objeto,
 * el rótulo de fecha (`ANCLA_CC_LABEL`) se recalcula solo.
 */
const ANCLA_CC = { fecha: "2026-08-19", compraSolKg: 17.8, usdT: 6008, fx: 3.3568 } as const;
const COMPRA_LOCAL = ANCLA_CC.compraSolKg / ((ANCLA_CC.usdT / 1000) * ANCLA_CC.fx); // ≈ 0.883

/** Rótulo "S/ X.XX del <día corto> <día> <mes corto>" para UI — single source de la
 * fecha/precio del ancla, para no repetir el string a mano en cada componente. */
const DIAS_CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const anclaFecha = new Date(`${ANCLA_CC.fecha}T00:00:00Z`);
const ANCLA_CC_FECHA_LABEL = `${DIAS_CORTOS[anclaFecha.getUTCDay()]} ${String(anclaFecha.getUTCDate()).padStart(2, "0")} ${MESES_CORTOS[anclaFecha.getUTCMonth()]}`;
export const ANCLA_CC_LABEL = `S/ ${ANCLA_CC.compraSolKg.toFixed(2)} del ${ANCLA_CC_FECHA_LABEL}`;

/** Fracción del precio internacional (grano SECO) que llega a cada eslabón. */
const FACTOR = {
  internacional: 1.0, // ICE New York = referencia mundial (bulk)
  fob: 0.92, // puesto en Callao, grado exportable
  lima: 0.83, // comprador / planta exportadora en Lima
  acopio: 0.74, // acopiador regional (Oxapampa / Pucallpa)
  // Dato real calibrado con ANCLA_CC. OJO: queda por ENCIMA de los estimados de
  // acopio/Lima — esos siguen siendo estimados gruesos de otras plazas; este es
  // el único eslabón con precio observado.
  chacra: COMPRA_LOCAL,
} as const;

/** 1 kg de baba (fresco) rinde ~0.40 kg seco → su precio/kg ≈ seco × este factor. */
const BABA_YIELD = 0.4;
/** Premio del fino de aroma bien fermentado sobre el bulk (coop/export/chacra). */
const FINO_PREMIUM = 0.12;
/**
 * Banda de incertidumbre por plaza (±fracción). Crece cuanto MÁS abajo en la
 * cadena está la plaza: el precio en chacra depende de flete, comprador del día
 * y cantidad de intermediarios, así que es mucho más incierto que el FOB. Bandas
 * anchas a propósito — esto es un estimado grueso, no una cotización.
 */
const BANDA_PCT: Record<CacaoPlazaId, number> = {
  internacional: 0.03,
  fob: 0.07,
  lima: 0.1,
  acopio: 0.13,
  "chacra-cc": 0.06, // banda angosta: dato real de la zona, no estimado
  "baba-cc": 0.12, // deriva del dato real de chacra × rendimiento baba
};

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
const rango = (v: number, pct: number): [number, number] => [
  r2(v * (1 - pct)),
  r2(v * (1 + pct)),
];

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
    rango: rango(valor, BANDA_PCT[id]),
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
      `Dato real de la zona (${ANCLA_CC_LABEL}): acá se compra ≈${Math.round(FACTOR.chacra * 100)}% del precio oficial. El precio final igual depende de humedad, calidad y comprador del día.`),
    mk("baba-cc", "Ciudad Constitución — en baba (fresco)", "Ciudad Constitución", "baba", baba, true,
      "Cacao fresco sin fermentar/secar. ~2,5 kg de baba hacen 1 kg seco."),
  ];

  return {
    refSolKg: r2(ref),
    finoAroma,
    plazas,
    disclaimer:
      "Estimado MUY aproximado — no es una cotización. Parte del precio internacional de hoy y aplica " +
      "descuentos típicos de la cadena (flete, secado, márgenes), así que puede desviarse bastante del " +
      "precio real, que depende de calidad, humedad, fermentación y del comprador. Verificá con tu comprador.",
  };
}

/**
 * Precio de COMPRA local en Ciudad Constitución como fracción del precio oficial
 * internacional convertido a soles, calibrado con ANCLA_CC (S/ 17.80 del mié
 * 19-ago-2026). Single source: lo usan el flujo de precio en modo S//kg, el hero
 * "Compra local" del noticiero, la tabla de conversión y Mi precio.
 */
export const CHACRA_CC_COMPRA_OFICIAL_FACTOR = FACTOR.chacra;
/** % entero para rotular en UI ("compra local ≈ 88% del oficial"). */
export const COMPRA_LOCAL_PCT = Math.round(CHACRA_CC_COMPRA_OFICIAL_FACTOR * 100);
