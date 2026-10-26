/**
 * ¿El dato de una celda corresponde a su columna? (Brandon 26-10: «letra en
 * espesor, número en especie»). Función pura: la tabla para pegar pinta con
 * esto el rojo (número ilegible) y el ámbar (columna de texto con sólo números).
 * La lectura del número es la del cubicador (`numeroDeCelda`: coma decimal,
 * «2 1/2», comillas de pulgada), no otra.
 */
import { COLUMNAS_PEGAR, numeroDeCelda, type ColumnaPegar, type FilaPegar } from "@/lib/forestal/cubicacion-pegar";

export type TipoDato = "ok" | "vacio" | "error" | "aviso";
export interface LecturaTipo { tipo: TipoDato; motivo?: string }

export const COLUMNAS_NUMERICAS: ReadonlySet<ColumnaPegar> = new Set<ColumnaPegar>(["cantidad", "espesor", "ancho", "largo"]);
const COLUMNAS_DE_TEXTO_CON_AVISO: ReadonlySet<ColumnaPegar> = new Set<ColumnaPegar>(["especie", "dueno"]);
const NOMBRE: Record<ColumnaPegar, string> = {
  cantidad: "Cant.", espesor: "Espesor", ancho: "Ancho", largo: "Largo", especie: "Especie", dueno: "Dueño", observacion: "Observación",
};

/** Sólo cifras y separadores («12», «2.5», «1,5»): parece un número, no un nombre. */
const SOLO_NUMERO = /^[\d\s.,]*\d[\d\s.,]*$/;

export function clasificarCelda(col: ColumnaPegar, valor: string): LecturaTipo {
  const v = valor.trim();
  if (v === "") return { tipo: "vacio" };
  if (COLUMNAS_NUMERICAS.has(col)) {
    return numeroDeCelda(v) === null
      ? { tipo: "error", motivo: `${NOMBRE[col]} espera un número; dice «${v}»` }
      : { tipo: "ok" };
  }
  if (COLUMNAS_DE_TEXTO_CON_AVISO.has(col) && SOLO_NUMERO.test(v)) {
    return { tipo: "aviso", motivo: `${NOMBRE[col]} espera un nombre; dice «${v}», que es un número` };
  }
  return { tipo: "ok" };
}

export interface ResumenTipos {
  rojas: number;
  ambar: number;
  /** La primera celda marcada (de arriba abajo, de izquierda a derecha). */
  primera: { fila: number; col: number } | null;
  /** Columnas donde TODO lo escrito (2+ celdas) cae mal: señal de columnas corridas. */
  corridas: ColumnaPegar[];
}

export function resumirTipos(filas: readonly FilaPegar[]): ResumenTipos {
  let rojas = 0;
  let ambar = 0;
  let primera: ResumenTipos["primera"] = null;
  const escritas = new Map<ColumnaPegar, number>();
  const malas = new Map<ColumnaPegar, number>();
  filas.forEach((f, i) => {
    COLUMNAS_PEGAR.forEach((c, k) => {
      const { tipo } = clasificarCelda(c, f[c]);
      if (tipo === "vacio") return;
      escritas.set(c, (escritas.get(c) ?? 0) + 1);
      if (tipo === "ok") return;
      malas.set(c, (malas.get(c) ?? 0) + 1);
      if (tipo === "error") rojas++; else ambar++;
      primera ??= { fila: i, col: k };
    });
  });
  const corridas = COLUMNAS_PEGAR.filter((c) => (escritas.get(c) ?? 0) >= 2 && malas.get(c) === escritas.get(c));
  return { rojas, ambar, primera, corridas };
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** «2 celdas en rojo y 1 en ámbar no corresponden a su columna» (null si todo cuadra). */
export function fraseResumen(r: ResumenTipos): string | null {
  if (r.rojas + r.ambar === 0) return null;
  const partes = [
    r.rojas > 0 ? `${plural(r.rojas, "celda", "celdas")} en rojo` : "",
    r.ambar > 0 ? `${r.rojas > 0 ? "" : plural(r.ambar, "celda", "celdas") + " "}${r.rojas > 0 ? r.ambar + " " : ""}en ámbar` : "",
  ].filter(Boolean);
  const total = r.rojas + r.ambar;
  return `${partes.join(" y ")} ${total === 1 ? "no corresponde" : "no corresponden"} a su columna`;
}
