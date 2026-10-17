/**
 * La tala de una PLANTACIÓN sin censo (ADR-459): se elige la especie del
 * registro, no un árbol censado.
 *
 * Brandon (2-10-2026): «con esos m³ y especie se trabaja, no es necesario
 * poner el censo […] de acuerdo a los procesos se descontará el volumen».
 *
 *  · **La lista**: cada especie registrada con lo que queda en pie
 *    (registrado − talado, la misma resta de `cascadaDeFila`).
 *  · **El código del árbol**: no hay placa del censo, así que se propone el
 *    correlativo del plan + la abreviatura de la especie («001-BOL»), sin
 *    repetir ningún código ya talado en el negocio — T3 mira el código en todo
 *    el negocio, no sólo en el plan. Es una propuesta: el operador la cambia.
 *  · **El saldo a la vista**: registrado − talado − esta tala. Pasarse NO se
 *    frena en la tala (se mide con cinta y el registro es una estimación): lo
 *    frena T6 al despachar. Acá sólo se avisa.
 *
 * PURO: sin React, sin fetch, sin Prisma.
 */

import { claveEspecie, resolverEspecie } from "./loth-constants";
import { cascadaDeFila, TOLERANCIA_CASCADA_M3 } from "./loth-saldo-cascada";

/** Lo que hace falta de una fila del balance del plan (`GET /plan?balance=`). */
export interface FilaBalanceRegistro {
  species: string;
  cites: boolean;
  autorizado: number;
  talado: number;
  trozado?: number;
  movilizado?: number;
  consumido?: number;
}

/** Lo que hace falta de una especie del plan (`GET /plan?planId=` → `species`). */
export interface EspecieDelPlanFila {
  speciesCommon: string;
  speciesScientific?: string | null;
  cites?: boolean | null;
  anioInstalacion?: number | null;
  superficieHa?: number | string | null;
}

export interface EspecieDelRegistro {
  /** Como la escribe el registro. */
  especie: string;
  clave: string;
  cientifico: string | null;
  cites: boolean;
  registradoM3: number;
  taladoM3: number;
  /** registrado − talado. Negativo = ya se taló más de lo registrado. */
  enPieM3: number;
  anioInstalacion: number | null;
  superficieHa: number | null;
}

const r4 = (n: number): number => Math.round(n * 10_000) / 10_000;
const numONull = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Las especies del registro con lo que queda en pie. La base es el balance
 * (sus filas son las especies del plan, leídas con el mismo plan): el detalle
 * de la especie —científico, año, superficie— se cruza por clave.
 */
export function especiesDelRegistro(
  filas: readonly FilaBalanceRegistro[],
  especies: readonly EspecieDelPlanFila[] = [],
): EspecieDelRegistro[] {
  const detalle = new Map(especies.map((e) => [claveEspecie(e.speciesCommon), e]));
  return filas
    .filter((f) => claveEspecie(f.species) !== "")
    .map((f) => {
      const clave = claveEspecie(f.species);
      const d = detalle.get(clave);
      const c = cascadaDeFila({
        species: f.species,
        cites: Boolean(f.cites),
        autorizado: f.autorizado,
        talado: f.talado,
        trozado: f.trozado ?? 0,
        movilizado: f.movilizado ?? 0,
        consumido: f.consumido ?? 0,
      });
      return {
        especie: f.species.trim(),
        clave,
        cientifico: d?.speciesScientific?.trim() || null,
        cites: Boolean(f.cites || d?.cites),
        registradoM3: c.baseM3,
        taladoM3: c.taladoM3,
        enPieM3: c.enPieM3,
        anioInstalacion: d?.anioInstalacion ?? null,
        superficieHa: numONull(d?.superficieHa),
      };
    })
    .sort((a, b) => a.especie.localeCompare(b.especie, "es"));
}

/** La especie del registro que es `especie` (por clave), o `null`. */
export function especieDelRegistro(registro: readonly EspecieDelRegistro[], especie: string | null | undefined): EspecieDelRegistro | null {
  const k = claveEspecie(especie);
  if (!k) return null;
  return registro.find((e) => e.clave === k) ?? null;
}

/**
 * La especie del registro que le corresponde a una línea, con la MISMA regla
 * que T7 y T6 (`resolverEspecie`): por el común o, si los dos lo traen, por el
 * científico. «Bolaina blanca» con *Guazuma crinita* es la Bolaina registrada.
 */
export function especieDeLinea(
  registro: readonly EspecieDelRegistro[],
  comun: string | null | undefined,
  cientifico?: string | null,
): EspecieDelRegistro | null {
  const conClave = registro.map((e) => ({ speciesCommon: e.especie, speciesScientific: e.cientifico, e }));
  return resolverEspecie(conClave, comun, cientifico)?.e ?? null;
}

// ─── Código del árbol ─────────────────────────────────────────────────────────

/**
 * «Bolaina» → «BOL», «Azúcar huayo» → «AZU». Las tres primeras letras del
 * nombre común sin tildes: es lo que la placa del tocón ya reconoce como
 * abreviatura de la especie (`esDeLaEspecie` en `loth-placa.ts`).
 */
export function abreviaturaEspecie(nombre: string | null | undefined): string {
  return claveEspecie(nombre).replace(/[^a-z]/g, "").slice(0, 3).toUpperCase();
}

/** El número de un código de árbol: «001-BOL» → 1, «BOL-12» → 12, «LUP» → null. */
export function numeroDeCodigo(codigo: string | null | undefined): number | null {
  const m = String(codigo ?? "").match(/\d+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isSafeInteger(n) ? n : null;
}

const normCodigo = (c: string) => c.trim().toUpperCase();

/**
 * El código que se propone para la próxima tala de `especie` en el plan:
 * el número que sigue al mayor de las talas del plan, con la abreviatura de
 * la especie. Si ese código ya está talado en el negocio (otro plan usó el
 * mismo), sigue con el próximo número libre.
 *
 * @param codigosDelPlan las talas de ESTE plan (para el correlativo).
 * @param ocupados todas las talas del negocio (T3 no deja repetir ninguna).
 */
export function codigoPropuesto(
  especie: string,
  codigosDelPlan: readonly (string | null | undefined)[],
  ocupados: readonly (string | null | undefined)[] = [],
): string {
  const abrev = abreviaturaEspecie(especie);
  let n = 1;
  for (const c of codigosDelPlan) {
    const k = numeroDeCodigo(c);
    if (k != null && k >= n) n = k + 1;
  }
  const usados = new Set(
    [...codigosDelPlan, ...ocupados].filter((c): c is string => typeof c === "string" && c.trim() !== "").map(normCodigo),
  );
  const armar = (k: number) => {
    const num = String(k).padStart(3, "0");
    return abrev ? `${num}-${abrev}` : num;
  };
  // Tope de vueltas: un negocio con 10 000 talas de la misma especie no existe.
  for (let vueltas = 0; vueltas < 10_000 && usados.has(armar(n)); vueltas++) n++;
  return armar(n);
}

/** Tope de árboles por especie en un «Bolaina × N»: una jornada de tala no tumba más. */
export const MAX_ARBOLES_POR_ESPECIE = 50;

/**
 * Los `n` códigos que siguen para `especie` (la tala en tanda: «Bolaina × 3»
 * → 002-BOL, 003-BOL, 004-BOL). Cada uno cuenta como usado para el siguiente,
 * y ninguno repite un código del plan, del negocio o de la planilla.
 *
 * @param codigosDelPlan las talas de ESTE plan + los códigos que ya tiene la planilla.
 * @param ocupados todas las talas del negocio (T3).
 */
export function codigosPropuestos(
  especie: string,
  n: number,
  codigosDelPlan: readonly (string | null | undefined)[],
  ocupados: readonly (string | null | undefined)[] = [],
): string[] {
  const tope = Number.isFinite(n) ? Math.max(0, Math.min(Math.floor(n), MAX_ARBOLES_POR_ESPECIE)) : 0;
  const out: string[] = [];
  for (let i = 0; i < tope; i++) out.push(codigoPropuesto(especie, [...codigosDelPlan, ...out], ocupados));
  return out;
}

// ─── El saldo mientras se mide ────────────────────────────────────────────────

export interface SaldoDeTala {
  especie: string;
  registradoM3: number;
  /** Lo talado en el libro antes de esta línea. */
  taladoM3: number;
  /** Lo que se está midiendo; `null` mientras no hay volumen. */
  estaTalaM3: number | null;
  /** registrado − talado − esta tala. */
  quedaM3: number;
  /** Cuánto pasa lo registrado (0 si no pasa). Tolerancia: la de la cascada (10 litros). */
  excesoM3: number;
}

/** registrado − talado − esta tala, con el exceso aparte para el aviso. */
export function saldoConEstaTala(e: EspecieDelRegistro, medidoM3: number | null | undefined): SaldoDeTala {
  const esta = medidoM3 != null && Number.isFinite(medidoM3) && medidoM3 > 0 ? r4(medidoM3) : null;
  const queda = r4(e.registradoM3 - e.taladoM3 - (esta ?? 0));
  return {
    especie: e.especie,
    registradoM3: e.registradoM3,
    taladoM3: e.taladoM3,
    estaTalaM3: esta,
    quedaM3: queda,
    excesoM3: queda < -TOLERANCIA_CASCADA_M3 ? r4(-queda) : 0,
  };
}

// ─── El saldo con la planilla de la tala en tanda ─────────────────────────────

/** Lo que hace falta de una fila de la planilla para descontarla. */
export interface ArbolDeLaPlanilla {
  especie: string;
  cientifico: string | null;
  /** El volumen medido; `null` mientras no hay medidas. */
  volumenM3: number | null;
}

export interface SaldoEnPlanilla extends SaldoDeTala {
  /** Filas de la especie en la planilla. */
  arboles: number;
  /** De ésas, cuántas todavía no tienen volumen (no descuentan). */
  sinVolumen: number;
}

/**
 * registrado − talado − lo de la planilla, por especie del registro que
 * aparece en la planilla (en el orden del registro). Las filas de una especie
 * que no está en el registro salen aparte en `fuera`: T7 las rechaza al guardar.
 *
 * El «talado» es el de la lectura del registro al abrir la planilla: las filas
 * ya guardadas siguen en la planilla y descuentan desde acá (si se releyera el
 * registro, se restarían dos veces).
 */
export function saldoDeLaPlanilla(
  registro: readonly EspecieDelRegistro[],
  filas: readonly ArbolDeLaPlanilla[],
): { porEspecie: SaldoEnPlanilla[]; fuera: string[] } {
  const suma = new Map<string, { m3: number; arboles: number; sinVolumen: number }>();
  const fuera: string[] = [];
  for (const f of filas) {
    const e = especieDeLinea(registro, f.especie, f.cientifico);
    if (!e) {
      const nombre = f.especie.trim();
      if (nombre && !fuera.includes(nombre)) fuera.push(nombre);
      continue;
    }
    const acc = suma.get(e.clave) ?? { m3: 0, arboles: 0, sinVolumen: 0 };
    acc.arboles += 1;
    if (f.volumenM3 != null && Number.isFinite(f.volumenM3) && f.volumenM3 > 0) acc.m3 += f.volumenM3;
    else acc.sinVolumen += 1;
    suma.set(e.clave, acc);
  }
  const porEspecie = registro.flatMap((e) => {
    const acc = suma.get(e.clave);
    if (!acc) return [];
    return [{ ...saldoConEstaTala(e, acc.m3 > 0 ? acc.m3 : null), arboles: acc.arboles, sinVolumen: acc.sinVolumen }];
  });
  return { porEspecie, fuera };
}
