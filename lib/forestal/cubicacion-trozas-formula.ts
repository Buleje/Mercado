/**
 * cubicacion-trozas-formula — las DOS maneras de cubicar el patio en el
 * Cubicador de trozas (Herramientas), Brandon 2026-10-08:
 *
 *   - **Smalian SERFOR (m³)**: Ø en cm, largo en m, 0.7854 × Ø medio² × L
 *     (ADR-492; la Smalian pura se retiró). Es lo que declara la GTF.
 *   - **Oxapampina (PT)**: Ø en PULGADAS, largo en PIES, PT = Ø × Ø × L ÷ 24,5
 *     (ADR-440). Con eso se compra, se vende y se paga el flete. Sin m³.
 *
 * Cada fórmula es SU lote (clave de localStorage aparte): cambiar de fórmula
 * cambia de lote, nunca reinterpreta centímetros como pulgadas. El lote
 * Smalian conserva la clave de siempre, que leen el reparto rolliza → aserrada
 * y la calculadora de rendimiento (necesitan m³).
 *
 * Un Ø o dos: con uno es el medido al medio de la troza; con dos, el promedio
 * de las puntas. El dictado va en PARES «Ø largo» o en TRÍOS «Ø Ø largo».
 *
 * PURO y client-safe.
 */
import {
  clasificarTrozaPorDiametro, cubicarTroza, DIAMETRO_MAX_CM, DIAMETRO_MIN_CM, LARGO_MAX_M,
  type TipoTroza, type TrozaCubicada, type TrozaParseada,
} from "./cubicacion-trozas";
import { DIVISOR_OXAPAMPA, ptOxapampaDelCubicador } from "./cubicacion-oxapampa";

export type FormulaTrozas = "smalian" | "oxapampina";
export const FORMULAS_TROZAS: readonly FormulaTrozas[] = ["smalian", "oxapampina"];
export const esFormulaTrozas = (v: unknown): v is FormulaTrozas => v === "smalian" || v === "oxapampina";

/** Diámetros por troza: 1 = al medio; 2 = las dos puntas (se promedian). */
export type DiametrosPorTroza = 1 | 2;
export const esDiametrosPorTroza = (v: unknown): v is DiametrosPorTroza => v === 1 || v === 2;
/** Smalian sigue en dos puntas (lo de siempre); la Oxapampina arranca con un Ø al medio. */
export const DIAMETROS_POR_DEFECTO: Readonly<Record<FormulaTrozas, DiametrosPorTroza>> = { smalian: 2, oxapampina: 1 };

const CM_POR_PULGADA = 2.54;
const M_POR_PIE = 0.3048;

export interface UnidadesFormula {
  nombre: string;
  /** Lo que dice el selector. */
  etiqueta: string;
  /** Unidad del Ø en las cabeceras y en la voz. */
  diametro: "cm" | "pulg";
  /** Pegado al número: «40 cm», «20″». */
  diametroCorto: string;
  largo: "m" | "pies";
  volumen: "m³" | "PT";
  /** Decimales con los que se muestra el volumen de una troza. */
  decimales: number;
  /** La fórmula en una línea, para el ⓘ y las referencias. */
  cuenta: string;
}

export const UNIDADES_FORMULA: Readonly<Record<FormulaTrozas, UnidadesFormula>> = {
  smalian: {
    nombre: "Smalian SERFOR", etiqueta: "Smalian SERFOR (m³)", diametro: "cm", diametroCorto: " cm", largo: "m",
    volumen: "m³", decimales: 3, cuenta: "0,7854 × Ø medio² × largo",
  },
  oxapampina: {
    nombre: "Oxapampina", etiqueta: "Oxapampina (PT)", diametro: "pulg", diametroCorto: "″", largo: "pies",
    volumen: "PT", decimales: 2, cuenta: `Ø × Ø × L ÷ ${String(DIVISOR_OXAPAMPA).replace(".", ",")}`,
  },
};

/** Lo que se considera una medida rara (se marca, nunca se corrige sola). */
export interface RangoFormula { diametroMin: number; diametroMax: number; largoMax: number }
export const RANGO_FORMULA: Readonly<Record<FormulaTrozas, RangoFormula>> = {
  smalian: { diametroMin: DIAMETRO_MIN_CM, diametroMax: DIAMETRO_MAX_CM, largoMax: LARGO_MAX_M },
  /* Los mismos topes del mundo, pasados a pulgadas y pies: 10 cm ≈ 4″,
     200 cm ≈ 79″, 15 m ≈ 49′. */
  oxapampina: {
    diametroMin: Math.round(DIAMETRO_MIN_CM / CM_POR_PULGADA),
    diametroMax: Math.round(DIAMETRO_MAX_CM / CM_POR_PULGADA),
    largoMax: Math.round(LARGO_MAX_M / M_POR_PIE),
  },
};

export function fueraDeRango(formula: FormulaTrozas, d1: number, d2: number, largo: number): boolean {
  const r = RANGO_FORMULA[formula];
  return largo > r.largoMax || d1 < r.diametroMin || d2 < r.diametroMin || d1 > r.diametroMax || d2 > r.diametroMax;
}

/** El volumen de una troza en la unidad de su fórmula (m³ o PT); 0 si no se puede. */
export function cubicarSegun(formula: FormulaTrozas, d1: number, largo: number, d2?: number): number {
  if (formula === "smalian") return cubicarTroza(d1, largo, d2);
  return ptOxapampaDelCubicador(d1, largo, d2) ?? 0;
}

type Medidas = Omit<TrozaCubicada, "m3" | "pt">;

/**
 * El lote Smalian guardado en el navegador con el m³ de HOY (ADR-492). Las filas
 * cubicadas antes del cambio traen el `m3` de la Smalian pura (hasta +4,44 % por troza medido en Blas, ADR-492);
 * el m³ es un derivado de D1/D2/largo, así que se recalcula al LEER en vez de
 * confiar en el guardado. Una fila sin medidas válidas conserva lo que traía.
 * Sólo el lote Smalian: la Oxapampina no cambió.
 */
export function recubicarLoteSmalian<T extends object>(rows: readonly T[]): T[] {
  return rows.map((r) => {
    const t = r as { d1?: unknown; d2?: unknown; largo?: unknown };
    const m3 = cubicarTroza(Number(t.d1), Number(t.largo), Number(t.d2));
    return m3 > 0 ? { ...r, m3 } : r;
  });
}

/** La fila con su volumen recalculado: m³ en Smalian SERFOR; PT (y m³ en 0) en Oxapampina. */
export function conVolumen<T extends Medidas>(formula: FormulaTrozas, t: T): T & { m3: number; pt?: number } {
  const v = cubicarSegun(formula, t.d1, t.largo, t.d2);
  if (formula === "smalian") {
    const { pt: _pt, ...resto } = t as T & { pt?: number };
    return { ...(resto as T), m3: v };
  }
  return { ...t, m3: 0, pt: v };
}

/** El volumen de una fila en la unidad de la fórmula de su lote. */
export const volumenDe = (t: Pick<TrozaCubicada, "m3" | "pt">, formula: FormulaTrozas): number =>
  formula === "oxapampina" ? (t.pt ?? 0) : t.m3;

/** La otra fórmula del cubicador: con Smalian se muestra la Oxapampina y al revés. */
export const OTRA_FORMULA: Readonly<Record<FormulaTrozas, FormulaTrozas>> = { smalian: "oxapampina", oxapampina: "smalian" };

type MedidasTroza = Pick<TrozaCubicada, "d1" | "d2" | "largo">;

/**
 * Las medidas de una troza pasadas a las unidades de la OTRA fórmula (Brandon
 * 15-10): Smalian → Oxapampina = cm ÷ 2,54 y m ÷ 0,3048 (× 3,2808); al revés,
 * pulgadas × 2,54 y pies × 0,3048. Cada Ø se convierte por separado: las dos
 * fórmulas promedian las puntas (Ø medio), así que da lo mismo que promediar
 * antes de convertir. Con un Ø al medio (d1 = d2) la otra usa ese mismo Ø.
 */
export function medidasEnLaOtra(formula: FormulaTrozas, t: MedidasTroza): MedidasTroza {
  if (formula === "smalian") {
    return { d1: t.d1 / CM_POR_PULGADA, d2: t.d2 / CM_POR_PULGADA, largo: t.largo / M_POR_PIE };
  }
  return { d1: t.d1 * CM_POR_PULGADA, d2: t.d2 * CM_POR_PULGADA, largo: t.largo * M_POR_PIE };
}

/**
 * El volumen EQUIVALENTE de una troza en la otra fórmula: PT Oxapampina de un
 * lote Smalian (con `ptOxapampa`, vía `cubicarSegun`) o m³ Smalian SERFOR de un
 * lote Oxapampina (`smalianVolume`, vía `cubicarTroza`). Es un DERIVADO de las
 * medidas convertidas, no lo medido: la pantalla lo rotula «equivalente».
 * 62/50 cm × 4 m → 24,41″/19,69″ × 13,12′ → 260,37 PT.
 */
export function equivalenteEnLaOtra(formula: FormulaTrozas, t: MedidasTroza): number {
  const m = medidasEnLaOtra(formula, t);
  return cubicarSegun(OTRA_FORMULA[formula], m.d1, m.largo, m.d2);
}

/** El total equivalente del patio, con el redondeo de la otra unidad (PT a 2, m³ a 4). */
export function totalEquivalente(rows: readonly MedidasTroza[], formula: FormulaTrozas): number {
  return redondearVolumen(rows.reduce((a, r) => a + equivalenteEnLaOtra(formula, r), 0), OTRA_FORMULA[formula]);
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;
/** Redondeo del total según la unidad: m³ a 4 decimales (como `totalesTrozas`), PT a 2. */
export const redondearVolumen = (v: number, formula: FormulaTrozas): number => (formula === "oxapampina" ? r2(v) : r4(v));

export function totalesSegun(rows: readonly TrozaCubicada[], formula: FormulaTrozas): { trozas: number; volumen: number } {
  return { trozas: rows.length, volumen: redondearVolumen(rows.reduce((a, r) => a + volumenDe(r, formula), 0), formula) };
}

/** El Ø en cm, para clasificar con los umbrales de siempre (25/40 cm). */
export const diametroEnCm = (d: number, formula: FormulaTrozas): number => (formula === "oxapampina" ? d * CM_POR_PULGADA : d);

/** Delgada/Media/Gruesa con el Ø en la unidad del lote: 20″ es Gruesa, no Delgada. */
export function tipoDeTrozaSegun(t: Pick<TrozaCubicada, "d1" | "tipo">, formula: FormulaTrozas): TipoTroza {
  return t.tipo ?? clasificarTrozaPorDiametro(diametroEnCm(t.d1, formula));
}

/** El Ø que se dice/edita con un solo diámetro: el de la troza o el promedio de sus dos puntas. */
export const diametroUnico = (t: Pick<TrozaCubicada, "d1" | "d2">): number => (t.d1 === t.d2 ? t.d1 : r2((t.d1 + t.d2) / 2));

/**
 * Parte lo dictado en trozas: PARES «Ø largo» con un diámetro, TRÍOS «Ø Ø
 * largo» con dos. Con un Ø la troza queda pareja (d1 = d2). El sobrante se
 * arrastra a la siguiente frase. Con Smalian y dos Ø es exactamente
 * `partirEnTrozas`.
 */
export function partirEnMedidas(
  nums: readonly number[],
  diametros: DiametrosPorTroza,
  formula: FormulaTrozas,
): { trozas: TrozaParseada[]; resto: number[] } {
  const paso = diametros === 1 ? 2 : 3;
  const trozas: TrozaParseada[] = [];
  let i = 0;
  for (; i + paso <= nums.length; i += paso) {
    const d1 = nums[i];
    const d2 = diametros === 1 ? d1 : nums[i + 1];
    const largo = nums[i + paso - 1];
    if (d1 > 0 && d2 > 0 && largo > 0) trozas.push({ d1, d2, largo, sospechosa: fueraDeRango(formula, d1, d2, largo) });
  }
  return { trozas, resto: nums.slice(i) };
}

/** Las medidas de una troza como se dicen: «20, 12» o «18, 22, 12». */
export const medidasEnVoz = (t: Pick<TrozaCubicada, "d1" | "d2" | "largo">, diametros: DiametrosPorTroza): string =>
  diametros === 1 ? `${diametroUnico(t)}, ${t.largo}` : `${t.d1}, ${t.d2}, ${t.largo}`;

/** Resumen del patio para los indicadores: especies por volumen, Ø y largo medios. */
export function resumenDelPatio(rows: readonly TrozaCubicada[], formula: FormulaTrozas) {
  const porEspecie = new Map<string, number>();
  let sumaD = 0;
  let largoTotal = 0;
  let total = 0;
  for (const r of rows) {
    const e = r.especie?.trim() || "Sin especie";
    const v = volumenDe(r, formula);
    porEspecie.set(e, (porEspecie.get(e) ?? 0) + v);
    total += v;
    /* El Ø de una troza es el promedio de sus dos puntas: promediar sólo el
       menor subestimaría el patio. */
    sumaD += (r.d1 + r.d2) / 2;
    largoTotal += r.largo;
  }
  const especies = [...porEspecie.entries()].sort((a, b) => b[1] - a[1]);
  return {
    especies,
    dominante: especies[0] ?? null,
    pctDominante: total > 0 && especies[0] ? (especies[0][1] / total) * 100 : 0,
    diametroMedio: rows.length > 0 ? sumaD / rows.length : 0,
    largoMedio: rows.length > 0 ? largoTotal / rows.length : 0,
  };
}

export type ResumenDelPatio = ReturnType<typeof resumenDelPatio>;

/** Las claves del lote por tenant. La Smalian es la de siempre. */
export const claveLoteTrozas = (slug: string, formula: FormulaTrozas): string =>
  formula === "smalian" ? `buleje-cubicacion-trozas-${slug}` : `buleje-cubicacion-trozas-oxapampina-${slug}`;
/** Preferencias (fórmula elegida, Ø por fórmula): cuelgan de la clave Smalian, como `-cols` y `-orden`. */
export const claveFormulaTrozas = (slug: string): string => `${claveLoteTrozas(slug, "smalian")}-formula`;
export const claveDiametrosTrozas = (slug: string): string => `${claveLoteTrozas(slug, "smalian")}-diametros`;

/**
 * CSV del patio en la unidad del lote (BOM para que Excel lea las tildes), con
 * una última columna aparte: el equivalente en la otra fórmula (derivado).
 */
export function patioACsv(rows: readonly TrozaCubicada[], formula: FormulaTrozas, diametros: DiametrosPorTroza): string {
  const ox = formula === "oxapampina";
  const ud = ox ? "pulg" : "cm";
  const head = [
    ...(diametros === 1 ? [`D${ud}`] : [`D1${ud}`, `D2${ud}`]),
    ox ? "LargoPies" : "LargoM", "Especie", ox ? "PT" : "m3",
    ox ? "m3 Smalian SERFOR (equivalente)" : "PT Oxapampina (equivalente)",
  ];
  const lines = rows.map((r) => [
    ...(diametros === 1 ? [diametroUnico(r)] : [r.d1, r.d2]), r.largo, r.especie ?? "", volumenDe(r, formula),
    equivalenteEnLaOtra(formula, r),
  ].join(","));
  const total = totalesSegun(rows, formula).volumen.toFixed(ox ? 2 : 4);
  const totalEq = totalEquivalente(rows, formula).toFixed(ox ? 4 : 2);
  const vacias = head.length - 3;
  return "﻿" + [head.join(","), ...lines, ["TOTAL", ...Array<string>(vacias).fill(""), total, totalEq].join(",")].join("\n");
}
