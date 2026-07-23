/**
 * hoja-formulas — evaluar fórmulas en el editor.
 *
 * POR QUÉ HACE FALTA UN EVALUADOR ACÁ: el archivo guarda el resultado que
 * calculó Excel la última vez. Si el usuario cambia un costo, el total tiene
 * que actualizarse EN PANTALLA en el momento; si no, ve números que ya no son
 * ciertos y no puede trabajar. Al guardar, el libro queda marcado para que
 * Excel rehaga sus cuentas con el motor de verdad.
 *
 * ALCANCE DELIBERADO: aritmética, referencias, rangos, comparaciones y las
 * funciones que aparecen en las planillas de un negocio. No es Excel entero:
 * ante una función que no conoce devuelve el error `#¿NOMBRE?`, que es visible
 * y honesto, en vez de un número inventado. La fórmula original NUNCA se pierde
 * por esto — sigue guardada tal cual en el archivo.
 *
 * Se aceptan los nombres en español (SUMA, PROMEDIO, SI) y en inglés (SUM,
 * AVERAGE, IF): las planillas peruanas vienen de las dos formas.
 */

import { letraANumero, numeroALetra } from "./xlsx-formato";

/** Cómo el evaluador consigue el valor de una celda. */
export type LectorCelda = (fila: number, columna: number) => string;

export const ERROR_NOMBRE = "#¿NOMBRE?";
export const ERROR_VALOR = "#¡VALOR!";
export const ERROR_DIV0 = "#¡DIV/0!";
export const ERROR_REF = "#¡REF!";
export const ERROR_CICLO = "#¡REF!";

/** ¿El texto que escribió el usuario es una fórmula? */
export function esFormula(texto: string): boolean {
  return texto.trimStart().startsWith("=");
}

type Valor = number | string | boolean;

interface Ctx {
  leer: LectorCelda;
  /** Celdas ya en curso de cálculo: corta las referencias circulares. */
  visitando: Set<string>;
}

/** "B2" → {fila: 1, columna: 1} (base 0). Ignora los `$` de las absolutas. */
export function refACoordenada(ref: string): { fila: number; columna: number } | null {
  const m = /^\$?([A-Za-z]+)\$?(\d+)$/.exec(ref.trim());
  if (!m) return null;
  return { fila: Number(m[2]) - 1, columna: letraANumero(m[1]) - 1 };
}

export function coordenadaARef(fila: number, columna: number): string {
  return `${numeroALetra(columna + 1)}${fila + 1}`;
}

// ── Tokenizador ─────────────────────────────────────────────────────────────

type Token =
  | { t: "num"; v: number }
  | { t: "txt"; v: string }
  | { t: "ref"; v: string }
  | { t: "rango"; a: string; b: string }
  | { t: "fn"; v: string }
  | { t: "op"; v: string }
  | { t: "(" } | { t: ")" } | { t: "," };

function tokenizar(entrada: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < entrada.length) {
    const c = entrada[i];
    if (c === " ") { i++; continue; }

    if (c === '"') {
      let s = "";
      i++;
      while (i < entrada.length && entrada[i] !== '"') { s += entrada[i]; i++; }
      i++;
      tokens.push({ t: "txt", v: s });
      continue;
    }
    if (c === "(") { tokens.push({ t: "(" }); i++; continue; }
    if (c === ")") { tokens.push({ t: ")" }); i++; continue; }
    // El punto y coma también separa argumentos en Excel en español.
    if (c === "," || c === ";") { tokens.push({ t: "," }); i++; continue; }

    if (/[0-9.]/.test(c)) {
      let s = "";
      while (i < entrada.length && /[0-9.]/.test(entrada[i])) { s += entrada[i]; i++; }
      tokens.push({ t: "num", v: Number(s) });
      continue;
    }

    // Operadores de comparación de dos caracteres, antes que los de uno.
    const dos = entrada.slice(i, i + 2);
    if (dos === "<=" || dos === ">=" || dos === "<>") { tokens.push({ t: "op", v: dos }); i += 2; continue; }
    if ("+-*/^&=<>%".includes(c)) { tokens.push({ t: "op", v: c }); i++; continue; }

    if (/[A-Za-z$_]/.test(c)) {
      let s = "";
      while (i < entrada.length && /[A-Za-z0-9$_.]/.test(entrada[i])) { s += entrada[i]; i++; }
      // ¿Rango? "A1:B9"
      if (entrada[i] === ":" && /^\$?[A-Za-z]+\$?\d+$/.test(s)) {
        i++;
        let s2 = "";
        while (i < entrada.length && /[A-Za-z0-9$]/.test(entrada[i])) { s2 += entrada[i]; i++; }
        tokens.push({ t: "rango", a: s, b: s2 });
        continue;
      }
      if (entrada[i] === "(") { tokens.push({ t: "fn", v: s.toUpperCase() }); continue; }
      if (/^\$?[A-Za-z]+\$?\d+$/.test(s)) { tokens.push({ t: "ref", v: s }); continue; }
      // TRUE/FALSE y nombres sueltos.
      tokens.push({ t: "fn", v: s.toUpperCase() });
      continue;
    }
    i++; // carácter que no se entiende: se ignora
  }
  return tokens;
}

// ── Parser (precedencia estándar de Excel) ──────────────────────────────────

class Parser {
  private i = 0;
  constructor(private tokens: Token[], private ctx: Ctx) {}

  parse(): Valor {
    const v = this.comparacion();
    return v;
  }

  private comparacion(): Valor {
    let izq = this.concatenacion();
    while (this.actual()?.t === "op" && ["=", "<", ">", "<=", ">=", "<>"].includes((this.actual() as { v: string }).v)) {
      const op = (this.avanzar() as { v: string }).v;
      const der = this.concatenacion();
      izq = comparar(op, izq, der);
    }
    return izq;
  }

  private concatenacion(): Valor {
    let izq = this.suma();
    while (this.actual()?.t === "op" && (this.actual() as { v: string }).v === "&") {
      this.avanzar();
      izq = `${texto(izq)}${texto(this.suma())}`;
    }
    return izq;
  }

  private suma(): Valor {
    let izq = this.producto();
    while (this.actual()?.t === "op" && ["+", "-"].includes((this.actual() as { v: string }).v)) {
      const op = (this.avanzar() as { v: string }).v;
      const der = this.producto();
      izq = op === "+" ? num(izq) + num(der) : num(izq) - num(der);
    }
    return izq;
  }

  private producto(): Valor {
    let izq = this.potencia();
    while (this.actual()?.t === "op" && ["*", "/"].includes((this.actual() as { v: string }).v)) {
      const op = (this.avanzar() as { v: string }).v;
      const der = this.potencia();
      if (op === "/" && num(der) === 0) return ERROR_DIV0;
      izq = op === "*" ? num(izq) * num(der) : num(izq) / num(der);
    }
    return izq;
  }

  private potencia(): Valor {
    const izq = this.unario();
    if (this.actual()?.t === "op" && (this.actual() as { v: string }).v === "^") {
      this.avanzar();
      return num(izq) ** num(this.potencia());
    }
    return izq;
  }

  private unario(): Valor {
    const a = this.actual();
    if (a?.t === "op" && a.v === "-") { this.avanzar(); return -num(this.unario()); }
    if (a?.t === "op" && a.v === "+") { this.avanzar(); return this.unario(); }
    const v = this.primario();
    // Porcentaje posfijo: "50%" es 0.5.
    if (this.actual()?.t === "op" && (this.actual() as { v: string }).v === "%") {
      this.avanzar();
      return num(v) / 100;
    }
    return v;
  }

  private primario(): Valor {
    const tk = this.avanzar();
    if (!tk) return ERROR_VALOR;
    switch (tk.t) {
      case "num": return tk.v;
      case "txt": return tk.v;
      case "ref": return this.valorDeRef(tk.v);
      case "rango": return ERROR_VALOR; // un rango suelto sólo vale dentro de una función
      case "(": {
        const v = this.comparacion();
        if (this.actual()?.t === ")") this.avanzar();
        return v;
      }
      case "fn": return this.llamada(tk.v);
      default: return ERROR_VALOR;
    }
  }

  private valorDeRef(ref: string): Valor {
    const coord = refACoordenada(ref);
    if (!coord) return ERROR_REF;
    const clave = `${coord.fila}-${coord.columna}`;
    if (this.ctx.visitando.has(clave)) return ERROR_CICLO;
    const bruto = this.ctx.leer(coord.fila, coord.columna);
    if (bruto === "") return 0;
    // Una celda puede contener otra fórmula: se resuelve en cadena.
    if (esFormula(bruto)) {
      this.ctx.visitando.add(clave);
      const v = evaluarInterno(bruto, this.ctx);
      this.ctx.visitando.delete(clave);
      return v;
    }
    const n = Number(bruto);
    return Number.isFinite(n) && bruto.trim() !== "" ? n : bruto;
  }

  /** Valores de un rango, ya aplanados. */
  private valoresRango(a: string, b: string): Valor[] {
    const ini = refACoordenada(a), fin = refACoordenada(b);
    if (!ini || !fin) return [];
    const out: Valor[] = [];
    for (let f = Math.min(ini.fila, fin.fila); f <= Math.max(ini.fila, fin.fila); f++) {
      for (let c = Math.min(ini.columna, fin.columna); c <= Math.max(ini.columna, fin.columna); c++) {
        out.push(this.valorDeRef(coordenadaARef(f, c)));
      }
    }
    return out;
  }

  private llamada(nombre: string): Valor {
    if (nombre === "TRUE" || nombre === "VERDADERO") return true;
    if (nombre === "FALSE" || nombre === "FALSO") return false;
    if (this.actual()?.t !== "(") return ERROR_NOMBRE;
    this.avanzar(); // (

    const args: Valor[][] = [];
    while (this.actual() && this.actual()!.t !== ")") {
      const tk = this.actual()!;
      if (tk.t === "rango") { this.avanzar(); args.push(this.valoresRango(tk.a, tk.b)); }
      else args.push([this.comparacion()]);
      if (this.actual()?.t === ",") this.avanzar();
    }
    if (this.actual()?.t === ")") this.avanzar();

    return aplicar(nombre, args);
  }

  private actual(): Token | undefined { return this.tokens[this.i]; }
  private avanzar(): Token | undefined { return this.tokens[this.i++]; }
}

// ── Funciones ───────────────────────────────────────────────────────────────

function num(v: Valor): number {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function texto(v: Valor): string {
  if (typeof v === "boolean") return v ? "VERDADERO" : "FALSO";
  return String(v);
}

function comparar(op: string, a: Valor, b: Valor): boolean {
  const numerico = typeof a === "number" && typeof b === "number";
  const x = numerico ? (a as number) : texto(a).toLowerCase();
  const y = numerico ? (b as number) : texto(b).toLowerCase();
  switch (op) {
    case "=": return x === y;
    case "<>": return x !== y;
    case "<": return x < y;
    case ">": return x > y;
    case "<=": return x <= y;
    case ">=": return x >= y;
    default: return false;
  }
}

/** Sólo los números cuentan para los promedios y sumas, como en Excel. */
function numeros(args: Valor[][]): number[] {
  return args.flat().filter((v) => typeof v === "number" || (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))))
    .map((v) => num(v));
}

function aplicar(nombre: string, args: Valor[][]): Valor {
  const planos = args.flat();
  const nums = numeros(args);
  const primero = planos[0];

  switch (nombre) {
    case "SUM": case "SUMA": return nums.reduce((a, b) => a + b, 0);
    case "AVERAGE": case "PROMEDIO": return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : ERROR_DIV0;
    case "MIN": return nums.length ? Math.min(...nums) : 0;
    case "MAX": return nums.length ? Math.max(...nums) : 0;
    case "COUNT": case "CONTAR": return nums.length;
    case "COUNTA": case "CONTARA": return planos.filter((v) => texto(v) !== "").length;
    case "ROUND": case "REDONDEAR": {
      const d = args[1] ? num(args[1][0]) : 0;
      const factor = 10 ** d;
      return Math.round(num(primero) * factor) / factor;
    }
    case "ABS": return Math.abs(num(primero));
    case "INT": case "ENTERO": return Math.floor(num(primero));
    case "SQRT": case "RAIZ": return Math.sqrt(num(primero));
    case "POWER": case "POTENCIA": return num(primero) ** num(args[1]?.[0] ?? 0);
    case "PRODUCT": case "PRODUCTO": return nums.reduce((a, b) => a * b, 1);
    case "IF": case "SI": {
      const cond = primero;
      const verdadero = args[1]?.[0] ?? true;
      const falso = args[2]?.[0] ?? false;
      const esVerdad = typeof cond === "boolean" ? cond : num(cond) !== 0;
      return esVerdad ? verdadero : falso;
    }
    case "CONCATENATE": case "CONCATENAR": return planos.map(texto).join("");
    case "UPPER": case "MAYUSC": return texto(primero).toUpperCase();
    case "LOWER": case "MINUSC": return texto(primero).toLowerCase();
    case "TRIM": case "ESPACIOS": return texto(primero).trim();
    case "LEN": case "LARGO": return texto(primero).length;
    case "IFERROR": case "SI.ERROR": {
      const v = primero;
      return typeof v === "string" && v.startsWith("#") ? (args[1]?.[0] ?? "") : v;
    }
    case "SUMIF": case "SUMAR.SI": {
      // SUMAR.SI(rango; criterio; [rango_suma])
      const rango = args[0] ?? [];
      const criterio = texto(args[1]?.[0] ?? "");
      const suma = args[2] ?? rango;
      let total = 0;
      rango.forEach((v, i) => { if (cumple(v, criterio)) total += num(suma[i] ?? 0); });
      return total;
    }
    case "COUNTIF": case "CONTAR.SI": {
      const rango = args[0] ?? [];
      const criterio = texto(args[1]?.[0] ?? "");
      return rango.filter((v) => cumple(v, criterio)).length;
    }
    default: return ERROR_NOMBRE;
  }
}

/** Criterio de SUMAR.SI: ">100", "<=5", "Tornillo". */
function cumple(valor: Valor, criterio: string): boolean {
  const m = /^(<=|>=|<>|<|>|=)?(.*)$/.exec(criterio.trim());
  const op = m?.[1] || "=";
  const ref = m?.[2] ?? "";
  const objetivo = Number(ref);
  return comparar(op, valor, Number.isFinite(objetivo) && ref.trim() !== "" ? objetivo : ref);
}

function evaluarInterno(formula: string, ctx: Ctx): Valor {
  const cuerpo = formula.trimStart().replace(/^=/, "");
  try {
    return new Parser(tokenizar(cuerpo), ctx).parse();
  } catch {
    return ERROR_VALOR;
  }
}

/**
 * Evalúa una fórmula y devuelve el texto a mostrar.
 *
 * @param leer cómo obtener el contenido crudo de otra celda (puede ser otra
 *   fórmula: se resuelve en cadena, cortando las referencias circulares).
 */
export function evaluarFormula(formula: string, leer: LectorCelda): string {
  const v = evaluarInterno(formula, { leer, visitando: new Set() });
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return ERROR_VALOR;
    // Los flotantes binarios dejan colas de decimales que nadie quiere ver.
    return String(Math.round(v * 1e10) / 1e10);
  }
  return texto(v);
}
