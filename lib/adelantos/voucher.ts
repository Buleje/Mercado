/**
 * Leer un voucher —captura de Yape, Plin o de una transferencia BCP, Interbank,
 * BBVA— a partir del texto que devuelve el OCR del navegador
 * (`lib/ocr/ocr-navegador.ts`). Función PURA: texto entra, campos salen.
 *
 * POR QUÉ. De 8 adelantos de Blas, 0 tenían foto o recibo (29-09): la plata
 * sale por Yape, el voucher queda en el celular y nadie lo copia al alta.
 * Con esto se sube la captura y el alta se PRELLENA — nunca se guarda sola: la
 * persona revisa y confirma con el botón de siempre.
 *
 * LO QUE NO HACE. No decide la dirección (dado / recibido): un voucher de Yape
 * es igual si la plata salió o entró. Tampoco elige a la persona: el nombre del
 * voucher sólo sirve para avisar si no se parece a la elegida.
 *
 * PLATA. El monto sale como NÚMERO con dos decimales, nunca el texto; y es sólo
 * un borrador: el total que vale lo calcula el servidor al guardar.
 */

export type AppVoucher = "YAPE" | "PLIN" | "BCP" | "INTERBANK" | "BBVA" | "SCOTIABANK" | "BN";

export interface VoucherLeido {
  /** De qué app o banco es; `null` = no se reconoció. */
  app: AppVoucher | null;
  /** Monto con dos decimales; `null` = no se encontró (y entonces no se prellena nada). */
  monto: number | null;
  moneda: "PEN" | "USD";
  /** AAAA-MM-DD. */
  fecha: string | null;
  /** HH:MM en 24 h. */
  hora: string | null;
  operacion: string | null;
  destinatario: string | null;
}

const ETIQUETA_APP: Record<AppVoucher, string> = {
  YAPE: "Yape",
  PLIN: "Plin",
  BCP: "BCP",
  INTERBANK: "Interbank",
  BBVA: "BBVA",
  SCOTIABANK: "Scotiabank",
  BN: "Banco de la Nación",
};

export const etiquetaApp = (app: AppVoucher | null) => (app ? ETIQUETA_APP[app] : "Voucher");

/** Con qué medio se movió la plata, en los ids de «¿De dónde sale?» del alta. */
export function metodoDeVoucher(app: AppVoucher | null): "yape" | "plin" | "transferencia" | null {
  if (!app) return null;
  if (app === "YAPE") return "yape";
  if (app === "PLIN") return "plin";
  return "transferencia";
}

// ── Limpieza del ruido del OCR ───────────────────────────────────────────────
const LETRA = "A-Za-zÁÉÍÓÚÜÑáéíóúüñ";

/**
 * La O que el OCR pone por un 0 y la l/I por un 1, SÓLO pegadas a un número
 * («S/ 1.250,0O», «O8:15», «2O26»). Dentro de una palabra no se tocan: «Nro.»
 * seguido de dígitos sigue siendo «Nro.».
 */
function corregirDigitos(linea: string): string {
  return linea
    .replace(new RegExp(`(?<=\\d[.,:]?)[Oo](?![${LETRA}])|(?<![${LETRA}])[Oo](?=[.,:]?\\d)`, "g"), "0")
    .replace(new RegExp(`(?<=\\d[.,:]?)[lI](?![${LETRA}])|(?<![${LETRA}])[lI](?=[.,:]?\\d)`, "g"), "1");
}

function lineasDe(texto: string): string[] {
  return texto
    .split(/\r?\n/)
    .map((l) => corregirDigitos(l.replace(/\s+/g, " ").trim()))
    .filter(Boolean);
}

// ── App ──────────────────────────────────────────────────────────────────────
function appDe(texto: string): AppVoucher | null {
  /* Plin vive dentro de la app de un banco: si dice Plin, es Plin. Yape gana a
     todo: un «yapeo» desde la app del BCP sigue siendo un Yape. */
  if (/yape/i.test(texto)) return "YAPE";
  if (/\bplin/i.test(texto)) return "PLIN";
  if (/interbank/i.test(texto)) return "INTERBANK";
  if (/bbva/i.test(texto)) return "BBVA";
  if (/\bbcp\b|banco de cr[eé]dito/i.test(texto)) return "BCP";
  if (/scotiabank/i.test(texto)) return "SCOTIABANK";
  if (/banco de la naci[oó]n/i.test(texto)) return "BN";
  return null;
}

// ── Monto ────────────────────────────────────────────────────────────────────
/** Un número con miles (punto, coma o espacio) y hasta 2 decimales. */
const NUM = String.raw`(?:\d{1,3}(?:[ .,]\d{3})+|\d+)(?:[.,]\d{1,2})?(?!\d)`;
const RE_CON_MONEDA = new RegExp(String.raw`(?<![A-Za-z0-9])(US\s?\$|\$|[Ss]\s?\/\s?\.?)\s*(${NUM})`, "g");
/** Sin símbolo sólo vale con etiqueta Y con decimales: «Monto: 300.00». */
const RE_CON_ETIQUETA = new RegExp(String.raw`(?:monto|importe|total)[^0-9]{0,25}?((?:\d{1,3}(?:[ .,]\d{3})+|\d+)[.,]\d{2})(?!\d)`, "gi");
const PISTA_MONTO = /monto|importe|total|yapeaste|pagaste|enviaste|transferi|plineaste|pago exitoso|enviado|recibiste/i;
/** Otras cifras que trae un voucher y no son la plata movida. */
const NO_ES_EL_MONTO = /comisi|\bitf\b|saldo|disponible|l[ií]mite|cargo|cashback|puntos|tipo de cambio/i;

/** «1,250.00» · «1.250,00» · «1 250,00» · «300» → número. El último separador con 1-2 dígitos detrás es el decimal. */
export function aNumero(token: string): number | null {
  const t = token.replace(/\s/g, "");
  let entero = t;
  let dec = "";
  const ultimo = Math.max(t.lastIndexOf("."), t.lastIndexOf(","));
  if (ultimo >= 0 && t.length - ultimo - 1 <= 2) {
    entero = t.slice(0, ultimo);
    dec = t.slice(ultimo + 1);
  }
  const limpio = entero.replace(/[.,]/g, "");
  if (!/^\d+$/.test(limpio)) return null;
  const n = Number(`${limpio}.${dec || "0"}`);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

type Moneda = "PEN" | "USD";

/** El monto y el renglón donde está (el nombre de Yape va justo debajo). */
function montoDe(lineas: string[]): { monto: number; moneda: Moneda; linea: number } | null {
  let mejor: { monto: number; moneda: Moneda; linea: number; puntos: number } | null = null;
  for (const [i, linea] of lineas.entries()) {
    if (NO_ES_EL_MONTO.test(linea)) continue;
    const pista = PISTA_MONTO.test(linea) || (i > 0 && PISTA_MONTO.test(lineas[i - 1]));
    const candidatos: { monto: number | null; moneda: Moneda; puntos: number }[] = [];
    for (const m of linea.matchAll(RE_CON_MONEDA)) {
      candidatos.push({ monto: aNumero(m[2]), moneda: m[1].includes("$") ? "USD" : "PEN", puntos: 1 + (pista ? 2 : 0) });
    }
    for (const m of linea.matchAll(RE_CON_ETIQUETA)) {
      candidatos.push({ monto: aNumero(m[1]), moneda: "PEN", puntos: 2 });
    }
    for (const c of candidatos) {
      /* El primero con más puntos: el monto grande va arriba en todas las apps. */
      if (c.monto != null && c.monto > 0 && c.monto < 10_000_000 && (!mejor || c.puntos > mejor.puntos)) {
        mejor = { monto: c.monto, moneda: c.moneda, linea: i, puntos: c.puntos };
      }
    }
  }
  return mejor && { monto: mejor.monto, moneda: mejor.moneda, linea: mejor.linea };
}

// ── Fecha y hora ─────────────────────────────────────────────────────────────
const MESES: Record<string, number> = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, set: 9, sep: 9, oct: 10, nov: 11, dic: 12 };
const RE_FECHA_TEXTO = /(?<!\d)(\d{1,2})\s*(?:de\s+)?(ene|feb|mar|abr|may|jun|jul|ago|sept?|oct|nov|dic)[a-záéíóú]*\.?,?\s*(?:(?:de|del)\s+)?(\d{4})?/i;
const RE_FECHA_NUM = /(?<!\d)(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)/;
const RE_FECHA_ISO = /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/;

const dos = (n: number) => String(n).padStart(2, "0");

function fechaValida(a: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || a < 2000 || a > 2100) return null;
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCDate() === d ? `${a}-${dos(m)}-${dos(d)}` : null;
}

function fechaDe(lineas: string[], hoy: string): string | null {
  const anioHoy = Number(hoy.slice(0, 4));
  for (const linea of lineas) {
    const iso = RE_FECHA_ISO.exec(linea);
    if (iso) {
      const f = fechaValida(Number(iso[1]), Number(iso[2]), Number(iso[3]));
      if (f) return f;
    }
    const tx = RE_FECHA_TEXTO.exec(linea);
    if (tx) {
      const mes = MESES[tx[2].slice(0, 3).toLowerCase()];
      const dia = Number(tx[1]);
      if (tx[3]) {
        const f = fechaValida(Number(tx[3]), mes, dia);
        if (f) return f;
      } else {
        /* Sin año: el de hoy, salvo que caiga en el futuro (un voucher de diciembre leído en enero). */
        const f = fechaValida(anioHoy, mes, dia);
        if (f) return f > hoy ? fechaValida(anioHoy - 1, mes, dia) : f;
      }
    }
    const nu = RE_FECHA_NUM.exec(linea);
    if (nu && !/[Ss]\s?\//.test(linea)) {
      const a = nu[3].length === 2 ? 2000 + Number(nu[3]) : Number(nu[3]);
      /* En el Perú la fecha va día/mes/año. */
      const f = fechaValida(a, Number(nu[2]), Number(nu[1]));
      if (f) return f;
    }
  }
  return null;
}

const RE_HORA_DOS_PUNTOS = /(?<!\d)(\d{1,2})\s?:\s?(\d{2})(?:\s?:\s?\d{2})?\s*(a\.?\s?m\.?|p\.?\s?m\.?)?(?!\d)/i;
/** «08.15 pm»: con punto sólo si dice am/pm, para no confundirla con un monto. */
const RE_HORA_PUNTO = /(?<!\d)(\d{1,2})\.(\d{2})\s*(a\.?\s?m\.?|p\.?\s?m\.?)(?![a-z])/i;

function horaDe(lineas: string[]): string | null {
  for (const re of [RE_HORA_DOS_PUNTOS, RE_HORA_PUNTO]) {
    for (const linea of lineas) {
      if (/operaci|celular|cuenta/i.test(linea) && !/hora|fecha/i.test(linea)) continue;
      const m = re.exec(linea);
      if (!m) continue;
      let h = Number(m[1]);
      const min = Number(m[2]);
      const ampm = m[3]?.toLowerCase().replace(/[^ap]/g, "");
      if (ampm === "p" && h < 12) h += 12;
      if (ampm === "a" && h === 12) h = 0;
      if (h <= 23 && min <= 59) return `${dos(h)}:${dos(min)}`;
    }
  }
  return null;
}

// ── N° de operación ──────────────────────────────────────────────────────────
const RE_ETIQUETA_OP = /(?:n(?:ro|[°º]|o|úm(?:ero)?|um(?:ero)?)?\.?\s*(?:de\s+)?op(?:eraci[oó0]n)?\b\.?|c[oó]d(?:igo)?\.?\s*(?:de\s+)?operaci[oó]n|operaci[oó]n\s*(?:n[°º]|nro\.?)?)/i;
const RE_TOKEN_OP = /(?<![A-Za-z0-9])([A-Z]{0,3}\d[\d-]{2,22}\d)(?![A-Za-z0-9])/;
const NO_ES_OPERACION = /realizada|exitos|[eé]xito|fecha|hora|tipo de/i;

function operacionDe(lineas: string[]): string | null {
  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];
    const et = RE_ETIQUETA_OP.exec(linea);
    if (!et || NO_ES_OPERACION.test(linea)) continue;
    const resto = linea.slice(et.index + et[0].length);
    const enLinea = RE_TOKEN_OP.exec(resto)?.[1];
    /* «Nro. de operación» arriba y el número en el renglón de abajo (Yape). */
    const siguiente = lineas[i + 1] ?? "";
    const abajo = /^[#:\s]*[A-Z]{0,3}[\d -]+$/.test(siguiente) ? RE_TOKEN_OP.exec(siguiente)?.[1] : undefined;
    const token = enLinea ?? abajo;
    if (token && (token.match(/\d/g)?.length ?? 0) >= 4 && !RE_FECHA_NUM.test(token)) return token.replace(/-/g, "");
  }
  return null;
}

// ── Destinatario ─────────────────────────────────────────────────────────────
const RE_ETIQUETA_NOMBRE =
  /^(?:¡?\s*(?:le\s+)?(?:yapeaste|plineaste|pagaste|enviaste|transferiste)\s+a|enviado\s+a|para|destinatario|beneficiario|nombre\s+del\s+(?:destinatario|beneficiario)|titular(?:\s+de\s+la\s+cuenta)?(?:\s+destino)?|a\s+nombre\s+de)\b\s*[:!-]?\s*(.*)$/i;
const NO_ES_NOMBRE =
  /\b(?:yape|plin|operaci|fecha|hora|monto|importe|destino|celular|cuenta|transfer|exitos|[eé]xito|constancia|comisi|banco|interbank|bbva|bcp|scotiabank|datos|transacci|enviado|ahorro|soles|compartir|descargar|pago|realizad|origen|titular|beneficiario|destinatario|nro|n[°º]|para)\b/i;

/** El texto como nombre de persona, o `null` si no parece uno. */
export function comoNombre(s: string): string | null {
  const t = s
    .replace(/[*•·|_¡!]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,:;-]+$/, (m) => (m === "." ? m : ""));
  if (t.length < 4 || t.length > 70 || /\d/.test(t)) return null;
  if (!new RegExp(`^[${LETRA}][${LETRA} .'-]+$`).test(t)) return null;
  const palabras = t.split(" ").filter((w) => w.replace(/\./g, "").length >= 2);
  if (palabras.length < 2 || NO_ES_NOMBRE.test(t)) return null;
  return t;
}

function destinatarioDe(lineas: string[], lineaMonto: number): string | null {
  for (let i = 0; i < lineas.length; i++) {
    const m = RE_ETIQUETA_NOMBRE.exec(lineas[i]);
    if (!m) continue;
    const nombre = comoNombre(m[1]) ?? comoNombre(lineas[i + 1] ?? "");
    if (nombre) return nombre;
  }
  /* Yape y Plin no lo rotulan: el nombre va justo debajo del monto. */
  if (lineaMonto >= 0) {
    for (const l of lineas.slice(lineaMonto + 1, lineaMonto + 3)) {
      const nombre = comoNombre(l);
      if (nombre) return nombre;
    }
  }
  return null;
}

// ── Entrada ──────────────────────────────────────────────────────────────────
/**
 * Los campos de un voucher a partir del texto del OCR.
 * `hoy` (AAAA-MM-DD) completa el año cuando el voucher no lo trae.
 */
export function leerVoucher(texto: string, opts: { hoy: string }): VoucherLeido {
  const lineas = lineasDe(texto);
  const todo = lineas.join("\n");
  const plata = montoDe(lineas);
  const lineaMonto = plata?.linea ?? -1;
  return {
    app: appDe(todo),
    monto: plata?.monto ?? null,
    moneda: plata?.moneda ?? "PEN",
    fecha: fechaDe(lineas, opts.hoy),
    hora: horaDe(lineas),
    operacion: operacionDe(lineas),
    destinatario: destinatarioDe(lineas, lineaMonto),
  };
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** «miércoles 07/10»: el día como se dice en el negocio. */
export function diaLegibleVoucher(fecha: string): string {
  const [a, m, d] = fecha.split("-").map(Number);
  return `${DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]} ${dos(d)}/${dos(m)}`;
}

/** La línea que va a la nota del adelanto: «Yape N° op 12345678 · miércoles 07/10 20:15 · para Juan Pérez». */
export function notaDeVoucher(v: VoucherLeido): string {
  const partes = [v.operacion ? `${etiquetaApp(v.app)} N° op ${v.operacion}` : etiquetaApp(v.app)];
  const cuando = [v.fecha ? diaLegibleVoucher(v.fecha) : null, v.hora].filter(Boolean).join(" ");
  if (cuando) partes.push(cuando);
  if (v.destinatario) partes.push(`para ${v.destinatario}`);
  return partes.join(" · ");
}

const sinTildes = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * ¿El nombre del voucher puede ser el de la persona elegida? Yape recorta
 * («Juan C. Pérez R.»): basta una palabra de 3+ letras en común.
 */
export function nombresSeParecen(a: string, b: string): boolean {
  const palabras = (s: string) => new Set(sinTildes(s).split(/[^a-zñ]+/).filter((w) => w.length >= 3));
  const pb = palabras(b);
  return [...palabras(a)].some((w) => pb.has(w));
}
