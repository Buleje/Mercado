/**
 * busqueda-natural — «Buscar como hablas» en el Archivo.
 *
 * La persona escribe «permisos que vencen este año» o «lo que llegó por
 * WhatsApp ayer». Hasta el 22-10 eso iba entero al LIKE (o a la IA, que lo
 * partía en palabras y las sumaba con OR): «que», «este» y «mes» están en casi
 * todos los papeles, y «lo que vence este mes» traía 22 de 44 cuando no vencía
 * ninguno. Acá se lee la frase como la leería una persona: qué es una fecha (de
 * vencimiento o de subida), qué es un tipo de papel, de dónde llegó, en qué
 * carpeta está y qué queda como texto a buscar (TODAS esas palabras).
 *
 * PURA: sin red ni base. La ruta le pasa las carpetas que el rol ve y arma los
 * filtros con lo que devuelve; la pantalla la llama igual para dibujar los
 * chips «Entendí: …», así los dos lados entienden lo mismo.
 *
 * Reglas que no son obvias (cada una tiene su test):
 *  · El verbo decide a qué fecha va un período: «vence / vencen / vencimiento»
 *    → vencimiento; «llegó / subí / subidos» → subida. Sin verbo, subida
 *    («facturas de octubre»), SALVO un año o una fecha completa escritos con
 *    números («contratos de 2026», «del 2021»): eso es la fecha DEL PAPEL —el
 *    año escrito en el documento, o que venza ese año—, no la de subida: casi
 *    todo se subió en 2026 y Blas sube en 2026 permisos de 2021.
 *  · En presente, un período que incluye hoy cuenta desde hoy («vence este
 *    mes» = lo que falta vencer). En pasado («venció», «vencidos») se corta en
 *    hoy. Un período entero en el pasado o en el futuro se toma completo.
 *  · «vencidos» = su fecha ya pasó (antes de hoy): lo que vence hoy, hoy sirve.
 *  · Mes o día sin año: para lo que vence, el próximo que viene; para lo
 *    subido o vencido, el último que pasó.
 *  · «en <carpeta>» / «carpeta <x>» filtra por esa carpeta y sus subcarpetas.
 *    Una palabra suelta que coincide con una carpeta («de Chivis», «del jefe»)
 *    busca en esa carpeta O en el texto: el DNI del jefe puede estar en otra
 *    carpeta y decir «jefe» en el nombre.
 *  · Tipos de la misma familia se suman («facturas y boletas»); de familias
 *    distintas se cruzan («facturas en PDF»).
 *  · Hora de Lima: UTC−5 todo el año (Perú no tiene horario de verano).
 *    «Hoy» es el día de Lima. La SUBIDA es un instante y se corta en la
 *    medianoche de Lima; el VENCIMIENTO es un día de calendario guardado a
 *    00:00Z (a mano) o a 12:00Z (lo leyó el OCR), así que se compara por día:
 *    [día 00:00Z, día siguiente 00:00Z) cubre los dos formatos.
 *  · Una frase que es TODA relleno («de la», «lo que llegó») no busca nada:
 *    `soloRelleno` y la vista normal, en vez de buscar «de» Y «la» por todos lados.
 */
import type { GrupoBusqueda, RangoFechas } from "@/lib/types/documents";
import { TAG_FOTO_PERSONA } from "@/lib/camaras/personas-retencion";

// ── Contrato ────────────────────────────────────────────────────────────────

export type TipoEntendi = "vence" | "subido" | "papel" | "tipo" | "origen" | "carpeta" | "favoritos" | "texto";

export interface ChipEntendi {
  tipo: TipoEntendi;
  /** Lo que se entendió, en palabras: «vence en noviembre», «contratos». */
  texto: string;
  /** La búsqueda reescrita sin esta parte (lo que hace la ✕ del chip). */
  sinEsto: string;
}

export interface CarpetaBuscable {
  id: string;
  name: string;
  parentId: string | null;
}

export interface ContextoBusqueda {
  /** Las carpetas que el rol ve. Sin ellas no se reconoce ninguna carpeta. */
  carpetas?: readonly CarpetaBuscable[];
  ahora?: Date;
}

export interface BusquedaInterpretada {
  /** Lo que queda para buscar como texto (TODAS las palabras). "" = nada. */
  texto: string;
  /** Vencimiento en [desde, hasta) — `{}` = con fecha de vencimiento; "sin" = sin fecha. */
  vence?: RangoFechas | "sin";
  subido?: RangoFechas;
  /** Carpeta pedida con «en …» / «carpeta …», ya con sus subcarpetas. */
  carpetas?: string[];
  /** Condiciones que se cruzan (AND); dentro de cada una basta con ALGUNA. */
  grupos: GrupoBusqueda[];
  favoritos?: boolean;
  entendi: ChipEntendi[];
  /** Quedaron palabras que podrían ser una carpeta: conviene volver a leer con la lista. */
  necesitaCarpetas: boolean;
  /** Escribió algo, pero todo era relleno: no hay nada que buscar. */
  soloRelleno: boolean;
}

// ── Texto ───────────────────────────────────────────────────────────────────

/** Minúsculas y sin tildes (la ñ queda «n», igual de los dos lados). */
export function plegar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Relleno: no distingue un papel de otro. Superconjunto de `terminos-busqueda`. */
const VACIAS = new Set([
  "de", "del", "la", "el", "los", "las", "un", "una", "unos", "unas", "y", "e", "o", "u", "que", "con",
  "por", "para", "en", "al", "a", "x", "se", "su", "sus", "mi", "mis", "tu", "tus", "lo", "es", "son",
  "como", "mas", "este", "esta", "estos", "estas", "ese", "esa", "esos", "esas", "eso", "esto", "todo",
  "todos", "toda", "todas", "tengo", "tenemos", "hay", "ya", "me", "le", "les", "nos", "sin", "no",
  "papel", "papeles", "documento", "documentos", "archivo", "archivos", "doc", "docs", "cosa", "cosas",
  "busco", "buscar", "busca", "ver", "mostrar", "muestrame", "dame", "quiero", "necesito", "donde",
  "cual", "cuales", "algun", "alguno", "alguna", "algunos", "algo", "antes", "despues", "hasta",
  "desde", "fecha", "estan", "hace", "hacen", "durante", "cerca", "casi", "aprox", "aproximadamente",
  "alrededor", "solo", "solamente", "tambien", "favor", "porfa", "porfavor", "ahi", "aqui", "muestra",
  "ensename", "trae", "traeme", "encuentra", "encontrar", "hallar", "tenia", "habia", "fue", "fueron",
  "era", "eran", "sea", "sean", "esten", "estaba", "estaban",
]);
/** Lo que puede ir delante de una fecha, un origen o una carpeta y se va con ella. */
const CONECTORES = new Set(["de", "del", "en", "el", "la", "los", "las", "para", "a", "al", "durante", "por", "x", "desde"]);
const ARTICULOS = new Set(["el", "la", "los", "las", "mi", "mis"]);

interface Tok {
  crudo: string;
  t: string;
  usado: boolean;
}

function tokenizar(consulta: string): Tok[] {
  return consulta
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((crudo) => ({ crudo, t: plegar(crudo).replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ""), usado: false }));
}

const esVacia = (t: string) => t === "" || VACIAS.has(t);

// ── Fechas en hora de Lima ──────────────────────────────────────────────────

const DIA_MS = 86_400_000;
const LIMA_MS = 5 * 3_600_000;
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
const MES_DE: Record<string, number> = Object.fromEntries([...MESES.map((m, i) => [m, i + 1]), ["septiembre", 9]]);
const NUMEROS: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, quince: 15, veinte: 20, treinta: 30, sesenta: 60, noventa: 90,
};
const UNIDAD_DIAS: Record<string, number> = { dia: 1, dias: 1, semana: 7, semanas: 7, mes: 30, meses: 30 };

interface Dia {
  y: number;
  m: number;
  d: number;
}
/** El día de Lima de un instante. */
const diaDe = (ms: number): Dia => {
  const l = new Date(ms - LIMA_MS);
  return { y: l.getUTCFullYear(), m: l.getUTCMonth() + 1, d: l.getUTCDate() };
};
/**
 * Comienzo de ese día de CALENDARIO (00:00Z; `Date.UTC` acomoda el mes 13 o el
 * día 0). Toda la aritmética de períodos va en días así; la subida se corre a
 * la medianoche de Lima recién al final (`aISO(r, LIMA_MS)`).
 */
const medianoche = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);
const esAnio = (t: string) => /^(19|20)\d{2}$/.test(t) && Number(t) >= 1990 && Number(t) <= 2100;
const numero = (t: string): number | null => (/^\d{1,3}$/.test(t) ? Number(t) : NUMEROS[t] ?? null);

/** «el 15 de diciembre» (con el año sólo si no es el actual). */
const etiquetaDia = (y: number, m: number, d: number, hoy: Dia) =>
  `el ${d} de ${MESES[m - 1]}${y !== hoy.y ? ` de ${y}` : ""}`;

type Sentido = "futuro" | "pasado";
interface Periodo {
  desde?: number;
  hasta?: number;
  /** Con su preposición: «hoy», «en noviembre», «el 15 de diciembre», «este año». */
  etiqueta: string;
  /** Año o fecha completa escrita con números: sin verbo, es la fecha del papel. */
  literal?: string;
}
interface Lectura {
  fin: number;
  resolver: (s: Sentido) => Periodo;
}

const RELATIVOS: Record<string, { este: string[]; antes: string[]; despues: string[] }> = {
  semana: { este: ["esta"], antes: ["pasada", "anterior"], despues: ["proxima", "siguiente"] },
  mes: { este: ["este"], antes: ["pasado", "anterior"], despues: ["proximo", "siguiente"] },
  ano: { este: ["este"], antes: ["pasado", "anterior"], despues: ["proximo", "siguiente"] },
};

function leerBase(tk: Tok[], i: number, hoy: Dia): Lectura | null {
  const w = (k: number) => (tk[k] && !tk[k].usado ? tk[k].t : "");
  const hoyMs = medianoche(hoy.y, hoy.m, hoy.d);
  const fijo = (fin: number, p: Periodo): Lectura => ({ fin, resolver: () => p });
  const dia = (fin: number, n: number, etiqueta: string) =>
    fijo(fin, { desde: hoyMs + n * DIA_MS, hasta: hoyMs + (n + 1) * DIA_MS, etiqueta });
  const t = w(i);
  if (!t) return null;

  if (t === "hoy") return dia(i + 1, 0, "hoy");
  if (t === "ayer") return dia(i + 1, -1, "ayer");
  if (t === "anteayer") return dia(i + 1, -2, "anteayer");
  if (t === "manana") return dia(i + 1, 1, "mañana");

  // esta semana · la semana pasada · la próxima semana · el mes que viene · este año…
  const unidadEn = (k: number) => (w(k) === "anio" ? "ano" : w(k));
  const relativo = (unidad: string, n: number, fin: number): Lectura => {
    if (unidad === "semana") {
      const lunes = hoyMs - ((new Date(hoyMs).getUTCDay() + 6) % 7) * DIA_MS + n * 7 * DIA_MS;
      const etiqueta = n === 0 ? "esta semana" : n < 0 ? "la semana pasada" : "la próxima semana";
      return fijo(fin, { desde: lunes, hasta: lunes + 7 * DIA_MS, etiqueta });
    }
    if (unidad === "mes") {
      const etiqueta = n === 0 ? "este mes" : n < 0 ? "el mes pasado" : "el próximo mes";
      return fijo(fin, { desde: medianoche(hoy.y, hoy.m + n, 1), hasta: medianoche(hoy.y, hoy.m + n + 1, 1), etiqueta });
    }
    const etiqueta = n === 0 ? "este año" : n < 0 ? "el año pasado" : "el próximo año";
    return fijo(fin, { desde: medianoche(hoy.y + n, 1, 1), hasta: medianoche(hoy.y + n + 1, 1, 1), etiqueta });
  };
  for (const [unidad, r] of Object.entries(RELATIVOS)) {
    if (r.este.includes(t) && unidadEn(i + 1) === unidad) return relativo(unidad, 0, i + 2);
    if (r.despues.includes(t) && unidadEn(i + 1) === unidad) return relativo(unidad, 1, i + 2);
    if (unidadEn(i) === unidad) {
      if (r.antes.includes(w(i + 1))) return relativo(unidad, -1, i + 2);
      if (r.despues.includes(w(i + 1))) return relativo(unidad, 1, i + 2);
      if (w(i + 1) === "que" && w(i + 2) === "viene") return relativo(unidad, 1, i + 3);
    }
  }

  // Año escrito: «2027», «el año 2027».
  const anio = (k: number, fin: number): Lectura => {
    const y = Number(w(k));
    return fijo(fin, { desde: medianoche(y, 1, 1), hasta: medianoche(y + 1, 1, 1), etiqueta: `en ${y}`, literal: tk[k].crudo });
  };
  if (esAnio(t)) return anio(i, i + 1);
  if (unidadEn(i) === "ano" && esAnio(w(i + 1))) return anio(i + 1, i + 2);

  // «noviembre», «octubre de 2025», «octubre del 2025», «octubre 2025».
  const anioTras = (k: number): { y: number; fin: number } | null => {
    if ((w(k) === "de" || w(k) === "del") && esAnio(w(k + 1))) return { y: Number(w(k + 1)), fin: k + 2 };
    if (esAnio(w(k))) return { y: Number(w(k)), fin: k + 1 };
    return null;
  };
  if (MES_DE[t]) {
    const m = MES_DE[t];
    const explicito = anioTras(i + 1);
    return {
      fin: explicito?.fin ?? i + 1,
      resolver: (s) => {
        const y = explicito?.y ?? (s === "futuro" ? (m < hoy.m ? hoy.y + 1 : hoy.y) : m > hoy.m ? hoy.y - 1 : hoy.y);
        return { desde: medianoche(y, m, 1), hasta: medianoche(y, m + 1, 1), etiqueta: `en ${MESES[m - 1]}${y !== hoy.y ? ` de ${y}` : ""}` };
      },
    };
  }

  // Un día: «15 de diciembre [de 2026]», «15/12[/2026]», «2026-12-15».
  let d: number | null = null;
  let m: number | null = null;
  let yExp: number | null = null;
  let fin = i + 1;
  const barra = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (/^\d{1,2}$/.test(t) && w(i + 1) === "de" && MES_DE[w(i + 2)]) {
    d = Number(t);
    m = MES_DE[w(i + 2)];
    const e = anioTras(i + 3);
    yExp = e?.y ?? null;
    fin = e?.fin ?? i + 3;
  } else if (barra) {
    d = Number(barra[1]);
    m = Number(barra[2]);
    yExp = barra[3] ? Number(barra[3].length === 2 ? `20${barra[3]}` : barra[3]) : null;
  } else if (iso) {
    yExp = Number(iso[1]);
    m = Number(iso[2]);
    d = Number(iso[3]);
  }
  if (d !== null && m !== null && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
    const dd = d;
    const mm = m;
    // 31/02 no existe: `Date.UTC` lo correría a marzo.
    if (new Date(Date.UTC(yExp ?? 2024, mm - 1, dd)).getUTCMonth() !== mm - 1) return null;
    const literal = yExp !== null ? tk.slice(i, fin).map((x) => x.crudo).join(" ") : undefined;
    return {
      fin,
      resolver: (s) => {
        let y = yExp ?? hoy.y;
        if (yExp === null) {
          const enEsteAnio = medianoche(hoy.y, mm, dd);
          if (s === "futuro" && enEsteAnio < hoyMs) y = hoy.y + 1;
          if (s === "pasado" && enEsteAnio > hoyMs) y = hoy.y - 1;
        }
        const desde = medianoche(y, mm, dd);
        return { desde, hasta: desde + DIA_MS, etiqueta: etiquetaDia(y, mm, dd, hoy), literal };
      },
    };
  }

  // «últimos 7 días», «próximos 15 días», «dentro de 2 semanas», «en 10 días».
  const cuantos = (k: number): { dias: number; fin: number } | null => {
    const n = numero(w(k));
    const u = UNIDAD_DIAS[w(k + 1)];
    return n && u ? { dias: n * u, fin: k + 2 } : null;
  };
  // «hace 3 días», «hace una semana»: desde ese día hasta hoy (no se acuerda el día exacto).
  if (t === "hace") {
    const c = cuantos(i + 1);
    if (c) return fijo(c.fin, { desde: hoyMs - c.dias * DIA_MS, hasta: hoyMs + DIA_MS, etiqueta: `desde hace ${c.dias} días` });
  }
  if (t === "ultimos" || t === "ultimas") {
    const c = cuantos(i + 1);
    if (c) return fijo(c.fin, { desde: hoyMs - (c.dias - 1) * DIA_MS, hasta: hoyMs + DIA_MS, etiqueta: `en los últimos ${c.dias} días` });
  }
  if (t === "proximos" || t === "proximas" || (t === "dentro" && w(i + 1) === "de")) {
    const c = cuantos(t === "dentro" ? i + 2 : i + 1);
    if (c) return fijo(c.fin, { desde: hoyMs, hasta: hoyMs + (c.dias + 1) * DIA_MS, etiqueta: `en los próximos ${c.dias} días` });
  }
  const suelto = cuantos(i);
  if (suelto) {
    const c = suelto;
    return {
      fin: c.fin,
      resolver: (s) =>
        s === "futuro"
          ? { desde: hoyMs, hasta: hoyMs + (c.dias + 1) * DIA_MS, etiqueta: `en los próximos ${c.dias} días` }
          : { desde: hoyMs - (c.dias - 1) * DIA_MS, hasta: hoyMs + DIA_MS, etiqueta: `en los últimos ${c.dias} días` },
    };
  }
  return null;
}

/** Un período, con o sin límite delante: «antes del 15 de diciembre», «hasta noviembre». */
function leerPeriodo(tk: Tok[], i: number, hoy: Dia): Lectura | null {
  const w = (k: number) => (tk[k] && !tk[k].usado ? tk[k].t : "");
  let limite: "antes" | "despues" | "hasta" | "desde" | null = null;
  let j = i;
  if ((w(i) === "antes" || w(i) === "despues") && (w(i + 1) === "de" || w(i + 1) === "del")) {
    limite = w(i) as "antes" | "despues";
    j = i + 2;
  } else if (w(i) === "hasta" || w(i) === "desde") {
    limite = w(i) as "hasta" | "desde";
    j = i + 1;
  }
  if (!limite) return leerBase(tk, i, hoy);
  while (ARTICULOS.has(w(j))) j++;
  // «antes de ayer» es anteayer, no «todo lo anterior a ayer».
  if (limite === "antes" && w(j) === "ayer") {
    const hoyMs = medianoche(hoy.y, hoy.m, hoy.d);
    return { fin: j + 1, resolver: () => ({ desde: hoyMs - 2 * DIA_MS, hasta: hoyMs - DIA_MS, etiqueta: "anteayer" }) };
  }
  const base = leerBase(tk, j, hoy);
  if (!base) return null;
  const lim = limite;
  return {
    fin: base.fin,
    resolver: (s) => {
      const p = base.resolver(s);
      const sinPrep = p.etiqueta.replace(/^(en|el) /, "");
      const deL = p.etiqueta.startsWith("el ") ? `del ${sinPrep}` : `de ${sinPrep}`;
      if (lim === "antes") return { hasta: p.desde, etiqueta: `antes ${deL}` };
      if (lim === "despues") return { desde: p.hasta, etiqueta: `después ${deL}` };
      if (lim === "hasta") return { hasta: p.hasta, etiqueta: `hasta ${p.etiqueta.startsWith("en ") ? sinPrep : p.etiqueta}` };
      return { desde: p.desde, etiqueta: `desde ${p.etiqueta.startsWith("en ") ? sinPrep : p.etiqueta}` };
    },
  };
}

// ── Verbos ──────────────────────────────────────────────────────────────────

const VENCE_PRESENTE = new Set(["vence", "vencen", "vencer", "vencera", "venceran", "vencimiento", "vencimientos", "caduca", "caducan", "expira", "expiran"]);
const VENCE_PASADO = new Set([
  "vencio", "vencieron", "vencido", "vencida", "vencidos", "vencidas", "caduco", "caducaron", "caducado", "caducada",
  "caducados", "caducadas", "expiro", "expiraron", "expirado", "expirada", "expirados", "expiradas",
]);
const SUBIDA = new Set([
  "llego", "llegaron", "llegado", "llegada", "llegados", "llegadas", "subi", "subio", "subieron", "subimos", "subido",
  "subida", "subidos", "subidas", "cargue", "cargaron", "cargado", "cargados", "cargada", "cargadas", "recibi",
  "recibido", "recibidos", "recibida", "recibidas", "entro", "entraron", "escaneado", "escaneados", "escaneada",
  "escaneadas", "escanee", "agregado", "agregados", "agregue", "guardado", "guardados", "guarde", "mandaron", "enviaron",
]);

type ClaseVerbo = "vence" | "vencio" | "subido";
interface Verbo {
  i: number;
  clase: ClaseVerbo;
  /** Índices que se van con el verbo («ya», «sin fecha de», «por», «no»). */
  idx: number[];
  /** «sin vencimiento», «no vence». */
  niega: boolean;
  /** «por vencer», «a punto de vencer». */
  porVencer: boolean;
  /** «vencimiento» como sustantivo: con fecha de vencimiento. */
  sustantivo: boolean;
  /** Para la etiqueta de la subida: «llegó ayer» / «subido ayer». */
  llego: boolean;
}

function leerVerbo(tk: Tok[], i: number): Verbo | null {
  const t = tk[i].t;
  const clase: ClaseVerbo | null = VENCE_PRESENTE.has(t) ? "vence" : VENCE_PASADO.has(t) ? "vencio" : SUBIDA.has(t) ? "subido" : null;
  if (!clase) return null;
  const w = (k: number) => (tk[k] && !tk[k].usado ? tk[k].t : "");
  const idx = [i];
  let niega = false;
  let porVencer = false;
  if (clase !== "subido") {
    if (w(i - 1) === "no") {
      niega = true;
      idx.push(i - 1);
    } else {
      // «sin vencimiento», «sin fecha de vencimiento».
      for (let k = i - 1; k >= Math.max(0, i - 3); k--) {
        if (w(k) === "sin") {
          niega = true;
          for (let q = k; q < i; q++) idx.push(q);
          break;
        }
        if (!["fecha", "de", "del", "la"].includes(w(k))) break;
      }
    }
    if (!niega && t === "vencer") {
      if (w(i - 1) === "por" || w(i - 1) === "a") {
        porVencer = true;
        idx.push(i - 1);
        if (["proximo", "proximos", "proxima", "proximas"].includes(w(i - 2))) idx.push(i - 2);
      } else if (w(i - 1) === "de" && w(i - 2) === "punto" && w(i - 3) === "a") {
        porVencer = true;
        idx.push(i - 1, i - 2, i - 3);
      }
    }
    if (!niega && w(i - 1) === "ya") idx.push(i - 1);
    if (!niega && t.startsWith("vencimiento")) {
      if (w(i - 1) === "con") idx.push(i - 1);
      else if (w(i - 1) === "de" && w(i - 2) === "fecha" && w(i - 3) === "con") idx.push(i - 1, i - 2, i - 3);
    }
  }
  return { i, clase, idx, niega, porVencer, sustantivo: t.startsWith("vencimiento"), llego: t.startsWith("lleg") };
}

// ── Tipos de papel ──────────────────────────────────────────────────────────

const HOJAS = ["application/vnd.openxmlformats-officedocument.spreadsheetml", "application/vnd.ms-excel", "application/vnd.oasis.opendocument.spreadsheet", "text/csv"];
const WORD = ["application/vnd.openxmlformats-officedocument.wordprocessingml", "application/msword", "application/vnd.oasis.opendocument.text"];

interface TipoDef {
  claves: string[];
  familia: "papel" | "formato";
  /** Sin `chip`, el chip dice la palabra que escribió. */
  chip?: string;
  grupo: GrupoBusqueda;
  /** Frases de varias palabras que se van con la clave («de cálculo», «nacional de identidad»). */
  sufijos?: string[][];
}

/**
 * Cada tipo con lo que DE VERDAD lo marca en los datos (medido el 22-10 en
 * main y Blas): `aiCategory` está vacío en todos, y `category = facturas` lo
 * tienen también 7 planillas Excel, así que facturas/boletas van por nombre y
 * etiquetas. Además, un papel de un tipo cuenta si está en una carpeta cuyo
 * nombre EMPIEZA con ese tipo («Contratos QA-UI», «Guías forestales (GTF)»).
 */
const TIPOS: TipoDef[] = [
  { claves: ["contrato", "contratos"], familia: "papel", grupo: { categorias: ["contratos"], etiquetas: ["contrato", "contratos"], enNombre: ["contrato"] } },
  { claves: ["dni", "dnis"], familia: "papel", chip: "DNI", grupo: { etiquetas: ["dni", "DNI"], enNombre: ["dni", "documento nacional de identidad"] } },
  { claves: ["documento"], familia: "papel", chip: "DNI", sufijos: [["nacional", "de", "identidad"]], grupo: { etiquetas: ["dni", "DNI"], enNombre: ["dni", "documento nacional de identidad"] } },
  { claves: ["factura", "facturas"], familia: "papel", grupo: { etiquetas: ["factura", "facturas", "casillero:factura"], enNombre: ["factura"] } },
  { claves: ["boleta", "boletas"], familia: "papel", grupo: { etiquetas: ["boleta", "boletas"], enNombre: ["boleta"] } },
  { claves: ["recibo", "recibos"], familia: "papel", grupo: { etiquetas: ["recibo", "recibos", "recibo-pago"], enNombre: ["recibo"] } },
  {
    claves: ["comprobante", "comprobantes"],
    familia: "papel",
    grupo: { etiquetas: ["sunat", "factura", "boleta", "recibo-pago", "casillero:factura"], enNombre: ["factura", "boleta", "recibo", "comprobante"] },
  },
  {
    claves: ["gtf", "gtfs", "guia", "guias"],
    familia: "papel",
    sufijos: [["de", "transporte", "forestal"], ["de", "transporte"], ["forestal"], ["forestales"]],
    grupo: { etiquetas: ["gtf", "GTF", "casillero:gtf"], enNombre: ["gtf", "guia", "guía"] },
  },
  {
    claves: ["permiso", "permisos", "titulo", "titulos", "resolucion", "resoluciones", "autorizacion", "autorizaciones", "concesion", "concesiones"],
    familia: "papel",
    sufijos: [["habilitante"], ["habilitantes"]],
    grupo: {
      etiquetas: ["permiso", "titulo", "resolucion"],
      enNombre: ["permiso", "titulo", "título", "resolucion", "resolución", "autorizacion", "autorización", "concesion", "concesión"],
    },
  },
  { claves: ["planilla", "planillas"], familia: "papel", grupo: { etiquetas: ["planilla", "planillas"], enNombre: ["planilla"], mimes: HOJAS } },
  { claves: ["excel", "xlsx", "xls", "csv"], familia: "formato", chip: "Excel", grupo: { mimes: HOJAS } },
  { claves: ["hoja", "hojas"], familia: "formato", chip: "Excel", sufijos: [["de", "calculo"]], grupo: { mimes: HOJAS } },
  { claves: ["foto", "fotos", "imagen", "imagenes", "captura", "capturas", "jpg", "png"], familia: "formato", grupo: { mimes: ["image/"] } },
  { claves: ["pdf", "pdfs"], familia: "formato", chip: "PDF", grupo: { mimes: ["application/pdf"] } },
  { claves: ["word", "docx"], familia: "formato", chip: "Word", grupo: { mimes: WORD } },
];

/** «hoja» y «documento» solos no son tipo: sólo con su frase completa. */
const SOLO_CON_SUFIJO = new Set(["hoja", "hojas", "documento"]);

const ORIGENES: { claves: string[]; chip: string; grupo?: GrupoBusqueda; favoritos?: boolean }[] = [
  { claves: ["whatsapp", "whatsap", "wsp", "wasap", "wassap", "whats", "wpp", "guasap"], chip: "por WhatsApp", grupo: { etiquetas: ["whatsapp"] } },
  { claves: ["camara", "camaras"], chip: "fotos de las cámaras", grupo: { etiquetas: [TAG_FOTO_PERSONA] } },
  { claves: ["favorito", "favoritos", "favorita", "favoritas", "destacado", "destacados"], chip: "favoritos", favoritos: true },
];

// ── Carpetas ────────────────────────────────────────────────────────────────

/** Singular tosco, igual para los dos lados: «contratos»→«contrato», «resoluciones»→«resolucion». */
const singular = (w: string) => (w.endsWith("ones") ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w);

interface CarpetaPlegada extends CarpetaBuscable {
  palabras: string[];
}

function plegarCarpetas(carpetas: readonly CarpetaBuscable[]): CarpetaPlegada[] {
  return carpetas.map((c) => ({ ...c, palabras: plegar(c.name).split(/[^a-z0-9]+/).filter(Boolean).map(singular) }));
}

/** Carpetas cuyo nombre tiene TODAS esas palabras (enteras). */
const carpetasCon = (palabras: string[], carpetas: CarpetaPlegada[]) => {
  const buscadas = palabras.map(singular);
  return carpetas.filter((c) => buscadas.every((p) => c.palabras.includes(p)));
};

/** Las carpetas y todo lo que cuelga de ellas. */
function conSubcarpetas(ids: string[], carpetas: readonly CarpetaBuscable[]): string[] {
  const hijas = new Map<string, string[]>();
  for (const c of carpetas) if (c.parentId) hijas.set(c.parentId, [...(hijas.get(c.parentId) ?? []), c.id]);
  const todas = new Set<string>();
  const pila = [...ids];
  while (pila.length) {
    const id = pila.pop() as string;
    if (todas.has(id)) continue;
    todas.add(id);
    pila.push(...(hijas.get(id) ?? []));
  }
  return [...todas];
}

const nombreCorto = (n: string) => (n.length > 30 ? `${n.slice(0, 29).trimEnd()}…` : n);
const describirCarpetas = (cs: CarpetaBuscable[]) => `${nombreCorto(cs[0].name)}${cs.length > 1 ? ` (+${cs.length - 1})` : ""}`;

// ── Armado ──────────────────────────────────────────────────────────────────

const unirListas = (a: string[] | undefined, b: string[] | undefined) =>
  a || b ? [...new Set([...(a ?? []), ...(b ?? [])])] : undefined;

function unirGrupos(a: GrupoBusqueda, b: GrupoBusqueda): GrupoBusqueda {
  const g: GrupoBusqueda = {};
  for (const k of ["categorias", "etiquetas", "enNombre", "mimes", "carpetas", "textos"] as const) {
    const v = unirListas(a[k], b[k]);
    if (v) g[k] = v;
  }
  return g;
}

/** Une rangos: lo que cubra a todos (un borde abierto gana). */
function unirRangos(rs: { desde?: number; hasta?: number }[]): { desde?: number; hasta?: number } {
  const desde = rs.every((r) => r.desde !== undefined) ? Math.min(...rs.map((r) => r.desde as number)) : undefined;
  const hasta = rs.every((r) => r.hasta !== undefined) ? Math.max(...rs.map((r) => r.hasta as number)) : undefined;
  return { ...(desde !== undefined ? { desde } : {}), ...(hasta !== undefined ? { hasta } : {}) };
}

/** De días de calendario a ISO; `corrimiento` = LIMA_MS para la subida (instante). */
const aISO = (r: { desde?: number; hasta?: number }, corrimiento = 0): RangoFechas => ({
  ...(r.desde !== undefined ? { desde: new Date(r.desde + corrimiento).toISOString() } : {}),
  ...(r.hasta !== undefined ? { hasta: new Date(r.hasta + corrimiento).toISOString() } : {}),
});

interface Pieza {
  tipo: TipoEntendi;
  texto: string;
  idx: number[];
}

/** La búsqueda sin esos tokens, sin relleno suelto en las puntas. */
function reescribir(tk: Tok[], fuera: Set<number>): string {
  const quedan = tk.filter((_, k) => !fuera.has(k));
  let a = 0;
  let b = quedan.length;
  while (a < b && esVacia(quedan[a].t)) a++;
  while (b > a && esVacia(quedan[b - 1].t)) b--;
  return quedan.slice(a, b).map((x) => x.crudo).join(" ");
}

export function interpretarBusqueda(consulta: string, ctx: ContextoBusqueda = {}): BusquedaInterpretada {
  const tk = tokenizar(consulta);
  const hoy = diaDe((ctx.ahora ?? new Date()).getTime());
  const hoyMs = medianoche(hoy.y, hoy.m, hoy.d);
  const carpetas = ctx.carpetas ? plegarCarpetas(ctx.carpetas) : null;
  const w = (k: number) => (tk[k] && !tk[k].usado ? tk[k].t : "");
  const usar = (idx: number[]) => idx.forEach((k) => tk[k] && (tk[k].usado = true));
  /** Los conectores libres justo antes de `i` («de la», «en el», «por»). */
  const conectoresAntes = (i: number, max = 2) => {
    const idx: number[] = [];
    for (let k = i - 1; k >= 0 && idx.length < max && CONECTORES.has(w(k)); k--) idx.push(k);
    return idx;
  };
  const piezas: Pieza[] = [];
  const grupos: GrupoBusqueda[] = [];
  const venceRangos: { desde?: number; hasta?: number }[] = [];
  const subidoRangos: { desde?: number; hasta?: number }[] = [];
  let sinVencimiento = false;
  let favoritos = false;
  let carpetasDuras: string[] | undefined;
  let necesitaCarpetas = false;

  // 1) Períodos (todavía sin saber si son de vencimiento o de subida).
  const periodos: { a: number; b: number; idx: number[]; lectura: Lectura }[] = [];
  for (let i = 0; i < tk.length; i++) {
    if (tk[i].usado) continue;
    const lectura = leerPeriodo(tk, i, hoy);
    if (!lectura) continue;
    const propios = Array.from({ length: lectura.fin - i }, (_, k) => i + k);
    const idx = [...conectoresAntes(i), ...propios];
    usar(idx);
    periodos.push({ a: Math.min(...idx), b: lectura.fin, idx, lectura });
    i = lectura.fin - 1;
  }

  // 2) Verbos: dicen a qué fecha va cada período.
  const verbos: Verbo[] = [];
  for (let i = 0; i < tk.length; i++) {
    if (tk[i].usado) continue;
    const v = leerVerbo(tk, i);
    if (v) verbos.push(v);
  }
  usar(verbos.flatMap((v) => v.idx));
  const usados = new Set<Verbo>();
  for (const p of periodos) {
    // El verbo más cercano delante (a lo sumo 3 palabras en medio); si no hay, el de atrás.
    const libres = verbos.filter((v) => !v.niega);
    const antes = libres.filter((v) => v.i < p.a && p.a - v.i - 1 <= 3).sort((x, y) => y.i - x.i)[0];
    const despues = libres.filter((v) => v.i >= p.b && v.i - p.b <= 3).sort((x, y) => x.i - y.i)[0];
    const v = antes ?? despues;
    const clase: ClaseVerbo = v ? v.clase : "subido";
    const per = p.lectura.resolver(clase === "vence" ? "futuro" : "pasado");
    const idx = v ? [...p.idx, ...v.idx] : p.idx;
    if (v) usados.add(v);
    if (!v && per.literal) {
      // Año o fecha escritos con números y sin verbo: la fecha del papel.
      grupos.push({ textos: [per.literal], vence: aISO(per) });
      const esAnioSolo = /^en \d{4}$/.test(per.etiqueta);
      piezas.push({ tipo: "papel", texto: esAnioSolo ? `año ${per.literal} (fecha del papel)` : `fecha ${per.etiqueta.replace(/^el /, "")} (en el papel)`, idx });
      continue;
    }
    if (clase === "subido") {
      subidoRangos.push(per);
      piezas.push({ tipo: "subido", texto: `${v?.llego ? "llegó" : "subido"} ${per.etiqueta}`, idx });
      continue;
    }
    // Vencimiento: en presente, lo que falta vencer; en pasado, lo que ya venció.
    const r = { desde: per.desde, hasta: per.hasta };
    const tocaHoy = (r.desde === undefined || r.desde < hoyMs + DIA_MS) && (r.hasta === undefined || r.hasta > hoyMs);
    if (clase === "vence" && tocaHoy && (r.desde === undefined || r.desde < hoyMs)) r.desde = hoyMs;
    if (clase === "vencio" && tocaHoy && (r.hasta === undefined || r.hasta > hoyMs)) r.hasta = hoyMs;
    venceRangos.push(r);
    piezas.push({ tipo: "vence", texto: `${clase === "vence" ? "vence" : "venció"} ${per.etiqueta}`, idx });
  }
  // Verbos de vencimiento que no se llevó ningún período: «vencidos», «por vencer», «sin vencimiento».
  const sueltos = verbos.filter((v) => v.clase !== "subido" && !usados.has(v));
  if (sueltos.length) {
    const v = sueltos[0];
    const idx = sueltos.flatMap((s) => s.idx);
    if (v.niega) {
      sinVencimiento = true;
      piezas.push({ tipo: "vence", texto: "sin vencimiento", idx });
    } else if (v.porVencer) {
      venceRangos.push({ desde: hoyMs, hasta: hoyMs + 31 * DIA_MS });
      piezas.push({ tipo: "vence", texto: "por vencer (próximos 30 días)", idx });
    } else if (v.clase === "vencio") {
      venceRangos.push({ hasta: hoyMs });
      piezas.push({ tipo: "vence", texto: "vencidos", idx });
    } else if (v.sustantivo) {
      venceRangos.push({});
      piezas.push({ tipo: "vence", texto: "con fecha de vencimiento", idx });
    } else {
      venceRangos.push({ desde: hoyMs });
      piezas.push({ tipo: "vence", texto: "vence de hoy en adelante", idx });
    }
  }

  // 3) De dónde llegó: WhatsApp, las cámaras, favoritos.
  for (let i = 0; i < tk.length; i++) {
    const o = ORIGENES.find((x) => x.claves.includes(w(i)));
    if (!o) continue;
    // «whats app» escrito en dos palabras.
    const idx = [...conectoresAntes(i), i, ...(w(i + 1) === "app" ? [i + 1] : [])];
    usar(idx);
    if (o.grupo) grupos.push(o.grupo);
    if (o.favoritos) favoritos = true;
    piezas.push({ tipo: o.favoritos ? "favoritos" : "origen", texto: o.chip, idx });
  }

  // 4) Carpeta pedida: «en Contratos», «en la carpeta de Chivis», «carpeta Pagos».
  for (let i = 0; i < tk.length; i++) {
    if (!["en", "carpeta", "carpetas"].includes(w(i))) continue;
    let j = i + 1;
    while (ARTICULOS.has(w(j)) || w(j) === "carpeta" || (w(j) === "de" && w(i) !== "en")) j++;
    if (!w(j) || esVacia(w(j))) continue;
    if (!carpetas) {
      necesitaCarpetas = true;
      continue;
    }
    for (let k = Math.min(4, tk.length - j); k >= 1; k--) {
      const palabras = tk.slice(j, j + k).map((x) => (x.usado ? "" : x.t));
      if (palabras.some((p) => !p) || esVacia(palabras[k - 1])) continue;
      const cs = carpetasCon(palabras, carpetas);
      if (!cs.length) continue;
      const idx = Array.from({ length: j + k - i }, (_, q) => i + q);
      usar(idx);
      carpetasDuras = conSubcarpetas(cs.map((c) => c.id), carpetas);
      piezas.push({ tipo: "carpeta", texto: `carpeta ${describirCarpetas(cs)}`, idx });
      break;
    }
  }

  // 5) Tipos de papel y de archivo: dentro de una familia se suman, entre familias se cruzan.
  const porFamilia = new Map<string, GrupoBusqueda>();
  for (let i = 0; i < tk.length; i++) {
    const t = w(i);
    const def = t ? TIPOS.find((d) => d.claves.includes(t)) : undefined;
    if (!def) continue;
    const suf = def.sufijos?.find((s) => s.every((p, k) => w(i + 1 + k) === p));
    if (!suf && SOLO_CON_SUFIJO.has(t)) continue;
    const idx = Array.from({ length: 1 + (suf?.length ?? 0) }, (_, k) => i + k);
    usar(idx);
    let grupo = def.grupo;
    if (!carpetas && def.familia === "papel") necesitaCarpetas = true;
    if (carpetas && def.familia === "papel") {
      // Papeles guardados en una carpeta que se llama como el tipo.
      const claves = new Set(def.claves.map(singular));
      const cs = carpetas.filter((c) => c.palabras[0] && claves.has(c.palabras[0]));
      if (cs.length) grupo = { ...grupo, carpetas: conSubcarpetas(cs.map((c) => c.id), carpetas) };
    }
    const previo = porFamilia.get(def.familia);
    porFamilia.set(def.familia, previo ? unirGrupos(previo, grupo) : grupo);
    const limpio = tk.slice(i, i + idx.length).map((x) => x.crudo.replace(/[^\p{L}\p{N} -]/gu, "")).join(" ").toLowerCase();
    piezas.push({ tipo: "tipo", texto: def.chip ?? limpio, idx });
  }
  grupos.push(...porFamilia.values());

  // 6) Lo que queda: relleno fuera; una palabra que nombra a una carpeta busca en
  //    la carpeta O en el texto; el resto, texto (todas tienen que estar).
  const texto: string[] = [];
  for (let i = 0; i < tk.length; i++) {
    const t = w(i);
    if (!t || esVacia(t) || SUBIDA.has(t)) {
      tk[i].usado = true;
      continue;
    }
    const puedeSerCarpeta = t.length >= 3 && !/^\d+$/.test(t);
    if (puedeSerCarpeta && !carpetas) necesitaCarpetas = true;
    const cs = puedeSerCarpeta && carpetas ? carpetasCon([t], carpetas) : [];
    if (cs.length && carpetas) {
      grupos.push({ carpetas: conSubcarpetas(cs.map((c) => c.id), carpetas), textos: [tk[i].crudo] });
      piezas.push({ tipo: "carpeta", texto: `carpeta ${describirCarpetas(cs)} o texto «${tk[i].crudo}»`, idx: [i] });
    } else {
      texto.push(tk[i].crudo);
      piezas.push({ tipo: "texto", texto: `texto: ${tk[i].crudo}`, idx: [i] });
    }
    tk[i].usado = true;
  }

  const orden: TipoEntendi[] = ["tipo", "vence", "subido", "papel", "origen", "favoritos", "carpeta", "texto"];
  const entendi = piezas
    .map((p) => ({ p, primero: Math.min(...p.idx) }))
    .sort((a, b) => orden.indexOf(a.p.tipo) - orden.indexOf(b.p.tipo) || a.primero - b.primero)
    .map(({ p }) => ({ tipo: p.tipo, texto: p.texto, sinEsto: reescribir(tk, new Set(p.idx)) }));

  return {
    texto: texto.join(" "),
    ...(venceRangos.length ? { vence: aISO(unirRangos(venceRangos)) } : sinVencimiento ? { vence: "sin" as const } : {}),
    ...(subidoRangos.length ? { subido: aISO(unirRangos(subidoRangos), LIMA_MS) } : {}),
    ...(carpetasDuras ? { carpetas: carpetasDuras } : {}),
    grupos,
    ...(favoritos ? { favoritos: true } : {}),
    entendi,
    necesitaCarpetas,
    soloRelleno: tk.length > 0 && piezas.length === 0,
  };
}

/**
 * Saca de los términos de la IA los que son puro relleno: «que», «este» o «lo
 * que» están en casi todos los papeles y, sumados con OR, traían el drive entero.
 */
export function quitarVacias(terminos: readonly string[]): string[] {
  return terminos.filter((t) => plegar(t).split(/[^a-z0-9]+/).some((p) => p.length > 1 && !VACIAS.has(p)));
}

/** ¿Entendió algo más que palabras sueltas? (para no dibujar «Entendí: texto: x»). */
export function entendioAlgo(b: Pick<BusquedaInterpretada, "entendi">): boolean {
  return b.entendi.some((c) => c.tipo !== "texto");
}
