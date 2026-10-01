/**
 * La placa del tocón (RDE 264-2019, sección 1, ítem 3): el código del árbol
 * marcado en el fuste y en el tocón. La foto la lee un modelo de visión
 * (`/api/admin/forestal/loth/placa-ocr`); acá se decide qué hacer con lo leído.
 *
 * Regla: el sistema elige el árbol SOLO cuando lo leído es inequívoco —un único
 * árbol del censo, en pie, sin reparos y leído con confianza—. En cualquier
 * otro caso lo muestra y la persona confirma o corrige. Un código dudoso que
 * elige solo termina en la línea de otro árbol, y eso se declara ante OSINFOR.
 *
 * Puro: lo usan la ruta (para limpiar la lectura) y la pantalla (para cruzar).
 */

import type { ArbolParaElegir } from "./loth-censo-uso";

/** Por debajo de esto la lectura se muestra para confirmar, nunca se elige sola. */
export const CONFIANZA_MINIMA = 0.8;

/** Lo que devuelve el lector, ya limpio. `confianza` va de 0 a 1. */
export interface LecturaPlaca {
  codigo: string;
  confianza: number;
  /** Lo que el lector vio dudoso («el último dígito está tapado»). */
  nota: string;
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Rótulos que acompañan al número en la placa y no son parte del código:
 * «N° 114», «Nro. 114», «Árbol 114», «Cód. 85-TOR», «#114».
 */
const ROTULO = /^(?:ARBOL|COD(?:IGO)?|N(?:RO|UM(?:ERO)?)?\s*[°º.:]+|N(?:RO|UM(?:ERO)?)\b|#)\s*[:.\-]?\s*/;

/**
 * La lectura del modelo, lista para mostrar: sin rótulo, sin caracteres raros
 * y con un tope de largo. Una lectura sin ningún dígito («ilegible», «N/A»)
 * sale vacía: todos los códigos del censo llevan número.
 */
export function limpiarCodigoLeido(texto: string): string {
  const t = sinTildes(String(texto ?? "")).toUpperCase().trim().replace(ROTULO, "");
  const limpio = t
    .replace(/[^A-Z0-9 \-_./]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
  return /\d/.test(limpio) ? limpio : "";
}

/**
 * La clave con la que se compara un código: mayúsculas, sin tildes, cualquier
 * separador (espacio, punto, barra) como guion, letra y número separados y sin
 * ceros a la izquierda. «0114» = «114», «85 tor» = «85TOR» = «85-TOR»,
 * «001-TOR» = «1-TOR». Nunca se muestra: sólo compara.
 */
export function claveDeCodigo(codigo: string): string {
  const t = sinTildes(String(codigo ?? "")).toUpperCase().replace(ROTULO, "");
  return t
    .replace(/([0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([0-9])/g, "$1-$2")
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)
    .map((seg) => (/^\d+$/.test(seg) ? seg.replace(/^0+(?=\d)/, "") : seg))
    .join("-");
}

interface Partes {
  numero: string | null;
  letras: string[];
}

/** Un código con UN número y el resto letras («114», «85-TOR», «TOR-85»). */
function partes(clave: string): Partes {
  const segs = clave.split("-").filter(Boolean);
  const nums = segs.filter((s) => /^\d+$/.test(s));
  const letras = segs.filter((s) => /^[A-Z]+$/.test(s));
  if (nums.length !== 1 || nums.length + letras.length !== segs.length) return { numero: null, letras: [] };
  return { numero: nums[0], letras };
}

/** «LUP» es la abreviatura de «Lupuna»; «TOR», de «Tornillo». Mínimo 2 letras. */
function esDeLaEspecie(letras: readonly string[], a: Pick<ArbolParaElegir, "speciesCommon" | "speciesScientific">): boolean {
  if (letras.length !== 1 || letras[0].length < 2) return false;
  const abrev = letras[0].toLowerCase();
  const nombres = [a.speciesCommon, a.speciesScientific ?? ""]
    .map((n) => sinTildes(n).toLowerCase())
    .flatMap((n) => [n.replace(/[^a-z]/g, ""), ...n.split(/[^a-z]+/)])
    .filter(Boolean);
  return nombres.some((n) => n.startsWith(abrev));
}

const mismasLetras = (x: readonly string[], y: readonly string[]) =>
  x.length === y.length && [...x].sort().join("-") === [...y].sort().join("-");

/**
 * Mismo número y la parte de letras no se contradice: una de las dos es la
 * abreviatura de la especie del árbol, o las dos dicen lo mismo en otro orden.
 */
function coincidePorNumero(placa: Partes, a: ArbolParaElegir): "fuerte" | "debil" | null {
  const censo = partes(claveDeCodigo(a.treeCode));
  if (!placa.numero || censo.numero !== placa.numero) return null;
  if (placa.letras.length === 0) return esDeLaEspecie(censo.letras, a) ? "fuerte" : "debil";
  if (censo.letras.length === 0) return esDeLaEspecie(placa.letras, a) ? "fuerte" : "debil";
  return mismasLetras(placa.letras, censo.letras) ? "fuerte" : "debil";
}

export type MotivoConfirmar =
  /** El lector no está seguro de lo que leyó. */
  | "confianza"
  /** Más de un árbol del censo encaja con lo leído. */
  | "varios"
  /** El número está en el censo, pero las letras dicen otra especie. */
  | "letras"
  /** El árbol pide confirmar antes de tumbarlo (semillero, bajo DMC…). */
  | "reparo";

export type CrucePlaca =
  | { tipo: "ilegible" }
  | { tipo: "elegido"; arbol: ArbolParaElegir; como: "igual" | "numero" }
  | { tipo: "confirmar"; motivo: MotivoConfirmar; candidatos: ArbolParaElegir[] }
  | { tipo: "no_disponible"; arbol: ArbolParaElegir }
  | { tipo: "sin_censo" };

/**
 * Qué árbol del censo es el de la placa.
 *
 * 1. Mismo código (con la clave de arriba) → ese árbol.
 * 2. Si no, mismo número con letras que no se contradicen («114-LUP» con el
 *    114 que es Lupuna; «85» con el 85-TOR) → ese árbol, si es uno solo.
 * 3. Elegido sólo si está disponible, sin reparo y leído con confianza.
 */
export function cruzarPlacaConCenso(lectura: Pick<LecturaPlaca, "codigo" | "confianza">, arboles: readonly ArbolParaElegir[]): CrucePlaca {
  const clave = claveDeCodigo(lectura.codigo);
  if (!clave || !/\d/.test(clave)) return { tipo: "ilegible" };

  const iguales = arboles.filter((a) => claveDeCodigo(a.treeCode) === clave);
  let arbol: ArbolParaElegir | null = null;
  let como: "igual" | "numero" = "igual";

  if (iguales.length > 1) return { tipo: "confirmar", motivo: "varios", candidatos: iguales };
  if (iguales.length === 1) {
    arbol = iguales[0];
  } else {
    const placa = partes(clave);
    const fuertes: ArbolParaElegir[] = [];
    const debiles: ArbolParaElegir[] = [];
    for (const a of arboles) {
      const c = coincidePorNumero(placa, a);
      if (c === "fuerte") fuertes.push(a);
      else if (c === "debil") debiles.push(a);
    }
    if (fuertes.length === 0) {
      return debiles.length > 0 ? { tipo: "confirmar", motivo: "letras", candidatos: debiles } : { tipo: "sin_censo" };
    }
    /* Otro árbol con el mismo número (aunque sus letras no sean de especie)
       ya lo vuelve dudoso: la placa pudo perder el prefijo. */
    if (fuertes.length + debiles.length > 1) return { tipo: "confirmar", motivo: "varios", candidatos: [...fuertes, ...debiles] };
    arbol = fuertes[0];
    como = "numero";
  }

  if (arbol.disponibilidad !== "disponible") return { tipo: "no_disponible", arbol };
  if (!(lectura.confianza >= CONFIANZA_MINIMA)) return { tipo: "confirmar", motivo: "confianza", candidatos: [arbol] };
  if (arbol.reparo) return { tipo: "confirmar", motivo: "reparo", candidatos: [arbol] };
  return { tipo: "elegido", arbol, como };
}

/** «93 %» — la confianza como la lee una persona. */
export function porcentajeConfianza(confianza: number): string {
  const c = Number.isFinite(confianza) ? Math.min(1, Math.max(0, confianza)) : 0;
  return `${Math.round(c * 100)} %`;
}
