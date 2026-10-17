/**
 * Código de barras de una etiqueta de precio: EAN-13 o Code 128, sin librerías.
 *
 * Para qué: la etiqueta de la góndola tiene que pasar por la misma pistola que
 * la caja. Si el producto trae su EAN-13 de fábrica (el «775…» de los productos
 * peruanos) se imprime ese, idéntico al del envase; si el código es otro
 * (interno, alfanumérico, de 8 o 12 dígitos) va en Code 128, que la pistola
 * devuelve tal cual está guardado.
 *
 * PURO: devuelve la secuencia de módulos (1 = barra, 0 = espacio). Lo dibujan
 * el PDF (`precio-pdf.ts`) y la vista previa (SVG) con la misma secuencia.
 *
 * Code 128: reusa la tabla de patrones del de las trozas (`lib/forestal/code128`)
 * y agrega el subconjunto C (dos dígitos por símbolo): un código numérico de
 * 12 dígitos queda en 6 símbolos en vez de 12, y cabe legible en el rollo.
 */
import { CODE128_PATRONES, CODE128_START_B, CODE128_STOP, textoCode128 } from "@/lib/forestal/code128";

export type TipoCodigo = "ean13" | "code128";

export interface CodigoDeBarras {
  tipo: TipoCodigo;
  /** Lo que la pistola devuelve al leerlo (y lo que va impreso debajo). */
  valor: string;
  /** Módulos SIN zona muda: «1» barra, «0» espacio. */
  modulos: string;
  /** Zona muda que pide la norma a cada lado, en módulos. */
  zonaMudaIzq: number;
  zonaMudaDer: number;
}

// ── EAN-13 ────────────────────────────────────────────────────────────────────

/** Código L (paridad impar) de cada dígito, ISO/IEC 15420. */
export const EAN_L: readonly string[] = [
  "0001101", "0011001", "0010011", "0111101", "0100011",
  "0110001", "0101111", "0111011", "0110111", "0001011",
];
/** Código R = complemento de L. */
export const EAN_R: readonly string[] = EAN_L.map((l) => [...l].map((b) => (b === "1" ? "0" : "1")).join(""));
/** Código G = R al revés. */
export const EAN_G: readonly string[] = EAN_R.map((r) => [...r].reverse().join(""));
/** Qué mitad izquierda va en L o G según el primer dígito (que no se dibuja: se deduce de esto). */
export const EAN_PARIDAD: readonly string[] = [
  "LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG",
  "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL",
];

/** Dígito verificador de los 12 primeros: pesos 1,3,1,3… desde la izquierda. */
export function digitoVerificadorEan13(doce: string): number {
  if (!/^\d{12}$/.test(doce)) throw new Error(`EAN-13 necesita 12 dígitos, llegó «${doce}»`);
  let suma = 0;
  for (let i = 0; i < 12; i++) suma += Number(doce[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (suma % 10)) % 10;
}

/** 13 dígitos con el verificador correcto. Un «775…» mal tipeado no pasa. */
export function esEan13Valido(codigo: string): boolean {
  return /^\d{13}$/.test(codigo) && digitoVerificadorEan13(codigo.slice(0, 12)) === Number(codigo[12]);
}

/** Los 95 módulos de un EAN-13 válido (guardas incluidas). */
export function modulosEan13(codigo: string): string {
  if (!esEan13Valido(codigo)) throw new Error(`EAN-13 inválido: «${codigo}»`);
  const paridad = EAN_PARIDAD[Number(codigo[0])]!;
  let bits = "101";
  for (let i = 1; i <= 6; i++) {
    const d = Number(codigo[i]);
    bits += paridad[i - 1] === "L" ? EAN_L[d] : EAN_G[d];
  }
  bits += "01010";
  for (let i = 7; i <= 12; i++) bits += EAN_R[Number(codigo[i])];
  return bits + "101";
}

/** Las barras de guarda (inicio, centro, fin) bajan más que las de datos. */
export function esGuardaEan13(modulo: number): boolean {
  return modulo < 3 || (modulo >= 45 && modulo < 50) || modulo >= 92;
}

// ── Code 128 (subconjuntos B y C) ─────────────────────────────────────────────

export const CODE128_START_C = 105;
/** Dentro del subconjunto C, el símbolo que pasa al B. */
export const CODE128_CODE_B = 100;

/**
 * Valores de los símbolos (START y CHECKSUM incluidos, sin STOP). Sólo dígitos
 * y al menos 4 → subconjunto C por pares; si son impares, el último dígito va
 * tras un «CODE B». Lo demás, subconjunto B (ASCII imprimible).
 */
export function valoresCode128(texto: string): number[] {
  const limpio = textoCode128(texto);
  let valores: number[];
  if (/^\d{4,}$/.test(limpio)) {
    valores = [CODE128_START_C];
    const pares = limpio.length - (limpio.length % 2);
    for (let i = 0; i < pares; i += 2) valores.push(Number(limpio.slice(i, i + 2)));
    if (pares < limpio.length) valores.push(CODE128_CODE_B, limpio.charCodeAt(pares) - 32);
  } else {
    valores = [CODE128_START_B, ...[...limpio].map((c) => c.charCodeAt(0) - 32)];
  }
  // Checksum (ISO/IEC 15417): el START pesa 1 y cada símbolo de datos, su posición desde 1.
  const [start, ...datos] = valores;
  const checksum = ((start ?? 0) + datos.reduce((acc, v, i) => acc + v * (i + 1), 0)) % 103;
  return [...valores, checksum];
}

/** Módulos de un Code 128 SIN zona muda (el STOP lleva su barra final de 2). */
export function modulosCode128(texto: string): string {
  let bits = "";
  for (const v of [...valoresCode128(texto), CODE128_STOP]) {
    const patron = CODE128_PATRONES[v]!;
    for (let i = 0; i < patron.length; i++) bits += (i % 2 === 0 ? "1" : "0").repeat(Number(patron[i]));
  }
  return bits;
}

// ── Elegir ────────────────────────────────────────────────────────────────────

/** Largo máximo que se codifica: más que esto no entra legible en ninguna etiqueta. */
export const CODIGO_LARGO_MAX = 24;

/**
 * El código que va en la etiqueta. EAN-13 sólo si es válido (dígito verificador
 * incluido); cualquier otro texto, Code 128. `null` si no hay nada que codificar.
 */
export function codigoDeBarras(texto: string | null | undefined): CodigoDeBarras | null {
  const crudo = (texto ?? "").trim();
  if (!crudo) return null;
  if (esEan13Valido(crudo)) {
    return { tipo: "ean13", valor: crudo, modulos: modulosEan13(crudo), zonaMudaIzq: 11, zonaMudaDer: 7 };
  }
  const valor = textoCode128(crudo);
  if (!valor || valor.length > CODIGO_LARGO_MAX) return null;
  return { tipo: "code128", valor, modulos: modulosCode128(valor), zonaMudaIzq: 10, zonaMudaDer: 10 };
}

/** Ancho total del código en módulos, zonas mudas incluidas. */
export function modulosTotales(c: CodigoDeBarras): number {
  return c.modulos.length + c.zonaMudaIzq + c.zonaMudaDer;
}

/** Las barras como tramos [inicio, ancho] en módulos: lo que dibujan el PDF y el SVG. */
export function tramosDeBarras(modulos: string): Array<[number, number]> {
  const tramos: Array<[number, number]> = [];
  let i = 0;
  while (i < modulos.length) {
    if (modulos[i] !== "1") { i++; continue; }
    const inicio = i;
    while (modulos[i] === "1") i++;
    tramos.push([inicio, i - inicio]);
  }
  return tramos;
}

export { CODE128_START_B };
