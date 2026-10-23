/**
 * fecha-vencimiento — sacar "hasta cuándo vale" del texto, sin depender de la IA.
 *
 * La fecha de vencimiento es lo que dispara el aviso ("te avisamos 7 días
 * antes"), o sea lo que evita la multa. Pedírsela al modelo funciona con los
 * grandes, pero un modelo chico —los que corren en tu propia máquina— suele
 * transcribir bien "VÁLIDA HASTA: 15/01/2027" y dejar el campo vacío igual.
 *
 * Esto la busca en el texto con reglas: no inventa nada, sólo lee lo que está
 * escrito. Como cada regla exige una palabra de vencimiento pegada a la fecha
 * (o los dígitos de control del DNI), lo que devuelve se anota solo en el
 * documento si nadie le había puesto fecha (ver `analyze-document`).
 *
 * Lo que sabe leer, con el texto tal como lo entrega un OCR (con ruido):
 *   · etiqueta + fecha: «Válida hasta: 15/01/2027», «Fecha de Caducidad 31 01 2030»,
 *     «vence el 3 de agosto de 2026», «caducidad: 2026-12-31»;
 *   · etiquetas en fila y fechas debajo (la caja del DNI): «Fecha Emisión
 *     Fecha Caducidad 31 01 2022 31 01 2030» → cada fecha va con SU etiqueta,
 *     en orden; la de emisión nunca se toma por la de caducidad;
 *   · rangos de vigencia: «vigencia del 01/01/2026 al 31/12/2026» → la segunda
 *     (un «Periodo: del … al …» de un recibo o de un tributo NO: es lo que se
 *     cobra, no hasta cuándo vale el papel);
 *   · plazos: «plazo de vigencia de cuarenta (40) años contados desde el
 *     12/03/2021» → 12/03/2061, sólo si la fecha de inicio está escrita;
 *   · la zona de lectura mecánica del DNI electrónico / pasaporte
 *     («6401218M3001318PER<<<») con sus dos dígitos de control.
 *
 * Fechas al modo peruano: 15/01/2027 es 15 de enero, no 1 de marzo.
 *
 * Un «hasta el» suelto no basta («descargos hasta el 05/11/2026», «residió
 * hasta el 12/05/1990»): tiene que decir válido / vigente / vence. Y en un
 * comprobante de pago la «Fecha de vencimiento» es la de PAGAR, no la del
 * papel: `esComprobanteDePago` lo dice y entonces no se anota sola.
 */

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, set: 9, sep: 9, sept: 9, oct: 10, nov: 11, dic: 12,
};

/** Cómo se leyó: todas son reglas fuertes (palabra clave pegada o dígito de control). */
export type ReglaVencimiento = "etiqueta" | "rango" | "plazo" | "mrz";

export interface VencimientoLeido {
  /** ISO al mediodía UTC (la fecha no se corre de día en Lima). */
  fecha: string;
  regla: ReglaVencimiento;
  /** El pedazo de texto de donde salió, para que una persona lo pueda revisar. */
  fragmento: string;
}

const sinTildes = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Arma la fecha si es real (rechaza 31/02) y la deja al mediodía UTC. */
function fecha(d: number, m: number, a: number): string | null {
  if (a < 1900 || a > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const iso = new Date(Date.UTC(a, m - 1, d, 12));
  if (iso.getUTCMonth() !== m - 1 || iso.getUTCDate() !== d) return null; // 31 de febrero
  return iso.toISOString();
}

/** Un año de 2 dígitos es de este siglo: "27" → 2027. */
const anio = (s: string) => (s.length === 2 ? 2000 + Number(s) : Number(s));

/**
 * El OCR confunde letras con números DENTRO de una cifra: «31 O1 2O30»,
 * «l2/05/2030». Sólo se corrige una palabra entera hecha de dígitos y esas
 * letras, con al menos un dígito de verdad: ninguna palabra castellana lleva
 * dígitos, así que «lo», «Io» u «oil» quedan como están. La raya de un
 * casillero («|12/05/2030|») en el borde no se toca: no es un 1.
 */
function corregirCifras(t: string): string {
  return t.replace(/(?<![a-z0-9])[0-9oil](?:[0-9oil|/.-]*[0-9oil])?(?![a-z0-9])/g, (m) =>
    /\d/.test(m) ? m.replace(/o/g, "0").replace(/[il|]/g, "1") : m,
  );
}

/**
 * «1o de enero», «1º de enero», «1ro de enero», «1er día de…»: el primero del
 * mes, no el 10. Sólo con «o» MINÚSCULA: el OCR lee el cero como «O» mayúscula
 * (las cifras son altas como las capitales), así «1O DE ENERO» sigue siendo 10.
 * Corre antes de pasar a minúsculas y antes de `corregirCifras`.
 */
function sinOrdinal(texto: string): string {
  return texto.replace(/(?<![\p{L}\p{N}])1\.?(?:o|º|°|ro|er)(?=\s*(?:de|DE|De)\s)/gu, "1");
}

// ── Fechas sueltas ──────────────────────────────────────────────────────────

const MES_TXT = `(${Object.keys(MESES).sort((a, b) => b.length - a.length).join("|")})\\.?`;
/** Las formas de escribir una fecha, cada una con su lector. */
const FORMAS: { re: string; leer: (g: string[]) => string | null }[] = [
  // 2027-01-15 (ISO, por si el documento ya viene normalizado)
  { re: "(\\d{4})-(\\d{1,2})-(\\d{1,2})", leer: (g) => fecha(Number(g[2]), Number(g[1]), Number(g[0])) },
  // 15/01/2027 · 15-01-2027 · 15.01.27 (con algún espacio que mete el OCR)
  { re: "(\\d{1,2}) ?[/.-] ?(\\d{1,2}) ?[/.-] ?(\\d{4}|\\d{2})(?!\\d)", leer: (g) => fecha(Number(g[0]), Number(g[1]), anio(g[2])) },
  // 15 de enero de 2027 · 15 ENE 2027 · 15-ene-2027
  {
    re: `(\\d{1,2}) ?(?:de )?[/-]? ?${MES_TXT} ?[/-]? ?(?:de |del )?(\\d{4})`,
    leer: (g) => (MESES[g[1]] ? fecha(Number(g[0]), MESES[g[1]], Number(g[2])) : null),
  },
  // 31 01 2030 — la caja del DNI escribe así; año de 4 cifras obligatorio.
  { re: "(\\d{1,2}) (\\d{1,2}) (\\d{4})(?!\\d)", leer: (g) => fecha(Number(g[0]), Number(g[1]), Number(g[2])) },
];
const UNA_FECHA = `(?:${FORMAS.map((f) => f.re.replace(/\((?!\?)/g, "(?:")).join("|")})`;

interface Ficha { tipo: "vence" | "otra" | "fecha"; ini: number; fin: number; iso?: string }

/** Todas las fechas del texto, sin solaparse (gana la que empieza antes y es más larga). */
function fechasDelTexto(t: string): Ficha[] {
  const encontradas: Ficha[] = [];
  for (const forma of FORMAS) {
    const re = new RegExp(`(?<![\\d/.-])${forma.re}`, "g");
    for (let m = re.exec(t); m; m = re.exec(t)) {
      const iso = forma.leer(m.slice(1));
      if (iso) encontradas.push({ tipo: "fecha", ini: m.index, fin: m.index + m[0].length, iso });
    }
  }
  encontradas.sort((a, b) => a.ini - b.ini || b.fin - a.fin);
  const salida: Ficha[] = [];
  for (const f of encontradas) if (!salida.length || f.ini >= salida[salida.length - 1].fin) salida.push(f);
  return salida;
}

// ── Etiquetas ───────────────────────────────────────────────────────────────

/**
 * Anuncian un vencimiento. Sin el «hasta el» suelto: plazos de descargo,
 * ofertas y fechas de residencia también lo usan, y cada uno disparaba un aviso.
 */
const VENCE =
  "v[a4]l[i1]d[oa]s? hasta|validez:? hasta|vigentes? hasta|vigencia:? hasta|vence(?:n)?(?: el)?|vencimiento|caduca(?: el)?|caducidad|expira(?: el)?|expiracion";
/** Anuncian OTRA fecha: ocupan su lugar en la fila para que no se la robe el vencimiento. */
const OTRA =
  "emision|emitid[oa]s?|expedicion|expedid[oa]s?|nacimiento|inscripcion|inscrit[oa]|otorgamiento|otorgad[oa]|suscripcion|suscrit[oa]|desde(?: el)?|inicio|registrad[oa]|lugar y fecha";

function etiquetasDelTexto(t: string): Ficha[] {
  const salida: Ficha[] = [];
  for (const [tipo, fuente] of [["vence", VENCE], ["otra", OTRA]] as const) {
    const re = new RegExp(`\\b(?:${fuente})\\b`, "g");
    for (let m = re.exec(t); m; m = re.exec(t)) salida.push({ tipo, ini: m.index, fin: m.index + m[0].length });
  }
  return salida;
}

/**
 * Cuánto texto "de verdad" hay entre dos piezas: sin espacios, signos ni las
 * palabras de relleno de un formulario («fecha de», «el», «:»). Sirve para
 * decidir si una etiqueta y una fecha van juntas.
 */
function ruido(entre: string): number {
  return entre.replace(/\b(?:fecha|fechas|de|del|el|la|y|en|n[°º]?)\b/g, "").replace(/[^a-z0-9]/g, "").length;
}

/** Entre dos etiquetas de una misma fila no hay casi nada (sólo «Fecha de»). */
const RUIDO_ENTRE_ETIQUETAS = 4;
/** Entre una etiqueta y su fecha cabe un «(dd/mm/aaaa):» o el ruido de un sello. */
const RUIDO_HASTA_LA_FECHA = 24;

/**
 * Empareja etiquetas y fechas en orden, como las lee una persona: la primera
 * fecha va con la primera etiqueta pendiente. Así «Emisión Caducidad 2022 2030»
 * da 2030 y nunca 2022.
 */
function porEtiqueta(t: string): VencimientoLeido | null {
  const fichas = [...etiquetasDelTexto(t), ...fechasDelTexto(t)].sort((a, b) => a.ini - b.ini);
  let pendientes: { ficha: Ficha; ruido: number }[] = [];
  let ultimoFin = 0;
  let anteriorEraEtiqueta = false;
  for (const f of fichas) {
    if (f.ini < ultimoFin) continue; // una etiqueta dentro de otra («vencimiento» dentro de «fecha de vencimiento» ya contada)
    const r = ruido(t.slice(ultimoFin, f.ini));
    for (const p of pendientes) p.ruido += r;
    pendientes = pendientes.filter((p) => p.ruido <= RUIDO_HASTA_LA_FECHA);
    if (f.tipo === "fecha") {
      const dueña = pendientes.shift();
      if (dueña?.ficha.tipo === "vence" && f.iso) {
        return { fecha: f.iso, regla: "etiqueta", fragmento: t.slice(dueña.ficha.ini, f.fin).slice(0, 160) };
      }
      anteriorEraEtiqueta = false;
    } else {
      // Una etiqueta nueva después de texto propio (o de una fecha) cierra la fila anterior.
      if (!anteriorEraEtiqueta || r > RUIDO_ENTRE_ETIQUETAS) pendientes = [];
      pendientes.push({ ficha: f, ruido: 0 });
      anteriorEraEtiqueta = true;
    }
    ultimoFin = f.fin;
  }
  return null;
}

// ── Rangos y plazos ─────────────────────────────────────────────────────────

/** El ISO de la primera fecha que empieza en `s`, o null. */
function leerFechaAlInicio(s: string): string | null {
  const f = fechasDelTexto(s)[0];
  return f && f.ini === 0 ? (f.iso ?? null) : null;
}

/**
 * «vigencia del 01/01/2026 al 31/12/2026» → la segunda. Sólo con una palabra
 * de VALIDEZ delante: «Periodo: del 01/10/2026 al 31/10/2026» (un recibo, un
 * PDT) es lo que se cobra y antes pisaba hasta la fecha que leía la IA.
 */
function porRango(t: string): VencimientoLeido | null {
  const re = new RegExp(
    `\\b(?:vigencia|vigente|valid[oa]|validez)\\b[^.;]{0,40}?\\b(?:del?|desde(?: el)?) (${UNA_FECHA}) ?(?:al|hasta(?: el)?|a|-) (${UNA_FECHA})`,
    "g",
  );
  for (let m = re.exec(t); m; m = re.exec(t)) {
    const desde = leerFechaAlInicio(m[1]);
    const hasta = leerFechaAlInicio(m[2]);
    if (desde && hasta && hasta > desde) return { fecha: hasta, regla: "rango", fragmento: m[0].slice(0, 160) };
  }
  return null;
}

const NUMEROS: Record<string, number> = {
  un: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  doce: 12, quince: 15, dieciocho: 18, veinte: 20, veinticinco: 25, treinta: 30, cuarenta: 40, cincuenta: 50,
};

/**
 * «plazo de vigencia de cuarenta (40) años contados desde el 12/03/2021».
 * Sólo con la fecha de inicio ESCRITA: «desde la suscripción» sin fecha no da nada.
 */
function porPlazo(t: string): VencimientoLeido | null {
  const re = new RegExp(
    `\\b(?:plazo|vigencia)\\b[^.;]{0,40}?\\b(?:de|por) (?:([a-z]+) )?\\(?(\\d{1,3})?\\)? ?(anos|meses)\\b[^.;]{0,60}?\\b(?:a partir del?|desde(?: el)?)(?: la fecha de [a-z]+,?)? (?:el )?(${UNA_FECHA})`,
    "g",
  );
  for (let m = re.exec(t); m; m = re.exec(t)) {
    const n = m[2] ? Number(m[2]) : NUMEROS[m[1] ?? ""];
    const inicio = leerFechaAlInicio(m[4]);
    if (!n || !inicio || n > 99) continue;
    const base = new Date(inicio);
    const meses = m[3] === "anos" ? n * 12 : n;
    const destino = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + meses, 1, 12));
    // El 29 de febrero + 1 año es el 28: el último día del mes destino si no existe.
    const ultimoDia = new Date(Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth() + 1, 0)).getUTCDate();
    destino.setUTCDate(Math.min(base.getUTCDate(), ultimoDia));
    return { fecha: destino.toISOString(), regla: "plazo", fragmento: m[0].slice(0, 160) };
  }
  return null;
}

// ── Zona de lectura mecánica (DNI electrónico, pasaporte) ───────────────────

/** Dígito de control ICAO 9303: pesos 7-3-1. */
function digitoDeControl(s: string): number {
  let suma = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const v = c === "<" ? 0 : /\d/.test(c) ? Number(c) : c.charCodeAt(0) - 55;
    suma += v * [7, 3, 1][i % 3];
  }
  return suma % 10;
}

/**
 * «6401218M3001318PER»: nacimiento (640121) + control, sexo, vencimiento
 * (300131) + control, nacionalidad. Con los DOS dígitos de control bien es
 * imposible que sea ruido del OCR. El OCR suele comerse el primer dígito de la
 * línea («401218M3001318PER», DNI de Blas 22-10): entonces vale el vencimiento
 * con SU dígito de control, encajado entre el sexo y la nacionalidad.
 */
function porMrz(original: string): VencimientoLeido | null {
  const t = original.toUpperCase().replace(/[ \t]/g, "");
  const D = "[0-9ODQILSBZ]";
  const aDigito = (s: string) =>
    s.replace(/[ODQ]/g, "0").replace(/[IL]/g, "1").replace(/S/g, "5").replace(/B/g, "8").replace(/Z/g, "2");
  const leer = (venc: string, fragmento: string): VencimientoLeido | null => {
    const yy = Number(venc.slice(0, 2));
    const iso = fecha(Number(venc.slice(4, 6)), Number(venc.slice(2, 4)), yy <= 79 ? 2000 + yy : 1900 + yy);
    return iso ? { fecha: iso, regla: "mrz", fragmento } : null;
  };

  // Las letras que el OCR confunde con números se aceptan, pero con mayoría de
  // dígitos de verdad: sin espacios, «DIOS MODISLOS BOS…» también encaja.
  const digitos = (s: string) => (s.match(/\d/g) ?? []).length;

  const completa = new RegExp(`(${D}{6})(${D})([MF<X])(${D}{6})(${D})`, "g");
  for (let m = completa.exec(t); m; m = completa.exec(t)) {
    completa.lastIndex = m.index + 1; // las coincidencias pueden solaparse
    if (digitos(m[1] + m[4]) < 9) continue;
    const [nac, cNac, venc, cVenc] = [m[1], m[2], m[4], m[5]].map(aDigito);
    if (digitoDeControl(nac) !== Number(cNac) || digitoDeControl(venc) !== Number(cVenc)) continue;
    const leido = leer(venc, m[0]);
    if (leido) return leido;
  }

  const parcial = new RegExp(`(${D}{4})[MF](${D}{6})(${D})[A-Z]{3}`, "g");
  for (let m = parcial.exec(t); m; m = parcial.exec(t)) {
    parcial.lastIndex = m.index + 1;
    if (digitos(m[1]) < 3 || digitos(m[2]) < 5) continue;
    const [venc, cVenc] = [m[2], m[3]].map(aDigito);
    if (digitoDeControl(venc) !== Number(cVenc)) continue;
    const leido = leer(venc, m[0]);
    if (leido) return leido;
  }
  return null;
}

// ── API ─────────────────────────────────────────────────────────────────────

/**
 * El vencimiento escrito en el texto, con la regla que lo encontró, o null.
 * Nunca toma una fecha de emisión, nacimiento o firma: sin palabra de
 * vencimiento (o dígito de control) no hay fecha.
 */
export function leerVencimiento(texto: string | null | undefined): VencimientoLeido | null {
  if (!texto) return null;
  const t = corregirCifras(sinTildes(sinOrdinal(texto)).replace(/\s+/g, " "));
  return porMrz(texto) ?? porRango(t) ?? porEtiqueta(t) ?? porPlazo(t);
}

/** Lo que sólo trae un comprobante o una cuenta por pagar (texto sin tildes, en minúsculas). */
const MARCAS_DE_COMPROBANTE = new RegExp(
  [
    "factura (?:electronica|de venta|comercial)",
    "factura ?(?:n[°ºo]?\\.?|nro\\.?|#|:) ?[a-z]?\\d", // «Factura N° F001-…», nunca «la factura no…»
    "boleta (?:de venta|electronica)",
    "recibo (?:por honorarios|electronico|de (?:luz|agua|energia|servicios?|telefono|internet|pago))",
    "nota de (?:credito|debito)",
    "ticket (?:de venta|electronico)",
    "(?<![a-z0-9])[fbe][a-z0-9]\\d{2} ?- ?\\d{1,8}(?!\\d)", // serie y número SUNAT: F001-123, B002-45, E001-7
    // «FORMA DE PAGO» también es una cláusula de contrato: sólo con su valor.
    "(?:forma|condicion(?:es)?) de pago:? (?:al )?(?:credito|contado)",
    "total a pagar",
    "op(?:\\.|eracion)? gravada",
    "pago minimo",
    "estado de cuenta",
    "letra de cambio",
    "pagare",
    "cronograma de pagos",
    "proforma",
    "cotizacion ?(?:n[°ºo]?\\.?|nro\\.?|#|:) ?[a-z]?\\d",
    "(?:oferta|cotizacion|precios?) v[a4]l[i1]d[oa]s? hasta",
    "validez de (?:la )?(?:oferta|cotizacion)",
    "orden de compra",
    "n(?:[°º]|ro\\.?|umero) de suministro",
  ].map((m) => `(?:${m})`).join("|"),
);

/**
 * Factura, boleta, recibo, cotización o cuenta por pagar: ahí la «Fecha de
 * vencimiento» es hasta cuándo PAGAR (o hasta cuándo vale la oferta), no hasta
 * cuándo vale el papel. Esa fecha queda como sugerencia y no se anota sola:
 * anotada dispara el aviso por WhatsApp de un «vencimiento» que no es tal.
 *
 * Lo más barato y seguro primero: lo que dijo la IA del tipo de documento;
 * después las marcas que SÓLO trae un comprobante (la serie SUNAT F001-…, la
 * forma de pago, el total a pagar). Una palabra suelta como «factura» no
 * alcanza: un contrato dice «previa presentación de la factura».
 */
export function esComprobanteDePago(texto: string | null | undefined, tipoSegunIA?: string | null): boolean {
  const tipo = sinTildes(tipoSegunIA ?? "").trim();
  if (/^(?:factura|boleta|recibo|cotizacion|proforma|nota de (?:credito|debito)|ticket)/.test(tipo)) return true;
  if (!texto) return false;
  const t = sinTildes(texto).replace(/\s+/g, " ");
  return MARCAS_DE_COMPROBANTE.test(t);
}

/**
 * La fecha de vencimiento escrita en el texto (ISO), o null.
 * "Emitida: 15/01/2026 · Válida hasta: 15/01/2027" tiene que dar 2027.
 */
export function fechaDeVencimientoEnTexto(texto: string | null | undefined): string | null {
  return leerVencimiento(texto)?.fecha ?? null;
}
