/**
 * Cuentas puras del censo en pantalla: el orden de la tabla, lo que el alta
 * completa sola y cómo se leen los números que se tipean.
 *
 * Sin React a propósito: el formulario («Agregar árbol al censo») y la tabla
 * lo importan, y un test lo prueba sin montar el modal.
 */

import { findSpeciesByCommonName } from "@/data/forestry-species";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { censusVol, type Tree } from "./loth-plan-shared";

/**
 * Un árbol del censo con lo que la hoja del regente trae y `Tree` todavía no
 * nombra: el nombre en idioma nativo, la condición que declara el censo y la
 * observación. El GET del censo ya los devuelve.
 */
export type ArbolCenso = Tree & {
  speciesNative?: string | null;
  condicion?: string | null;
  notes?: string | null;
};

/** La especie tal como la declara el plan (sólo lo que hace falta acá). */
export interface EspeciePlanCenso {
  speciesCommon: string;
  speciesScientific: string | null;
}

/** Condiciones que anota el regente en el censo. Se suman las que ya usa el censo. */
export const CONDICIONES_BASE = ["Aprovechable", "Semillero", "Remanente"] as const;

const ORDEN_CODIGO = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

/**
 * Por código NATURAL: «2» antes que «13». El servidor ordena como texto y en
 * la hoja del regente, que numera los árboles, el 13 salía antes que el 2.
 */
export function ordenarPorCodigo<T extends { treeCode: string }>(arboles: readonly T[]): T[] {
  return [...arboles].sort((a, b) => ORDEN_CODIGO.compare(a.treeCode, b.treeCode));
}

/**
 * Un decimal tipeado a la peruana o a la de Excel: «1,15» y «1.15» son lo
 * mismo. Vacío = `null`; algo que no es número = `NaN` (el campo lo marca).
 */
export function leerDecimal(texto: string): number | null {
  const t = texto.trim().replace(/\s+/g, "");
  if (!t) return null;
  const normal = t.includes(".") ? t.replace(/,/g, "") : t.replace(",", ".");
  const v = Number(normal);
  return Number.isFinite(v) ? v : Number.NaN;
}

/**
 * Una coordenada UTM en metros: «521922», «521 922» o «8.918.151». El punto o
 * la coma seguidos de exactamente tres cifras son de miles, no decimales.
 */
export function leerCoordenada(texto: string): number | null {
  const t = texto.trim().replace(/\s+/g, "");
  if (!t) return null;
  return leerDecimal(t.replace(/[.,](?=\d{3}(?:\D|$))/g, ""));
}

/** El error de una coordenada, con el mismo criterio que el importador. */
export function errorCoordenadas(este: number | null, norte: number | null): string | null {
  if (este != null && Number.isNaN(este)) return "El Este no es un número.";
  if (norte != null && Number.isNaN(norte)) return "El Norte no es un número.";
  if ((este == null) !== (norte == null)) return "Coordenada incompleta: falta el Este o el Norte.";
  if (este != null && (este < 100_000 || este > 999_999)) return `Este ${este} fuera del rango UTM (6 cifras).`;
  if (norte != null && (norte <= 0 || norte > 10_000_000)) return `Norte ${norte} fuera del rango UTM (7 cifras).`;
  return null;
}

/** Lo que el alta completa sola al elegir la especie. */
export interface SugerenciaEspecie {
  cientifico: string | null;
  nativo: string | null;
}

/**
 * Científico: el del plan manda (es el de la resolución); si el plan no lo
 * tiene, el de otro árbol del censo de la misma especie; si tampoco, el del
 * catálogo. Nativo: el de otro árbol del censo de la misma especie (el plan
 * no lo guarda).
 */
export function sugerirPorEspecie(
  especie: string,
  especiesPlan: readonly EspeciePlanCenso[],
  arboles: readonly ArbolCenso[],
): SugerenciaEspecie {
  const clave = claveEspecie(especie);
  if (!clave) return { cientifico: null, nativo: null };
  const mismos = arboles.filter((a) => claveEspecie(a.speciesCommon) === clave);
  const delPlan = especiesPlan.find((s) => claveEspecie(s.speciesCommon) === clave)?.speciesScientific?.trim();
  const delCenso = masRepetido(mismos.map((a) => a.speciesScientific));
  const delCatalogo = findSpeciesByCommonName(especie)?.scientificName ?? null;
  return {
    cientifico: delPlan || delCenso || delCatalogo,
    nativo: masRepetido(mismos.map((a) => a.speciesNative)),
  };
}

/** El valor no vacío que más se repite (empate: el primero que apareció). */
export function masRepetido(valores: readonly (string | null | undefined)[]): string | null {
  const cuenta = new Map<string, { valor: string; n: number }>();
  for (const v of valores) {
    const t = v?.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    const previo = cuenta.get(k);
    if (previo) previo.n += 1;
    else cuenta.set(k, { valor: t, n: 1 });
  }
  let mejor: { valor: string; n: number } | null = null;
  for (const c of cuenta.values()) if (!mejor || c.n > mejor.n) mejor = c;
  return mejor?.valor ?? null;
}

/** Nombres para el desplegable de especie: los del plan primero, después los del censo. */
export function especiesParaElegir(especiesPlan: readonly EspeciePlanCenso[], arboles: readonly ArbolCenso[]): string[] {
  const vistas = new Map<string, string>();
  for (const n of [...especiesPlan.map((s) => s.speciesCommon), ...arboles.map((a) => a.speciesCommon)]) {
    const k = claveEspecie(n);
    if (k && !vistas.has(k)) vistas.set(k, n.trim());
  }
  return [...vistas.values()];
}

/** Condiciones para el desplegable: las de siempre y las que ya usa este censo. */
export function condicionesParaElegir(arboles: readonly ArbolCenso[]): string[] {
  const vistas = new Map<string, string>();
  for (const c of [...CONDICIONES_BASE, ...arboles.map((a) => a.condicion ?? "")]) {
    const t = c.trim();
    if (t && !vistas.has(t.toLowerCase())) vistas.set(t.toLowerCase(), t);
  }
  return [...vistas.values()];
}

/**
 * Reemplaza un campo que se autocompleta SÓLO si nadie lo escribió: vacío, o
 * todavía con lo que puso la sugerencia anterior.
 */
export function completarSinPisar(actual: string, sugeridoAntes: string | null, nuevo: string | null): string {
  const libre = actual.trim() === "" || (sugeridoAntes != null && actual === sugeridoAntes);
  return libre ? (nuevo ?? "") : actual;
}

// ─── El alta de un árbol ───────────────────────────────────────────────────

/** Lo que se tipea en «Agregar árbol al censo»: texto crudo, se lee al revisar. */
export interface BorradorArbol {
  treeCode: string;
  speciesCommon: string;
  speciesScientific: string;
  speciesNative: string;
  dapM: string;
  alturaComercialM: string;
  factorForma: string;
  /** Vacío = se calcula (el servidor usa la misma cuenta). */
  volumen: string;
  utmX: string;
  utmY: string;
  utmZona: string;
  condicion: string;
  notes: string;
}

export const BORRADOR_VACIO: BorradorArbol = {
  treeCode: "", speciesCommon: "", speciesScientific: "", speciesNative: "",
  dapM: "", alturaComercialM: "", factorForma: "0.65", volumen: "",
  utmX: "", utmY: "", utmZona: "18L", condicion: "", notes: "",
};

/**
 * Después de agregar con «y otro»: se borra lo que es de ESE árbol y se queda
 * lo que suele repetirse en la fila siguiente (especie, factor, zona, condición).
 */
export function borradorSiguiente(b: BorradorArbol): BorradorArbol {
  return { ...b, treeCode: "", dapM: "", alturaComercialM: "", volumen: "", utmX: "", utmY: "", notes: "" };
}

export interface RevisionArbol {
  dap: number | null;
  altura: number | null;
  ff: number;
  /** El que se escribió (manda) o `null` si se deja calcular. */
  volumenEscrito: number | null;
  volumenCalculado: number;
  este: number | null;
  norte: number | null;
  /** Bloquean «Agregar». */
  errores: string[];
  /** Se guarda igual, pero conviene mirarlo. */
  avisos: string[];
  /** Campos que se pintan en rojo. */
  invalidos: Set<keyof BorradorArbol>;
  /** Los obligatorios vacíos, por su rótulo. */
  faltan: string[];
}

/**
 * Lee y revisa el borrador con los mismos criterios que el importador: lo que
 * una fila del Excel no deja pasar, el alta a mano tampoco. El tope del DAP
 * (con su sugerencia de un clic) se revisa aparte, en el formulario.
 */
export function revisarArbol(
  b: BorradorArbol,
  ctx: { codigos: ReadonlySet<string> },
): RevisionArbol {
  const errores: string[] = [];
  const avisos: string[] = [];
  const invalidos = new Set<keyof BorradorArbol>();
  const faltan: string[] = [];
  const numero = (k: keyof BorradorArbol, leer: (s: string) => number | null, rotulo: string) => {
    const v = leer(b[k]);
    if (v != null && Number.isNaN(v)) {
      invalidos.add(k);
      errores.push(`${rotulo}: «${b[k]}» no es un número.`);
      return null;
    }
    return v;
  };

  if (!b.treeCode.trim()) faltan.push("Código");
  if (!b.speciesCommon.trim()) faltan.push("N. común");
  if (b.treeCode.trim() && ctx.codigos.has(b.treeCode.trim().toLowerCase())) {
    invalidos.add("treeCode");
    errores.push(`El código ${b.treeCode.trim()} ya está en el censo de este plan.`);
  }

  const dap = numero("dapM", leerDecimal, "DAP");
  if (dap != null && dap <= 0) {
    invalidos.add("dapM");
    errores.push("El DAP tiene que ser mayor que 0.");
  }
  const altura = numero("alturaComercialM", leerDecimal, "Altura");
  if (altura != null && (altura <= 0 || altura > 80)) {
    invalidos.add("alturaComercialM");
    errores.push(`Altura comercial de ${altura} m fuera de rango.`);
  }
  const ffLeido = numero("factorForma", leerDecimal, "Factor de forma");
  if (ffLeido != null && (ffLeido <= 0 || ffLeido > 1)) {
    invalidos.add("factorForma");
    errores.push("El factor de forma va entre 0 y 1 (0.65 por defecto).");
  }
  const ff = ffLeido != null && ffLeido > 0 && ffLeido <= 1 ? ffLeido : 0.65;

  const volumenCalculado = dap && altura ? censusVol(dap, altura, ff) : 0;
  const volumenEscrito = numero("volumen", leerDecimal, "Volumen");
  if (volumenEscrito != null && volumenEscrito < 0) {
    invalidos.add("volumen");
    errores.push("El volumen no puede ser negativo.");
  } else if (volumenEscrito != null && dap && altura && dap <= 5) {
    // Misma tolerancia de campo que el importador: un factor implícito fuera
    // de 0,4–0,9 no sale de redondear, es un dato que no cuadra.
    const ffImplicito = volumenEscrito / (0.7854 * dap * dap * altura);
    if (ffImplicito < 0.4 || ffImplicito > 0.9) {
      avisos.push(`El volumen escrito (${volumenEscrito} m³) no cuadra con el DAP y la altura: con ellos saldría ${volumenCalculado} m³.`);
    }
  }

  const este = numero("utmX", leerCoordenada, "Este");
  const norte = numero("utmY", leerCoordenada, "Norte");
  // Un campo que no es número ya tiene su error: acá sólo lo que se lee bien.
  const errUtm = invalidos.has("utmX") || invalidos.has("utmY") ? null : errorCoordenadas(este, norte);
  if (errUtm) {
    const esteMal = este == null || este < 100_000 || este > 999_999;
    const norteMal = norte == null || norte <= 0 || norte > 10_000_000;
    if (esteMal) invalidos.add("utmX");
    if (norteMal) invalidos.add("utmY");
    errores.push(errUtm);
  }

  return { dap, altura, ff, volumenEscrito, volumenCalculado, este, norte, errores, avisos, invalidos, faltan };
}
