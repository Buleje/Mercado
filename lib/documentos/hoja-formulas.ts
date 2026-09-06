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

/**
 * Cómo el evaluador consigue el valor de una celda.
 *
 * `hoja` llega cuando la fórmula la nombra (`Totales!B1`); sin ella es la hoja
 * en la que vive la fórmula. Devolver `null` = esa hoja no existe (`#¡REF!`).
 */
export type LectorCelda = (fila: number, columna: number, hoja?: string) => string | null;

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
  /** Hoja en la que vive la fórmula: las referencias sin nombre son de acá. */
  hoja?: string;
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
  | { t: "ref"; v: string; hoja?: string }
  | { t: "rango"; a: string; b: string; hoja?: string }
  | { t: "fn"; v: string }
  | { t: "op"; v: string }
  | { t: "(" } | { t: ")" } | { t: "," };

/** Tras un nombre de hoja y su `!`: lee la referencia (o el rango) que sigue. */
function refTrasHoja(entrada: string, desde: number, hoja: string, tokens: Token[]): number {
  let i = desde;
  let ref = "";
  while (i < entrada.length && /[A-Za-z0-9$]/.test(entrada[i])) { ref += entrada[i]; i++; }
  if (entrada[i] === ":") {
    i++;
    let ref2 = "";
    while (i < entrada.length && /[A-Za-z0-9$]/.test(entrada[i])) { ref2 += entrada[i]; i++; }
    tokens.push({ t: "rango", a: ref, b: ref2, hoja });
  } else {
    tokens.push({ t: "ref", v: ref, hoja });
  }
  return i;
}

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
    // Nombre de hoja entre comillas simples: `'Lista precios'!B2`.
    // El `''` interno es un apóstrofe escapado, como lo guarda Excel.
    if (c === "'") {
      let nombre = "";
      i++;
      while (i < entrada.length) {
        if (entrada[i] === "'" && entrada[i + 1] === "'") { nombre += "'"; i += 2; continue; }
        if (entrada[i] === "'") break;
        nombre += entrada[i];
        i++;
      }
      i++; // la comilla de cierre
      if (entrada[i] === "!") {
        i = refTrasHoja(entrada, i + 1, nombre, tokens);
      }
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

    // `\p{L}` y no `[A-Za-z]`: los nombres en español llevan Ñ y tildes
    // (AÑO, DÍA, JERARQUÍA). Con el rango ASCII, "AÑO(" se cortaba en la Ñ y
    // la función quedaba sin reconocer.
    if (/[\p{L}$_]/u.test(c)) {
      let s = "";
      while (i < entrada.length && /[\p{L}0-9$_.]/u.test(entrada[i])) { s += entrada[i]; i++; }
      // ¿Referencia a otra hoja? "Ventas!B2" o "Ventas!B2:B9".
      if (entrada[i] === "!") {
        i = refTrasHoja(entrada, i + 1, s, tokens);
        continue;
      }
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
      case "ref": return this.valorDeRef(tk.v, tk.hoja);
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

  private valorDeRef(ref: string, hojaRef?: string): Valor {
    const coord = refACoordenada(ref);
    if (!coord) return ERROR_REF;
    // La hoja nombrada manda; sin nombre, la referencia es de la hoja en la
    // que vive la fórmula. La clave del ciclo lleva la hoja: A1 de Precios y
    // A1 de Totales son celdas distintas.
    const hoja = hojaRef ?? this.ctx.hoja;
    const clave = `${hoja ?? ""}!${coord.fila}-${coord.columna}`;
    if (this.ctx.visitando.has(clave)) return ERROR_CICLO;
    const bruto = this.ctx.leer(coord.fila, coord.columna, hoja);
    if (bruto === null) return ERROR_REF; // la hoja nombrada no existe
    // Una celda vacía se devuelve como texto vacío, no como 0: si no, ESBLANCO
    // diría que no lo está. En las cuentas sigue valiendo cero, porque `num("")`
    // es 0 y las funciones de suma descartan lo que no es número.
    if (bruto === "") return "";
    // Una celda puede contener otra fórmula: se resuelve en cadena, y sus
    // referencias sin nombre son de LA HOJA DE ESA CELDA, no de la de partida.
    if (esFormula(bruto)) {
      this.ctx.visitando.add(clave);
      const v = evaluarInterno(bruto, { ...this.ctx, hoja });
      this.ctx.visitando.delete(clave);
      return v;
    }
    const n = Number(bruto);
    return Number.isFinite(n) && bruto.trim() !== "" ? n : bruto;
  }

  /** Valores de un rango, ya aplanados. */
  private valoresRango(a: string, b: string, hoja?: string): Valor[] {
    const ini = refACoordenada(a), fin = refACoordenada(b);
    if (!ini || !fin) return [];
    const out: Valor[] = [];
    for (let f = Math.min(ini.fila, fin.fila); f <= Math.max(ini.fila, fin.fila); f++) {
      for (let c = Math.min(ini.columna, fin.columna); c <= Math.max(ini.columna, fin.columna); c++) {
        out.push(this.valorDeRef(coordenadaARef(f, c), hoja));
      }
    }
    return out;
  }

  /** Valores de un rango conservando su forma de tabla (filas × columnas). */
  private matrizRango(a: string, b: string, hoja?: string): Valor[][] {
    const ini = refACoordenada(a), fin = refACoordenada(b);
    if (!ini || !fin) return [];
    const out: Valor[][] = [];
    for (let f = Math.min(ini.fila, fin.fila); f <= Math.max(ini.fila, fin.fila); f++) {
      const fila: Valor[] = [];
      for (let c = Math.min(ini.columna, fin.columna); c <= Math.max(ini.columna, fin.columna); c++) {
        fila.push(this.valorDeRef(coordenadaARef(f, c), hoja));
      }
      out.push(fila);
    }
    return out;
  }

  private llamada(nombre: string): Valor {
    if (nombre === "TRUE" || nombre === "VERDADERO") return true;
    if (nombre === "FALSE" || nombre === "FALSO") return false;
    if (this.actual()?.t !== "(") return ERROR_NOMBRE;
    this.avanzar(); // (

    const args: Valor[][] = [];
    const matrices: (Valor[][] | null)[] = [];
    while (this.actual() && this.actual()!.t !== ")") {
      const tk = this.actual()!;
      if (tk.t === "rango") {
        this.avanzar();
        args.push(this.valoresRango(tk.a, tk.b, tk.hoja));
        // BUSCARV y las de referencia necesitan la tabla, no la lista plana.
        matrices.push(this.matrizRango(tk.a, tk.b, tk.hoja));
      } else {
        args.push([this.comparacion()]);
        matrices.push(null);
      }
      if (this.actual()?.t === ",") this.avanzar();
    }
    if (this.actual()?.t === ")") this.avanzar();

    return aplicar(nombre, args, matrices);
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

/** Serie de números 1..n, para las funciones de fecha. */
const MS_DIA = 86400 * 1000;
/** Excel cuenta los días desde el 1900-01-01 (con su bug del año bisiesto). */
const EPOCA_EXCEL = Date.UTC(1899, 11, 30);

function aSerieExcel(d: Date): number {
  return Math.round((d.getTime() - EPOCA_EXCEL) / MS_DIA);
}

function desdeSerieExcel(n: number): Date {
  return new Date(EPOCA_EXCEL + n * MS_DIA);
}

/** Interpreta un valor como fecha: sirve tanto el número de serie como "2026-07-22". */
function comoFecha(v: Valor): Date | null {
  if (typeof v === "number") return desdeSerieExcel(v);
  const t = texto(v).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  const pe = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (pe) return new Date(Date.UTC(Number(pe[3]), Number(pe[2]) - 1, Number(pe[1])));
  return null;
}

/** Redondeo a `d` decimales sin arrastrar la cola binaria del flotante. */
function redondear(v: number, d: number): number {
  const f = 10 ** d;
  return Math.round((v + Number.EPSILON) * f) / f;
}

/** La n-ésima menor/mayor de una lista. */
function kEsimo(nums: number[], k: number, mayor: boolean): Valor {
  if (k < 1 || k > nums.length) return ERROR_VALOR;
  const orden = [...nums].sort((a, b) => (mayor ? b - a : a - b));
  return orden[k - 1];
}

function mediana(nums: number[]): Valor {
  if (nums.length === 0) return ERROR_DIV0;
  const o = [...nums].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

function desviacion(nums: number[], muestral: boolean): Valor {
  const n = nums.length;
  if (n < (muestral ? 2 : 1)) return ERROR_DIV0;
  const media = nums.reduce((a, b) => a + b, 0) / n;
  const suma = nums.reduce((a, b) => a + (b - media) ** 2, 0);
  return Math.sqrt(suma / (muestral ? n - 1 : n));
}

/**
 * Aplica una función por su nombre.
 *
 * @param args     cada argumento ya evaluado y aplanado.
 * @param matrices para las funciones que necesitan la FORMA de un rango
 *   (BUSCARV mira una columna concreta de la tabla, no una lista suelta).
 */
function aplicar(nombre: string, args: Valor[][], matrices: (Valor[][] | null)[] = []): Valor {
  const planos = args.flat();
  const nums = numeros(args);
  const primero = planos[0];
  const arg = (i: number): Valor => args[i]?.[0] ?? "";
  const numArg = (i: number, porDefecto = 0) => (args[i] ? num(args[i][0]) : porDefecto);

  switch (nombre) {
    // ── Suma y cuenta ──────────────────────────────────────────────────────
    case "SUM": case "SUMA": return nums.reduce((a, b) => a + b, 0);
    case "AVERAGE": case "PROMEDIO": return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : ERROR_DIV0;
    case "MIN": return nums.length ? Math.min(...nums) : 0;
    case "MAX": return nums.length ? Math.max(...nums) : 0;
    case "COUNT": case "CONTAR": return nums.length;
    case "COUNTA": case "CONTARA": return planos.filter((v) => texto(v) !== "").length;
    case "COUNTBLANK": case "CONTAR.BLANCO": return planos.filter((v) => texto(v) === "").length;
    case "PRODUCT": case "PRODUCTO": return nums.reduce((a, b) => a * b, 1);
    case "SUBTOTAL": case "SUBTOTALES": {
      // SUBTOTALES(código; rango) — se soportan los códigos usuales.
      const codigo = num(primero) % 100;
      const resto = numeros(args.slice(1));
      const porCodigo: Record<number, Valor> = {
        1: resto.length ? resto.reduce((a, b) => a + b, 0) / resto.length : ERROR_DIV0,
        2: resto.length,
        3: args.slice(1).flat().filter((v) => texto(v) !== "").length,
        4: resto.length ? Math.max(...resto) : 0,
        5: resto.length ? Math.min(...resto) : 0,
        6: resto.reduce((a, b) => a * b, 1),
        9: resto.reduce((a, b) => a + b, 0),
      };
      return porCodigo[codigo] ?? ERROR_VALOR;
    }

    // ── Estadística ────────────────────────────────────────────────────────
    case "MEDIAN": case "MEDIANA": return mediana(nums);
    case "STDEV": case "DESVEST": return desviacion(nums, true);
    case "STDEVP": case "DESVESTP": return desviacion(nums, false);
    case "LARGE": case "K.ESIMO.MAYOR": return kEsimo(numeros([args[0] ?? []]), numArg(1, 1), true);
    case "SMALL": case "K.ESIMO.MENOR": return kEsimo(numeros([args[0] ?? []]), numArg(1, 1), false);
    case "RANK": case "JERARQUIA": case "JERARQUÍA": {
      const v = num(primero);
      const lista = numeros([args[1] ?? []]);
      const desc = numArg(2, 0) === 0;
      const orden = [...lista].sort((a, b) => (desc ? b - a : a - b));
      const i = orden.indexOf(v);
      return i === -1 ? ERROR_VALOR : i + 1;
    }

    // ── Matemática ─────────────────────────────────────────────────────────
    case "ROUND": case "REDONDEAR": return redondear(num(primero), numArg(1));
    case "ROUNDUP": case "REDONDEAR.MAS": {
      const f = 10 ** numArg(1);
      const v = num(primero);
      return (v < 0 ? -Math.ceil(Math.abs(v) * f) : Math.ceil(v * f)) / f;
    }
    case "ROUNDDOWN": case "REDONDEAR.MENOS": {
      const f = 10 ** numArg(1);
      const v = num(primero);
      return (v < 0 ? -Math.floor(Math.abs(v) * f) : Math.floor(v * f)) / f;
    }
    case "CEILING": case "MULTIPLO.SUPERIOR": {
      const paso = numArg(1, 1) || 1;
      return Math.ceil(num(primero) / paso) * paso;
    }
    case "FLOOR": case "MULTIPLO.INFERIOR": {
      const paso = numArg(1, 1) || 1;
      return Math.floor(num(primero) / paso) * paso;
    }
    case "ABS": return Math.abs(num(primero));
    case "INT": case "ENTERO": return Math.floor(num(primero));
    case "TRUNC": case "TRUNCAR": {
      const f = 10 ** numArg(1);
      return Math.trunc(num(primero) * f) / f;
    }
    case "MOD": case "RESIDUO": {
      const d = numArg(1);
      if (d === 0) return ERROR_DIV0;
      // Excel devuelve el signo del divisor, JS el del dividendo.
      return ((num(primero) % d) + d) % d;
    }
    case "SQRT": case "RAIZ": {
      const v = num(primero);
      return v < 0 ? ERROR_VALOR : Math.sqrt(v);
    }
    case "POWER": case "POTENCIA": return num(primero) ** numArg(1);
    case "EXP": return Math.exp(num(primero));
    case "LN": return num(primero) > 0 ? Math.log(num(primero)) : ERROR_VALOR;
    case "LOG": {
      const base = args[1] ? numArg(1) : 10;
      return num(primero) > 0 ? Math.log(num(primero)) / Math.log(base) : ERROR_VALOR;
    }
    case "LOG10": return num(primero) > 0 ? Math.log10(num(primero)) : ERROR_VALOR;
    case "SIGN": case "SIGNO": return Math.sign(num(primero));
    case "PI": return Math.PI;

    // ── Lógica ─────────────────────────────────────────────────────────────
    case "IF": case "SI": {
      const cond = primero;
      const esVerdad = typeof cond === "boolean" ? cond : num(cond) !== 0;
      return esVerdad ? (args[1] ? arg(1) : true) : (args[2] ? arg(2) : false);
    }
    case "IFS": case "SI.CONJUNTO": {
      for (let i = 0; i + 1 < args.length; i += 2) {
        const c = args[i][0];
        if (typeof c === "boolean" ? c : num(c) !== 0) return args[i + 1][0];
      }
      return ERROR_VALOR;
    }
    case "AND": case "Y": return planos.every((v) => (typeof v === "boolean" ? v : num(v) !== 0));
    case "OR": case "O": return planos.some((v) => (typeof v === "boolean" ? v : num(v) !== 0));
    case "NOT": case "NO": return !(typeof primero === "boolean" ? primero : num(primero) !== 0);
    case "IFERROR": case "SI.ERROR":
      return typeof primero === "string" && primero.startsWith("#") ? arg(1) : primero;
    case "ISBLANK": case "ESBLANCO": return texto(primero) === "";
    case "ISNUMBER": case "ESNUMERO": return typeof primero === "number";
    case "ISTEXT": case "ESTEXTO": return typeof primero === "string" && !primero.startsWith("#");
    case "ISERROR": case "ESERROR": return typeof primero === "string" && primero.startsWith("#");

    // ── Condicionales ──────────────────────────────────────────────────────
    case "SUMIF": case "SUMAR.SI": {
      const rango = args[0] ?? [];
      const criterio = texto(arg(1));
      const suma = args[2] ?? rango;
      let total = 0;
      rango.forEach((v, i) => { if (cumple(v, criterio)) total += num(suma[i] ?? 0); });
      return total;
    }
    case "COUNTIF": case "CONTAR.SI":
      return (args[0] ?? []).filter((v) => cumple(v, texto(arg(1)))).length;
    case "AVERAGEIF": case "PROMEDIO.SI": {
      const rango = args[0] ?? [];
      const criterio = texto(arg(1));
      const prom = args[2] ?? rango;
      const elegidos: number[] = [];
      rango.forEach((v, i) => { if (cumple(v, criterio)) elegidos.push(num(prom[i] ?? 0)); });
      return elegidos.length ? elegidos.reduce((a, b) => a + b, 0) / elegidos.length : ERROR_DIV0;
    }
    case "SUMIFS": case "SUMAR.SI.CONJUNTO": {
      // SUMAR.SI.CONJUNTO(rango_suma; rango1; criterio1; …)
      const suma = args[0] ?? [];
      let total = 0;
      for (let i = 0; i < suma.length; i++) {
        let pasa = true;
        for (let a = 1; a + 1 < args.length; a += 2) {
          if (!cumple(args[a][i] ?? "", texto(args[a + 1][0]))) { pasa = false; break; }
        }
        if (pasa) total += num(suma[i]);
      }
      return total;
    }
    case "COUNTIFS": case "CONTAR.SI.CONJUNTO": {
      const largo = args[0]?.length ?? 0;
      let cuenta = 0;
      for (let i = 0; i < largo; i++) {
        let pasa = true;
        for (let a = 0; a + 1 < args.length; a += 2) {
          if (!cumple(args[a][i] ?? "", texto(args[a + 1][0]))) { pasa = false; break; }
        }
        if (pasa) cuenta++;
      }
      return cuenta;
    }

    // ── Búsqueda ───────────────────────────────────────────────────────────
    case "VLOOKUP": case "BUSCARV": {
      // BUSCARV(valor; tabla; columna; [exacto]) — el "exacto" por defecto es
      // FALSO en Excel, pero acá se asume exacto: la coincidencia aproximada
      // sobre datos sin ordenar devuelve resultados silenciosamente erróneos.
      const buscado = texto(primero).toLowerCase();
      const tabla = matrices[1];
      const col = numArg(2, 1);
      if (!tabla || col < 1) return ERROR_VALOR;
      for (const fila of tabla) {
        if (texto(fila[0] ?? "").toLowerCase() === buscado) {
          return fila[col - 1] ?? "";
        }
      }
      return "#N/A";
    }
    case "HLOOKUP": case "BUSCARH": {
      const buscado = texto(primero).toLowerCase();
      const tabla = matrices[1];
      const fila = numArg(2, 1);
      if (!tabla || tabla.length === 0 || fila < 1) return ERROR_VALOR;
      const cabecera = tabla[0];
      for (let c = 0; c < cabecera.length; c++) {
        if (texto(cabecera[c] ?? "").toLowerCase() === buscado) {
          return tabla[fila - 1]?.[c] ?? "";
        }
      }
      return "#N/A";
    }
    case "MATCH": case "COINCIDIR": {
      const buscado = texto(primero).toLowerCase();
      const lista = args[1] ?? [];
      const i = lista.findIndex((v) => texto(v).toLowerCase() === buscado);
      return i === -1 ? "#N/A" : i + 1;
    }
    case "INDEX": case "INDICE": {
      const tabla = matrices[0];
      if (!tabla) return ERROR_VALOR;
      const f = numArg(1, 1), c = numArg(2, 1);
      // Un rango de una sola columna se indexa por fila; uno de una fila, por columna.
      if (tabla.length === 1) return tabla[0][f - 1] ?? ERROR_REF;
      if ((tabla[0]?.length ?? 0) === 1 && !args[2]) return tabla[f - 1]?.[0] ?? ERROR_REF;
      return tabla[f - 1]?.[c - 1] ?? ERROR_REF;
    }

    // ── Texto ──────────────────────────────────────────────────────────────
    case "CONCATENATE": case "CONCATENAR": return planos.map(texto).join("");
    case "TEXTJOIN": case "UNIRCADENAS": {
      const sep = texto(primero);
      const ignorarVacios = typeof arg(1) === "boolean" ? (arg(1) as boolean) : true;
      const partes = args.slice(2).flat().map(texto);
      return (ignorarVacios ? partes.filter((p) => p !== "") : partes).join(sep);
    }
    case "UPPER": case "MAYUSC": return texto(primero).toUpperCase();
    case "LOWER": case "MINUSC": return texto(primero).toLowerCase();
    case "PROPER": case "NOMPROPIO":
      return texto(primero).toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
    case "TRIM": case "ESPACIOS": return texto(primero).trim().replace(/\s+/g, " ");
    case "LEN": case "LARGO": return texto(primero).length;
    case "LEFT": case "IZQUIERDA": return texto(primero).slice(0, args[1] ? numArg(1) : 1);
    case "RIGHT": case "DERECHA": {
      const n = args[1] ? numArg(1) : 1;
      return n <= 0 ? "" : texto(primero).slice(-n);
    }
    case "MID": case "EXTRAE": {
      const inicio = Math.max(1, numArg(1, 1));
      return texto(primero).substr(inicio - 1, numArg(2));
    }
    case "FIND": case "ENCONTRAR": {
      const i = texto(arg(1)).indexOf(texto(primero));
      return i === -1 ? "#¡VALOR!" : i + 1;
    }
    case "SEARCH": case "HALLAR": {
      const i = texto(arg(1)).toLowerCase().indexOf(texto(primero).toLowerCase());
      return i === -1 ? "#¡VALOR!" : i + 1;
    }
    case "SUBSTITUTE": case "SUSTITUIR":
      return texto(primero).split(texto(arg(1))).join(texto(arg(2)));
    case "REPLACE": case "REEMPLAZAR": {
      const t = texto(primero);
      const inicio = Math.max(1, numArg(1, 1));
      return t.slice(0, inicio - 1) + texto(arg(3)) + t.slice(inicio - 1 + numArg(2));
    }
    case "REPT": case "REPETIR": return texto(primero).repeat(Math.max(0, numArg(1)));
    case "VALUE": case "VALOR": {
      const n = Number(texto(primero).replace(/[^\d.,-]/g, "").replace(/,/g, ""));
      return Number.isFinite(n) ? n : ERROR_VALOR;
    }
    case "TEXT": case "TEXTO": {
      // Sólo los formatos usuales; el resto vuelve como texto plano.
      const v = num(primero);
      const f = texto(arg(1));
      if (f.includes("%")) return `${redondear(v * 100, 2)}%`;
      const dec = (f.split(".")[1]?.match(/[0#]/g) ?? []).length;
      return f.includes("#,##")
        ? v.toLocaleString("es-PE", { minimumFractionDigits: dec, maximumFractionDigits: dec })
        : v.toFixed(dec);
    }

    // ── Fechas ─────────────────────────────────────────────────────────────
    case "TODAY": case "HOY": return aSerieExcel(new Date());
    case "NOW": case "AHORA": return aSerieExcel(new Date());
    case "YEAR": case "AÑO": case "ANO": { const d = comoFecha(primero); return d ? d.getUTCFullYear() : ERROR_VALOR; }
    case "MONTH": case "MES": { const d = comoFecha(primero); return d ? d.getUTCMonth() + 1 : ERROR_VALOR; }
    case "DAY": case "DIA": case "DÍA": { const d = comoFecha(primero); return d ? d.getUTCDate() : ERROR_VALOR; }
    case "WEEKDAY": case "DIASEM": {
      const d = comoFecha(primero);
      return d ? d.getUTCDay() + 1 : ERROR_VALOR;
    }
    case "DATE": case "FECHA":
      return aSerieExcel(new Date(Date.UTC(numArg(0), numArg(1) - 1, numArg(2))));
    case "DAYS": case "DIAS": case "DÍAS": {
      const a = comoFecha(primero), b = comoFecha(arg(1));
      return a && b ? Math.round((a.getTime() - b.getTime()) / MS_DIA) : ERROR_VALOR;
    }
    case "EDATE": case "FECHA.MES": {
      const d = comoFecha(primero);
      if (!d) return ERROR_VALOR;
      const nueva = new Date(d);
      nueva.setUTCMonth(nueva.getUTCMonth() + numArg(1));
      return aSerieExcel(nueva);
    }

    // ── Financieras de uso corriente ───────────────────────────────────────
    case "PMT": case "PAGO": {
      // PAGO(tasa; períodos; presente) — la cuota de un préstamo.
      const tasa = num(primero), n = numArg(1), vp = numArg(2);
      if (n === 0) return ERROR_DIV0;
      if (tasa === 0) return -vp / n;
      return -(vp * tasa) / (1 - (1 + tasa) ** -n);
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
 * @param hoja nombre de la hoja donde vive la fórmula — hace que `Totales!B1`
 *   y las referencias sin nombre resuelvan contra la hoja correcta.
 */
export function evaluarFormula(formula: string, leer: LectorCelda, hoja?: string): string {
  const v = evaluarInterno(formula, { leer, visitando: new Set(), hoja });
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return ERROR_VALOR;
    // Los flotantes binarios dejan colas de decimales que nadie quiere ver.
    return String(Math.round(v * 1e10) / 1e10);
  }
  return texto(v);
}
