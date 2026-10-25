/**
 * «Escribe o dicta» del alta de adelanto: una frase como se dice en el patio →
 * los campos del alta. PURO: texto entra, campos salen. Lo usan el micrófono
 * (Web Speech, es-PE) y lo que se escribe a mano o con Handy, que tipea en el
 * campo enfocado: las dos entradas pasan por acá igual.
 *
 *   «le di 500 a Wasaco por aserrío»         → doy plata · 500 · Wasaco · «aserrío»
 *   «mil doscientos a la mamá de Alex por la primera carga» → 1200 · «primera carga»
 *   «Wasaco me prestó 300»                   → me prestan · 300 · Wasaco
 *   «Wasaco me adelantó 1731 por el aserrío» → me adelantan por un servicio
 *   «Quispe me devolvió 500 ayer por yape»   → me pagan lo que me deben · ayer · Yape
 *
 * POR QUÉ NO EL DEL CUBICADOR (ADR-419). `wordsToDigits` de
 * `lib/forestal/cubicacion` topea en 999 a propósito (un «2810» dictado es
 * 2 × 8 × 10) y no está exportado; acá la plata pasa de mil todo el tiempo.
 *
 * NUNCA DECIDE A LA PERSONA: devuelve el nombre COMO SE DIJO y la pantalla lo
 * busca entre las personas (`leer-comprobante-persona`). Nunca guarda: el
 * alta queda prellenada y la persona confirma.
 */

import type { ModoAlta } from "./modos-alta";

export type MetodoDictado = "efectivo" | "yape" | "plin" | "transferencia";

export interface DictadoAdelanto {
  /** `null` = la frase no dice quién puso la plata: se deja el que está. */
  modo: ModoAlta | null;
  monto: number | null;
  /** `null` = no se dijo (soles por defecto en la pantalla). */
  moneda: "PEN" | "USD" | null;
  /** La persona como se dijo («Wasaco», «la mamá de Alex» → «Mamá de Alex»). */
  nombre: string | null;
  nota: string | null;
  /** AAAA-MM-DD; `null` = no se dijo (hoy). */
  fecha: string | null;
  metodo: MetodoDictado | null;
}

// ── Números dichos ───────────────────────────────────────────────────────────
const UNIDADES: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18,
  diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22, veintitres: 23,
  veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
};
const DECENAS: Record<string, number> = { treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 };
const CENTENAS: Record<string, number> = {
  cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300, cuatrocientos: 400,
  cuatrocientas: 400, quinientos: 500, quinientas: 500, seiscientos: 600, seiscientas: 600, setecientos: 700,
  setecientas: 700, ochocientos: 800, ochocientas: 800, novecientos: 900, novecientas: 900,
};

const esPalabraNumero = (t: string) => t in UNIDADES || t in DECENAS || t in CENTENAS || t === "mil";

/** «1.200», «1,200», «1200.50», «1 200» ya juntado → número. */
function numeroDeCifra(t: string): number | null {
  if (!/^\d[\d.,]*$/.test(t)) return null;
  const m = /^(\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,](\d{1,2}))?$/.exec(t);
  if (!m) return null;
  const n = Number(`${m[1].replace(/[.,]/g, "")}.${m[2] ?? "0"}`);
  return Number.isFinite(n) ? n : null;
}

interface Numero {
  valor: number;
  /** Índices de token [desde, hasta). */
  desde: number;
  hasta: number;
}

/**
 * Los números de una frase ya tokenizada, en palabras, en cifras o mezclados
 * («mil 200», «2 mil quinientos»): `mil` multiplica lo de antes y suma lo de
 * después. «con 50» detrás de un número son los céntimos.
 */
export function numerosDeTokens(tokens: readonly string[]): Numero[] {
  const out: Numero[] = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    const cifra = numeroDeCifra(t);
    if (cifra == null && !esPalabraNumero(t)) {
      i++;
      continue;
    }
    const desde = i;
    let total = 0;
    let actual = 0;
    let algo = false;
    let ultimaCifra = false;
    while (i < tokens.length) {
      const w = tokens[i];
      const c = numeroDeCifra(w);
      if (c != null) {
        /* Dos cifras seguidas son dos números («500 300»), salvo después de «mil». */
        if (ultimaCifra || (algo && actual >= 1)) break;
        actual += c;
        ultimaCifra = true;
      } else if (w === "mil") {
        total += (actual || 1) * 1000;
        actual = 0;
        ultimaCifra = false;
      } else if (w in CENTENAS) {
        if (actual % 1000 >= 100 || ultimaCifra) break;
        actual += CENTENAS[w];
      } else if (w in DECENAS) {
        if (actual % 100 >= 10 || ultimaCifra) break;
        actual += DECENAS[w];
        if (tokens[i + 1] === "y" && tokens[i + 2] in UNIDADES && UNIDADES[tokens[i + 2]] < 10) {
          actual += UNIDADES[tokens[i + 2]];
          i += 2;
        }
      } else if (w in UNIDADES) {
        if (actual % 100 >= 1 || ultimaCifra) break;
        actual += UNIDADES[w];
      } else break;
      algo = true;
      i++;
    }
    let valor = total + actual;
    /* «quinientos con cincuenta (céntimos)». */
    if (tokens[i] === "con") {
      const cent = numerosDeTokens(tokens.slice(i + 1, i + 4))[0];
      if (cent && cent.desde === 0 && cent.valor < 100) {
        valor += cent.valor / 100;
        i += 1 + cent.hasta;
        if (tokens[i] === "centimos" || tokens[i] === "centavos") i++;
      }
    }
    /* «le di UN adelanto», «UNA carga»: el artículo no es un monto («una luca» sí). */
    const soloArticulo = i - desde === 1 && /^(?:un|una|uno)$/.test(tokens[desde]) && !MONEDA_SOLES.test(tokens[i] ?? "") && !MONEDA_DOLARES.test(tokens[i] ?? "");
    if (!soloArticulo) out.push({ valor: Math.round(valor * 100) / 100, desde, hasta: i });
  }
  return out;
}

// ── Frase ────────────────────────────────────────────────────────────────────
/** Minúsculas y sin tildes, conservando la ñ y el largo (para recortar el original). */
function plano(s: string): string {
  /* Por unidad UTF-16 (no por letra): los índices tienen que calzar con el original. */
  return Array.from({ length: s.length }, (_, i) => s[i])
    .map((ch) => {
      const l = ch.toLowerCase();
      if (l === "ñ") return l;
      const sin = l.normalize("NFD").replace(/[̀-ͯ]/g, "");
      return sin.length === 1 ? sin : l.length === 1 ? l : "?";
    })
    .join("");
}

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9,
  octubre: 10, noviembre: 11, diciembre: 12,
};
const DIAS_SEMANA = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

const dos = (n: number) => String(n).padStart(2, "0");
function isoDe(d: Date): string {
  return `${d.getUTCFullYear()}-${dos(d.getUTCMonth() + 1)}-${dos(d.getUTCDate())}`;
}
function diaUTC(hoy: string): Date {
  const [a, m, d] = hoy.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}
function menosDias(hoy: string, n: number): string {
  const d = diaUTC(hoy);
  d.setUTCDate(d.getUTCDate() - n);
  return isoDe(d);
}
function fechaValida(a: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCDate() === d ? isoDe(f) : null;
}

interface Tramo {
  desde: number;
  hasta: number;
}

/** La fecha dicha y los tokens que ocupa (para que no se lean como monto ni como nota). */
function fechaDe(tokens: readonly string[], numeros: readonly Numero[], hoy: string): { fecha: string; tramo: Tramo } | null {
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "hoy") return { fecha: hoy, tramo: { desde: i, hasta: i + 1 } };
    if (t === "ayer") return { fecha: menosDias(hoy, 1), tramo: { desde: i, hasta: i + 1 } };
    if (t === "anteayer" || t === "antier") return { fecha: menosDias(hoy, 2), tramo: { desde: i, hasta: i + 1 } };
    if (t === "antes" && tokens[i + 1] === "de" && tokens[i + 2] === "ayer") return { fecha: menosDias(hoy, 2), tramo: { desde: i, hasta: i + 3 } };
    const dia = DIAS_SEMANA.indexOf(t);
    if (dia >= 0) {
      /* «el lunes» = el último lunes (hoy, si hoy es lunes): se anota lo que ya pasó. */
      const hoyDia = diaUTC(hoy).getUTCDay();
      const desde = tokens[i - 1] === "el" ? i - 1 : i;
      return { fecha: menosDias(hoy, (hoyDia - dia + 7) % 7), tramo: { desde, hasta: i + 1 } };
    }
  }
  /* «el 20», «el 20 de octubre», «el 20/10». */
  for (let i = 0; i < tokens.length; i++) {
    const fm = /^(\d{1,2})\/(\d{1,2})$/.exec(tokens[i]);
    if (fm) {
      const [a] = hoy.split("-").map(Number);
      let f = fechaValida(a, Number(fm[2]), Number(fm[1]));
      if (f && f > hoy) f = fechaValida(a - 1, Number(fm[2]), Number(fm[1]));
      if (f) return { fecha: f, tramo: { desde: tokens[i - 1] === "el" ? i - 1 : i, hasta: i + 1 } };
    }
    if (tokens[i] !== "el") continue;
    const n = numeros.find((x) => x.desde === i + 1);
    if (!n || n.valor < 1 || n.valor > 31 || !Number.isInteger(n.valor)) continue;
    const [a, m] = hoy.split("-").map(Number);
    const mes = tokens[n.hasta] === "de" ? MESES[tokens[n.hasta + 1]] : undefined;
    let hasta = mes ? n.hasta + 2 : n.hasta;
    let f: string | null;
    if (mes) {
      f = fechaValida(a, mes, n.valor);
      if (f && f > hoy) f = fechaValida(a - 1, mes, n.valor);
    } else {
      f = fechaValida(a, m, n.valor);
      if (f && f > hoy) f = m === 1 ? fechaValida(a - 1, 12, n.valor) : fechaValida(a, m - 1, n.valor);
    }
    if (tokens[hasta] === "pasado") hasta++;
    if (f) return { fecha: f, tramo: { desde: i, hasta } };
  }
  return null;
}

const UNIDAD_NO_PLATA = /^(?:pt|pies?|pie|tablares?|piezas?|trozas?|cargas?|metros?|m3|kilos?|kg|dias?|semanas?|meses|horas?|camiones?|viajes?|tablas?|arboles?)$/;
const MONEDA_SOLES = /^(?:soles|sol|lucas|luca|s\/)$/;
const MONEDA_DOLARES = /^(?:dolares|dolar|\$)$/;

/** El monto: el que lleva «soles/lucas/dólares», si no el primero que no es fecha ni cantidad de madera. */
function montoDe(tokens: readonly string[], numeros: readonly Numero[], fecha: Tramo | null) {
  const libres = numeros.filter((n) => !(fecha && n.desde >= fecha.desde && n.desde < fecha.hasta) && !UNIDAD_NO_PLATA.test(tokens[n.hasta] ?? ""));
  const conMoneda = libres.find((n) => MONEDA_SOLES.test(tokens[n.hasta] ?? "") || MONEDA_DOLARES.test(tokens[n.hasta] ?? "") || /^(?:s\/|\$)$/.test(tokens[n.desde - 1] ?? ""));
  const n = conMoneda ?? libres.find((x) => x.valor > 0);
  if (!n) return null;
  const sig = tokens[n.hasta] ?? "";
  const antes = tokens[n.desde - 1];
  const moneda: "PEN" | "USD" | null = MONEDA_DOLARES.test(sig) || antes === "$" ? "USD" : MONEDA_SOLES.test(sig) || antes === "s/" ? "PEN" : null;
  const hasta = MONEDA_SOLES.test(sig) || MONEDA_DOLARES.test(sig) ? n.hasta + 1 : n.hasta;
  return { valor: n.valor, moneda, tramo: { desde: tokens[n.desde - 1] === "s/" || tokens[n.desde - 1] === "$" ? n.desde - 1 : n.desde, hasta } };
}

/* El verbo dice quién puso la plata. Va sobre el texto plano (sin tildes). */
const ME = String.raw`(?:me|nos)`;
const RE_PRESTAMO = new RegExp(String.raw`\b${ME}\s+(?:presto|prestaron|hizo\s+un\s+prestamo)\b`);
const RE_ABONO = new RegExp(String.raw`\b${ME}\s+(?:devolvio|devolvieron|abono|abonaron|amortizo|cancelo|pago\s+lo\s+que)\b|\b(?:devolvio|abono|amortizo)\b`);
const RE_SERVICIO = new RegExp(String.raw`\b${ME}\s+(?:adelanto|adelantaron|pago\s+adelantado|dio\s+(?:un\s+)?adelanto)\b`);
const RE_RECIBI = new RegExp(String.raw`\b${ME}\s+(?:pago|pagaron|dio|dieron|yapeo|yapearon|transfirio|deposito|mando|paso|entrego)\b|\brecibi\b`);
const RE_DEBE = /\b(?:debe|debia|deuda|lo\s+que\s+(?:le|me)\s+(?:di|debe|debia)|a\s+cuenta)\b/;
const RE_DAR = /\b(?:le|les)\s+(?:di|dimos|preste|prestamos|adelante|adelantamos|pague|pagamos|entregue|pase|mande|yapee|deposite|transferi)\b|^(?:di|preste|adelante|entregue|yapee|pague)\b|\badelanto\s+(?:a|para)\b/;

/** Los verbos y palabras-gancho que no son ni persona ni nota. */
const VERBO = /^(?:le|les|me|nos|di|dimos|dio|dieron|preste|prestamos|presto|prestaron|adelante|adelanto|adelantaron|adelantamos|pague|pago|pagaron|pagamos|entregue|entrego|pase|paso|mande|mando|yapee|yapeo|yapearon|deposite|deposito|transferi|transfirio|devolvio|devolvieron|abono|abonaron|amortizo|cancelo|recibi|hizo|un|prestamo|adelantado)$/;

const MEDIO: { re: RegExp; metodo: MetodoDictado }[] = [
  { re: /^(?:yape|yapee|yapeo|yapearon|yapeado)$/, metodo: "yape" },
  { re: /^(?:plin|plinee|plineo)$/, metodo: "plin" },
  { re: /^(?:transferencia|transferi|transfirio|deposito|deposite|banco)$/, metodo: "transferencia" },
  { re: /^(?:efectivo|cash|mano)$/, metodo: "efectivo" },
];
const metodoDeToken = (t: string): MetodoDictado | null => MEDIO.find((m) => m.re.test(t))?.metodo ?? null;

/** Fin de un nombre o de una nota: otra parte de la frase empieza acá. */
const CORTE = /^(?:por|para|con|en|el|ayer|hoy|anteayer|antier|que|le|les|me|nos|y|pero|como)$/;
const ARTICULOS = /^(?:el|la|los|las|un|una|al|del)$/;
/** «a cuenta», «a las 5», «a plazo»: el «a» que no presenta a nadie. */
const NO_PERSONA = /^(?:cuenta|credito|plazo|cuotas?|fin|las|los|tiempo|medias|mano|devolver|pagar)$/;

/** «la mamá de Alex» → «Mamá de Alex»: mayúscula a cada palabra salvo los conectores. */
function comoNombrePropio(palabras: string[]): string {
  return palabras
    .map((w, i) => (i > 0 && /^(?:de|del|la|las|los|y|e)$/i.test(w) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

function sinArticuloInicial<T>(xs: T[], plano: (x: T) => string): T[] {
  let i = 0;
  while (i < xs.length - 1 && ARTICULOS.test(plano(xs[i]))) i++;
  return xs.slice(i);
}

/**
 * Lee una frase dicha o escrita. `hoy` (AAAA-MM-DD) resuelve «ayer», «el lunes» y «el 20».
 */
export function leerDictadoAdelanto(frase: string, opts: { hoy: string }): DictadoAdelanto {
  const original = frase.normalize("NFC");
  const p = plano(original);
  /* Tokens con su texto original al lado (para devolver «Mamá» con tilde). */
  const re = /s\/\.?|\$|[a-zñ0-9][a-zñ0-9.,/]*/g;
  const toks: { t: string; o: string }[] = [];
  for (const m of p.matchAll(re)) {
    const t = m[0].replace(/[.,]+$/, "").replace(/^s\/\.?$/, "s/");
    if (!t) continue;
    toks.push({ t, o: original.slice(m.index, m.index + m[0].length).replace(/[.,]+$/, "") });
  }
  const tokens = toks.map((x) => x.t);
  const numeros = numerosDeTokens(tokens);
  const fecha = fechaDe(tokens, numeros, opts.hoy);
  const plata = montoDe(tokens, numeros, fecha?.tramo ?? null);

  const texto = tokens.join(" ");
  const modo: ModoAlta | null = RE_PRESTAMO.test(texto)
    ? "prestamo"
    : RE_SERVICIO.test(texto)
      ? "servicio"
      : RE_ABONO.test(texto)
        ? "abono"
        : RE_RECIBI.test(texto)
          ? RE_DEBE.test(texto)
            ? "abono"
            : /\bpor\s+(?:el|la|un|una)?\s*(?:servicio|aserrio|corte|flete|trabajo|habilitado|secado|cepillado)/.test(texto)
              ? "servicio"
              : "abono"
          : RE_DAR.test(texto)
            ? "dar"
            : null;

  /* Los tramos ya usados (monto, fecha, medio de pago) no son persona ni nota. */
  const usado = new Array<boolean>(tokens.length).fill(false);
  const marcar = (tr: Tramo | null | undefined) => {
    if (tr) for (let i = tr.desde; i < tr.hasta; i++) usado[i] = true;
  };
  marcar(plata?.tramo);
  marcar(fecha?.tramo);
  let metodo: MetodoDictado | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const m = metodoDeToken(tokens[i]);
    if (!m) continue;
    /* «por yape», «en efectivo», «al yape», «le yapeé»: el medio y su preposición. */
    const prev = tokens[i - 1];
    if (tokens[i] === "banco" && !/^(?:por|al|del|en)$/.test(prev ?? "")) continue;
    metodo = m;
    usado[i] = !VERBO.test(tokens[i]) || /^(?:yapee|yapeo|yapearon)$/.test(tokens[i]) ? true : usado[i];
    if (/^(?:por|en|al|un|con|del|a)$/.test(prev ?? "")) usado[i - 1] = true;
  }

  const tramoLibre = (desde: number): number[] => {
    const idx: number[] = [];
    for (let i = desde; i < tokens.length && !usado[i] && !(idx.length && CORTE.test(tokens[i])) && !esPalabraNumero(tokens[i]) && numeroDeCifra(tokens[i]) == null; i++) {
      if (VERBO.test(tokens[i]) && !idx.length) break;
      idx.push(i);
    }
    return idx;
  };

  // Persona: «<nombre> me prestó» (recibido), «a <nombre>» (dar) o «me prestó <nombre>».
  const sinArt = (idx: number[]) => sinArticuloInicial(idx, (j) => tokens[j]);
  let nombreIdx: number[] = [];
  const iMe = tokens.findIndex((t, i) => (t === "me" || t === "nos") && VERBO.test(tokens[i + 1] ?? ""));
  if (iMe > 0) {
    /* Hacia atrás desde el «me»: «la mamá de Alex me prestó» («de» no corta). */
    const idx: number[] = [];
    for (let k = iMe - 1; k >= 0 && !usado[k] && !CORTE.test(tokens[k]) && !VERBO.test(tokens[k]) && numeroDeCifra(tokens[k]) == null && !esPalabraNumero(tokens[k]); k--) idx.unshift(k);
    nombreIdx = sinArt(idx);
  }
  for (let i = 0; i < tokens.length && !nombreIdx.length; i++) {
    const t = tokens[i];
    if ((t !== "a" && t !== "al" && t !== "para") || usado[i] || NO_PERSONA.test(tokens[i + 1] ?? "")) continue;
    /* «para gasolina» es la nota; «para Wasaco», la persona: con «para» sólo
       vale un nombre escrito o dictado con mayúscula. */
    if (t === "para" && !/^\p{Lu}/u.test(toks[i + 1]?.o ?? "")) continue;
    const idx = sinArt(tramoLibre(i + 1));
    if (idx.length && !(idx.length === 1 && ARTICULOS.test(tokens[idx[0]]))) nombreIdx = idx;
  }
  /* «me prestó Wasaco 300»: el nombre después del verbo. */
  if (!nombreIdx.length && iMe >= 0) nombreIdx = sinArt(tramoLibre(iMe + 2));
  for (const i of nombreIdx) usado[i] = true;
  const nombre = nombreIdx.length ? comoNombrePropio(nombreIdx.map((i) => toks[i].o)) : null;

  // Nota: lo que sigue a «por» / «para» y no es persona, plata, fecha ni medio.
  let nota: string | null = null;
  for (let i = 0; i < tokens.length && !nota; i++) {
    if ((tokens[i] !== "por" && tokens[i] !== "para") || usado[i]) continue;
    const idx: number[] = [];
    for (let j = i + 1; j < tokens.length && !usado[j]; j++) {
      if (idx.length && /^(?:ayer|hoy|anteayer|antier|le|les|me|nos)$/.test(tokens[j])) break;
      idx.push(j);
    }
    let limpio = sinArticuloInicial(idx, (j) => tokens[j]);
    if (limpio.length && tokens[limpio[0]] === "que") limpio = limpio.slice(1);
    /* «por el aserrío de la troza» queda entero; un artículo suelto al final, no. */
    while (limpio.length && /^(?:el|la|los|las|de|del|y|en|por|para)$/.test(tokens[limpio.at(-1)!])) limpio = limpio.slice(0, -1);
    if (limpio.length) nota = limpio.map((j) => toks[j].o).join(" ");
  }

  return {
    modo,
    monto: plata?.valor ?? null,
    moneda: plata?.moneda ?? null,
    nombre,
    nota,
    fecha: fecha?.fecha ?? null,
    metodo,
  };
}
