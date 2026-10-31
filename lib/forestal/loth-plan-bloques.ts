/**
 * Especies por bloque o zona de una plantación (Brandon 24-10: «en un bloque
 * puede haber 30 árboles, tiene su sup ha, su volumen y especie, y en el
 * bloque dos esa misma especie con diferente cantidad de árboles»).
 *
 * El saldo del libro se lleva POR ESPECIE: una `ForestPlanSpecies` por especie
 * (`EspecieRepetidaError`) y la tala, el trozado y el despacho descuentan de
 * ahí. Los bloques son el DETALLE de dónde está cada especie:
 *
 *  · lo que se registra como especie del plan es la suma por especie de todos
 *    los bloques (`juntarPorEspecie`): el saldo no cambia de reglas;
 *  · el reparto por bloque se guarda aparte (`ForestPlanBloquesDB`, sin schema);
 *  · si después alguien corrige una especie en «Registro y saldo», el reparto
 *    no se toca solo: `cuadreConElRegistro` dice la diferencia, no la esconde.
 *
 * Puro: sin base ni React (lo usan el formulario, la ruta y la pestaña Registro).
 */
import { z } from "zod";
import { claveEspecie } from "./loth-constants";
import { ANIO_INSTALACION_MAX, ANIO_INSTALACION_MIN } from "./loth-plan-especie";

export const MAX_BLOQUES = 60;
export const MAX_ESPECIES_POR_BLOQUE = 60;
/** Diferencia de m³ que todavía «cuadra»: la mitad del último decimal que se muestra (0,001 m³). */
export const TOLERANCIA_M3 = 0.0005;

const r4 = (n: number) => Math.round((n + Number.EPSILON) * 10_000) / 10_000;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Una especie dentro de UN bloque: lo que dice la fila del bloque, ya en números. */
export const especieDelBloqueSchema = z
  .object({
    speciesCommon: z.string().trim().min(1).max(120),
    speciesScientific: z.string().trim().max(150).nullable(),
    cites: z.boolean(),
    volumenM3: z.number().positive().max(9_999_999),
    arboles: z.number().int().nonnegative().max(999_999).nullable(),
    superficieHa: z.number().nonnegative().max(9_999_999).nullable(),
    anioInstalacion: z.number().int().min(ANIO_INSTALACION_MIN).max(ANIO_INSTALACION_MAX).nullable(),
    precioVentaSoles: z.number().nonnegative().max(9_999_999).nullable(),
  })
  .strict();

export const bloqueDelPlanSchema = z
  .object({
    nombre: z.string().trim().min(1).max(80),
    especies: z.array(especieDelBloqueSchema).min(1).max(MAX_ESPECIES_POR_BLOQUE),
  })
  .strict();

/**
 * El reparto entero de un plan. Vacío = sin bloques (se borra el reparto).
 * Dos bloques con el mismo nombre, o una especie dos veces en el MISMO bloque,
 * no entran: partirían el detalle sin decir cuál vale.
 */
export const bloquesDelPlanSchema = z
  .array(bloqueDelPlanSchema)
  .max(MAX_BLOQUES)
  .superRefine((bloques, ctx) => {
    const nombres = new Set<string>();
    bloques.forEach((b, i) => {
      const n = b.nombre.trim().toLowerCase();
      if (nombres.has(n)) ctx.addIssue({ code: "custom", path: [i, "nombre"], message: `«${b.nombre.trim()}» está dos veces: ponle otro nombre a uno de los bloques.` });
      nombres.add(n);
      const vistas = new Set<string>();
      b.especies.forEach((e, j) => {
        const k = claveEspecie(e.speciesCommon);
        if (vistas.has(k)) ctx.addIssue({ code: "custom", path: [i, "especies", j, "speciesCommon"], message: `${e.speciesCommon.trim()} está dos veces en «${b.nombre.trim()}»: deja una sola fila por especie en cada bloque.` });
        vistas.add(k);
      });
    });
  });

export type EspecieDelBloque = z.infer<typeof especieDelBloqueSchema>;
export type BloqueDelPlan = z.infer<typeof bloqueDelPlanSchema>;

/** La especie del plan que sale de sumar todos los bloques: la misma forma que manda el alta. */
export interface EspecieJuntada {
  speciesCommon: string;
  speciesScientific: string | null;
  cites: boolean;
  volumenAutorizadoM3: number;
  arbolesAutorizados: number | null;
  anioInstalacion: number | null;
  superficieHa: number | null;
  precioVentaSoles: number | null;
  /** En cuántos bloques está. */
  bloques: number;
}

/** Suma lo que tiene cifra; si NINGUNO la tiene, `null` (no 0: «sin dato» no es «cero»). */
function sumaONull(valores: readonly (number | null)[], redondeo: (n: number) => number): number | null {
  const con = valores.filter((v): v is number => v != null);
  return con.length === 0 ? null : redondeo(con.reduce((a, v) => a + v, 0));
}

/**
 * Una especie por nombre (`claveEspecie`: «Bolaina» y «bolaina » son la misma),
 * en el orden en que aparece por primera vez:
 *  · m³, árboles y hectáreas se suman;
 *  · el año de instalación es el más antiguo (el registro dice desde cuándo está);
 *  · CITES si lo es en algún bloque; el científico, el primero escrito;
 *  · el precio, promedio pesado por los m³ de los bloques que lo tienen.
 */
export function juntarPorEspecie(bloques: readonly BloqueDelPlan[]): EspecieJuntada[] {
  const grupos = new Map<string, EspecieDelBloque[]>();
  for (const b of bloques) {
    for (const e of b.especies) {
      const k = claveEspecie(e.speciesCommon);
      if (!k) continue;
      grupos.set(k, [...(grupos.get(k) ?? []), e]);
    }
  }
  return [...grupos.values()].map((filas) => {
    const primera = filas[0]!;
    const conPrecio = filas.filter((e) => e.precioVentaSoles != null);
    const m3ConPrecio = conPrecio.reduce((a, e) => a + e.volumenM3, 0);
    const anios = filas.map((e) => e.anioInstalacion).filter((a): a is number => a != null);
    return {
      speciesCommon: primera.speciesCommon.trim(),
      speciesScientific: filas.find((e) => e.speciesScientific?.trim())?.speciesScientific?.trim() ?? null,
      cites: filas.some((e) => e.cites),
      volumenAutorizadoM3: r4(filas.reduce((a, e) => a + e.volumenM3, 0)),
      arbolesAutorizados: sumaONull(filas.map((e) => e.arboles), Math.round),
      anioInstalacion: anios.length > 0 ? Math.min(...anios) : null,
      superficieHa: sumaONull(filas.map((e) => e.superficieHa), r4),
      precioVentaSoles:
        conPrecio.length === 0 || m3ConPrecio <= 0
          ? null
          : r2(conPrecio.reduce((a, e) => a + (e.precioVentaSoles ?? 0) * e.volumenM3, 0) / m3ConPrecio),
      bloques: filas.length,
    };
  });
}

export interface SubtotalDelBloque {
  especies: number;
  m3: number;
  arboles: number | null;
  ha: number | null;
}

/** Lo que suma un bloque: se ve en su tarjeta, al lado del nombre. */
export function subtotalDelBloque(b: Pick<BloqueDelPlan, "especies">): SubtotalDelBloque {
  return {
    especies: b.especies.length,
    m3: r4(b.especies.reduce((a, e) => a + e.volumenM3, 0)),
    arboles: sumaONull(b.especies.map((e) => e.arboles), Math.round),
    ha: sumaONull(b.especies.map((e) => e.superficieHa), r4),
  };
}

/** Una especie registrada en el plan, como la lee la pestaña Registro (los Decimal llegan en texto). */
export interface EspecieRegistradaParaCuadre {
  speciesCommon: string;
  volumenAutorizadoM3: number | string | null;
  arbolesAutorizados: number | null;
}

export interface DescuadreDeEspecie {
  especie: string;
  /** Σ de los bloques; 0 si no está en ningún bloque. */
  enBloques: number;
  /** Lo registrado en el plan; `null` si la especie está en los bloques pero no en el registro. */
  registrado: number | null;
  /** enBloques − registrado (m³). */
  diferenciaM3: number;
  arbolesEnBloques: number | null;
  arbolesRegistrados: number | null;
}

/**
 * Las especies donde el reparto por bloque y el registro NO dicen lo mismo
 * (en m³, con la tolerancia del último decimal; o en árboles, si los dos los
 * tienen). Sin bloques no hay nada que cuadrar: lista vacía.
 */
export function cuadreConElRegistro(
  bloques: readonly BloqueDelPlan[],
  registradas: readonly EspecieRegistradaParaCuadre[],
): DescuadreDeEspecie[] {
  if (bloques.length === 0) return [];
  const juntas = new Map(juntarPorEspecie(bloques).map((e) => [claveEspecie(e.speciesCommon), e]));
  const reg = new Map(registradas.map((s) => [claveEspecie(s.speciesCommon), s]));
  const claves = [...new Set([...juntas.keys(), ...reg.keys()])].filter(Boolean);
  const salida: DescuadreDeEspecie[] = [];
  for (const k of claves) {
    const j = juntas.get(k);
    const r = reg.get(k);
    const enBloques = j?.volumenAutorizadoM3 ?? 0;
    const registradoNum = r ? Number(r.volumenAutorizadoM3 ?? 0) : null;
    const registrado = registradoNum != null && Number.isFinite(registradoNum) ? registradoNum : null;
    const diferenciaM3 = r4(enBloques - (registrado ?? 0));
    const arbolesEnBloques = j?.arbolesAutorizados ?? null;
    const arbolesRegistrados = r?.arbolesAutorizados ?? null;
    const difArboles = arbolesEnBloques != null && arbolesRegistrados != null && arbolesEnBloques !== arbolesRegistrados;
    if (Math.abs(diferenciaM3) > TOLERANCIA_M3 || registrado == null || difArboles) {
      salida.push({
        especie: j?.speciesCommon ?? r?.speciesCommon.trim() ?? k,
        enBloques,
        registrado,
        diferenciaM3,
        arbolesEnBloques,
        arbolesRegistrados,
      });
    }
  }
  return salida;
}
