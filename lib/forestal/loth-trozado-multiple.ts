/**
 * «Trozar un árbol» (todas las trozas de un fuste en una pantalla), en puro:
 * los renglones con la MISMA medición del Trozado de a una —«D1 y D2
 * promediados» o «Varias medidas por Ø», la forma fijada en el equipo—, los
 * códigos que siguen a lo ya asentado y lo que queda del árbol con TODAS las
 * trozas nuevas (Brandon 28-09: «Trozado múltiple igual»).
 *
 * Antes el modal numeraba A, B, C… sin mirar el libro: un árbol con A-D ya
 * trozadas proponía otra vez A y B (T3 las rechazaba al asentar), y el total
 * se comparaba contra lo talado SIN las trozas asentadas.
 */

import {
  cambiarForma,
  derivarTala,
  medicionCrudaDe,
  medidasVacias,
  type FormaMedicion,
  type MedicionCruda,
  type MedidasTala,
} from "./loth-forma-medicion";
import { restanteTrozado, siguienteCodigoDeTroza, type ArbolEnElLibro, type RestanteTrozado, type TrozaDelArbol } from "./loth-restante";

export interface RenglonTroza {
  /** Clave estable del renglón (no la posición: se puede quitar uno del medio). */
  id: number;
  medidas: MedidasTala;
  isRama: boolean;
}

export const renglonVacio = (id: number): RenglonTroza => ({ id, medidas: medidasVacias(), isRama: false });

/** Una celda del renglón: qué se lee y qué se escribe en las medidas. */
export interface CampoDeRenglon {
  clave: string;
  /** Rótulo corto (celular) y parte del nombre accesible. */
  corto: string;
  /** La cabecera de la columna; consecutivas iguales se agrupan (Ø mayor 1-2). */
  grupo: string;
  placeholder: string;
  leer: (m: MedidasTala) => string;
  escribir: (m: MedidasTala, v: string) => MedidasTala;
}

const deArreglo = (seccion: "mayor" | "menor", i: number): Pick<CampoDeRenglon, "leer" | "escribir"> => ({
  leer: (m) => m[seccion][i] ?? "",
  escribir: (m, v) => {
    const arr = [...m[seccion]];
    while (arr.length <= i) arr.push("");
    arr[i] = v;
    return { ...m, [seccion]: arr };
  },
});

const LARGO: CampoDeRenglon = {
  clave: "largo",
  corto: "Largo",
  grupo: "Largo (m)",
  placeholder: "3.00",
  leer: (m) => m.totalM,
  escribir: (m, v) => ({ ...m, totalM: v }),
};

/**
 * Las celdas de un renglón en cada forma. «Varias medidas» lleva DOS por
 * sección (lo que pide la RDE 264-2019, items 6 y 7): un renglón de planilla
 * no crece como la caja del Trozado de a una.
 */
export function camposDeRenglon(forma: FormaMedicion): CampoDeRenglon[] {
  if (forma === "promedio") {
    return [
      { clave: "d1", corto: "D1 · Ø mayor", grupo: "D1 · Ø mayor (m)", placeholder: "0.60", leer: (m) => m.d1, escribir: (m, v) => ({ ...m, d1: v }) },
      { clave: "d2", corto: "D2 · Ø menor", grupo: "D2 · Ø menor (m)", placeholder: "0.50", leer: (m) => m.d2, escribir: (m, v) => ({ ...m, d2: v }) },
      LARGO,
    ];
  }
  return [
    { clave: "mayor-0", corto: "Ø mayor 1", grupo: "Ø mayor (m)", placeholder: "0.62", ...deArreglo("mayor", 0) },
    { clave: "mayor-1", corto: "Ø mayor 2", grupo: "Ø mayor (m)", placeholder: "0.58", ...deArreglo("mayor", 1) },
    { clave: "menor-0", corto: "Ø menor 1", grupo: "Ø menor (m)", placeholder: "0.52", ...deArreglo("menor", 0) },
    { clave: "menor-1", corto: "Ø menor 2", grupo: "Ø menor (m)", placeholder: "0.48", ...deArreglo("menor", 1) },
    LARGO,
  ];
}

/** Cambiar de forma sin perder lo tipeado, en todos los renglones (`cambiarForma`). */
export function renglonesEnForma(renglones: readonly RenglonTroza[], forma: FormaMedicion): RenglonTroza[] {
  return renglones.map((r) => ({ ...r, medidas: cambiarForma(r.medidas, forma) }));
}

/**
 * Los `n` códigos que siguen a lo asentado: A-D en el libro → E, F, G. Si el
 * árbol se troza con números (111-1, 111-2), siguen los números.
 */
export function codigosLibres(treeCode: string, asentadas: readonly TrozaDelArbol[], n: number): string[] {
  const usados: TrozaDelArbol[] = [...asentadas];
  const codigos: string[] = [];
  for (let i = 0; i < n; i++) {
    const c = siguienteCodigoDeTroza(treeCode, usados);
    codigos.push(c);
    usados.push({ id: `nueva-${i}`, lineNo: 0, trozaCode: c, volumeM3: null });
  }
  return codigos;
}

export interface RenglonCalculado extends RenglonTroza {
  codigo: string;
  diamMayorM: number | null;
  diamMenorM: number | null;
  lengthM: number | null;
  volumenM3: number | null;
  /** Tiene volumen: se asienta. */
  completo: boolean;
  /** Se tipeó algo pero no alcanza para el volumen: NO se asienta (se avisa). */
  aMedias: boolean;
}

export function calcularRenglones(
  renglones: readonly RenglonTroza[],
  forma: FormaMedicion,
  treeCode: string,
  asentadas: readonly TrozaDelArbol[],
): RenglonCalculado[] {
  const codigos = codigosLibres(treeCode, asentadas, renglones.length);
  const campos = camposDeRenglon(forma);
  return renglones.map((r, i) => {
    const d = derivarTala(r.medidas, forma);
    const completo = d.volumenM3 != null && d.volumenM3 > 0;
    const tipeado = campos.some((c) => c.leer(r.medidas).trim() !== "");
    return {
      ...r,
      codigo: codigos[i],
      diamMayorM: d.diamMayorM,
      diamMenorM: d.diamMenorM,
      lengthM: d.longitudM,
      volumenM3: d.volumenM3,
      completo,
      aMedias: tipeado && !completo,
    };
  });
}

export interface RestanteDeLote extends RestanteTrozado {
  /** Lo que el libro ya tiene trozado de este árbol. */
  asentadoM3: number;
  asentadas: number;
  /** Lo que suman los renglones con volumen. */
  nuevasM3: number;
  nuevas: number;
}

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

/**
 * Lo talado − lo asentado − TODAS las trozas nuevas. Pasa por
 * `restanteTrozado`: la misma comparación a 4 decimales que T4 al guardar.
 */
export function restanteDeLote(
  arbol: ArbolEnElLibro,
  lote: readonly { trozaCode: string; volumeM3: number | null }[],
): RestanteDeLote {
  const conVolumen = lote.filter((t) => t.volumeM3 != null && t.volumeM3 > 0);
  const juntas: TrozaDelArbol[] = [
    ...arbol.trozas,
    ...conVolumen.map((t, i) => ({ id: `lote-${i}`, lineNo: 0, trozaCode: t.trozaCode, volumeM3: t.volumeM3 })),
  ];
  const base = restanteTrozado({ ...arbol, trozas: juntas }, null);
  const repetida = lote.map((t) => arbol.trozas.find((a) => a.trozaCode === t.trozaCode.trim()) ?? null).find(Boolean) ?? null;
  return {
    ...base,
    repetida,
    asentadoM3: r4(arbol.trozas.reduce((s, t) => s + (t.volumeM3 ?? 0), 0)),
    asentadas: arbol.trozas.length,
    nuevasM3: r4(conVolumen.reduce((s, t) => s + (t.volumeM3 ?? 0), 0)),
    nuevas: conVolumen.length,
  };
}

export interface TrozaParaAsentar {
  trozaCode: string;
  diamMayorM: number;
  diamMenorM: number;
  lengthM: number;
  volumeM3: number;
  isRama: boolean;
  /** De dónde salió el Ø (ADR-422), como en el Trozado de a una. */
  medicionCruda: MedicionCruda | null;
}

/** Sólo los renglones con volumen, con el código de su árbol. */
export function trozasParaAsentar(calculadas: readonly RenglonCalculado[], forma: FormaMedicion): TrozaParaAsentar[] {
  return calculadas.flatMap((r) => {
    const { diamMayorM, diamMenorM, lengthM, volumenM3 } = r;
    if (!r.completo || diamMayorM == null || diamMenorM == null || lengthM == null || volumenM3 == null) return [];
    return [
      {
        trozaCode: r.codigo,
        diamMayorM,
        diamMenorM,
        lengthM,
        volumeM3: volumenM3,
        isRama: r.isRama,
        medicionCruda: medicionCrudaDe(r.medidas, forma),
      },
    ];
  });
}
