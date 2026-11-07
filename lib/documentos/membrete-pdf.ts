/**
 * lib/documentos/membrete-pdf.ts — el membrete y el pie de TODOS los papeles
 * del negocio en jsPDF (Brandon 23-10: «cualquier documento de la empresa en
 * cualquier pestaña saldrá con el logo y nombre en el título, algo profesional»).
 *
 * Cabecera: logo (o monograma con la inicial en el color de acento), nombre del
 * negocio como título, una línea de datos (RUC · dirección · teléfono · correo)
 * y, a la derecha, el tipo de documento, su código y su fecha. Pie en cada
 * página: línea fina, «Emitido el … (hora de Lima)» y «Página X de Y».
 *
 * Dibujo puro: recibe el `doc` de jsPDF (que carga quien arma el papel, en
 * demanda) y los datos ya resueltos por `datosDelMembrete`. El logo llega listo
 * (PNG/JPEG en data URL): cargarlo es de `membrete-cargar.ts`, en el navegador.
 * La misma ficha arma la cabecera HTML (`membrete-html.ts`).
 *
 * Colores: un solo acento (el del negocio si lo hay, si no el turquesa oscuro
 * del panel, `--accent-dark`) y grises por nivel. jsPDF no lee CSS: van en RGB.
 */

import type { LogoPdf, Membrete } from "@/lib/admin/membrete";

type Pdf = InstanceType<(typeof import("jspdf"))["default"]>;
export type Rgb = readonly [number, number, number];

/** Grises por nivel (sobre blanco: tinta 14:1, secundario 7,6:1, terciario 4,8:1) y el acento por defecto. */
export const PALETA = {
  tinta: [31, 41, 51] as Rgb,
  secundario: [75, 85, 99] as Rgb,
  terciario: [107, 114, 128] as Rgb,
  regla: [209, 213, 219] as Rgb,
  fondo: [246, 247, 249] as Rgb,
  /** `--accent-dark` del panel: el turquesa del logo con contraste AA sobre blanco. */
  acento: [0, 127, 122] as Rgb,
} as const;

/** Lo que el negocio tiene registrado + el logo ya preparado + (opcional) su color. */
export interface MembreteDocumento extends Partial<Membrete> {
  logo?: LogoPdf | null;
  /** Color del negocio en «#rrggbb»; si es muy claro se oscurece hasta leerse sobre blanco. */
  color?: string | null;
  /** WhatsApp de la tienda: va en la línea de datos si no es el mismo teléfono. */
  whatsapp?: string | null;
  /** El logo ya en PNG servido por el panel (mismo sitio, sin CORS): se prueba antes que `logoUrl`. */
  logoPngUrl?: string | null;
}

/** El documento que encabeza: «Recibo de adelanto», «ADL-2026-0024», «jueves 08/10/2026». */
export interface DocumentoMembrete {
  tipo: string;
  codigo?: string | null;
  fecha?: string | null;
  /** Una línea más a la derecha, debajo de la fecha («Recibo manual N.° 0123»). */
  extra?: string | null;
}

export interface DatosMembrete {
  /** El nombre comercial (o la razón social si no hay); «Documento» si no hay ninguno. */
  titulo: string;
  /** La razón social sólo si es distinta del título. */
  razonSocial: string | null;
  /** «RUC 20…», la dirección, «Tel. …», el correo: lo que exista, en ese orden. */
  datos: string[];
  logo: LogoPdf | null;
  /** La URL original del logo (para el HTML, que sí lee webp). */
  logoUrl: string | null;
  /** La inicial del monograma cuando no hay logo. */
  monograma: string;
  acento: Rgb;
  tipo: string;
  codigo: string | null;
  fecha: string | null;
  extra: string | null;
  /** El pie que el negocio escribió para sus comprobantes. */
  pie: string | null;
}

const limpio = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ") : null);

/** «#2d6a4f» → [45, 106, 79]; `null` si no es un color de 6 cifras. */
export function rgbDeHex(hex: string | null | undefined): Rgb | null {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const luminancia = ([r, g, b]: Rgb) => {
  const c = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
};

/** Contraste del color contra el papel blanco (1 a 21). */
export function contrasteSobreBlanco(c: Rgb): number {
  return 1.05 / (luminancia(c) + 0.05);
}

/** El acento que se lee sobre blanco (≥ 4,5:1): un amarillo o un celeste del negocio se oscurecen, no se cambian. */
export function acentoLegible(c: Rgb | null): Rgb {
  if (!c) return PALETA.acento;
  let x: Rgb = c;
  for (let i = 0; i < 20 && contrasteSobreBlanco(x) < 4.5; i++) x = [Math.round(x[0] * 0.88), Math.round(x[1] * 0.88), Math.round(x[2] * 0.88)];
  return x;
}

/** El color mezclado con blanco: `t` = cuánto blanco (0,93 = un tinte apenas visible para un fondo). */
export function tinte(c: Rgb, t: number): Rgb {
  return [Math.round(c[0] + (255 - c[0]) * t), Math.round(c[1] + (255 - c[1]) * t), Math.round(c[2] + (255 - c[2]) * t)];
}

/** La primera letra del nombre (sin tilde se ve rara en mayúscula de 20 pt: «Á» va igual). */
function inicial(titulo: string): string {
  const letra = /[\p{L}\p{N}]/u.exec(titulo)?.[0];
  return (letra ?? "·").toLocaleUpperCase("es-PE");
}

/** Junta lo registrado del negocio con lo del documento. Puro: lo prueban los tests y lo usan el PDF y el HTML. */
export function datosDelMembrete(m: MembreteDocumento | null | undefined, documento: DocumentoMembrete): DatosMembrete {
  const nombre = limpio(m?.nombre);
  const razon = limpio(m?.razonSocial);
  const titulo = nombre ?? razon ?? "Documento";
  const ruc = limpio(m?.ruc);
  const telefono = limpio(m?.telefono);
  const whatsapp = limpio(m?.whatsapp);
  const soloDigitos = (x: string | null) => (x ?? "").replace(/\D/g, "").slice(-9);
  const wsp = whatsapp && soloDigitos(whatsapp) !== soloDigitos(telefono) ? `WhatsApp ${whatsapp}` : null;
  const datos = [ruc ? `RUC ${ruc}` : null, limpio(m?.direccion), telefono ? `Tel. ${telefono}` : null, wsp, limpio(m?.correo)].filter(
    (x): x is string => !!x,
  );
  const logo = m?.logo && m.logo.dataUrl && m.logo.ancho > 0 && m.logo.alto > 0 ? m.logo : null;
  return {
    titulo,
    razonSocial: razon && razon.toLocaleLowerCase("es-PE") !== titulo.toLocaleLowerCase("es-PE") ? razon : null,
    datos,
    logo,
    logoUrl: limpio(m?.logoUrl),
    monograma: inicial(titulo),
    acento: acentoLegible(rgbDeHex(m?.color)),
    tipo: limpio(documento.tipo) ?? "Documento",
    codigo: limpio(documento.codigo),
    fecha: limpio(documento.fecha),
    extra: limpio(documento.extra),
    pie: limpio(m?.pie),
  };
}

// ── Fechas (hora de Lima, nombres escritos a mano: Intl cambia con la versión de ICU) ──

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;

function partesLima(d: Date): { clave: string; hora: string } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return { clave: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
}

/** «2026-10-08» → «jueves 08/10/2026». */
function diaDeLaClave(clave: string): string {
  const [a, m, d] = clave.split("-").map(Number);
  return `${DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${a}`;
}

/**
 * La fecha de un documento, «jueves 08/10/2026». Una fecha sin hora («2026-10-08»
 * o medianoche UTC) se lee tal cual; con hora, en Lima: a las 20:00 de Pucallpa
 * el UTC ya es mañana. `null` si no es una fecha.
 */
export function fechaDelDocumento(iso: string | null | undefined): string | null {
  if (!iso) return null;
  if (/^\d{4}-\d{2}-\d{2}(T00:00(:00(\.0+)?)?Z)?$/.test(iso)) return diaDeLaClave(iso.slice(0, 10));
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? diaDeLaClave(partesLima(d).clave) : null;
}

/**
 * Los datos (RUC · dirección · teléfono · correo) en renglones cortados por
 * DATO y no por letra: con `splitTextToSize` sobre el texto unido el «·»
 * quedaba colgando al final del renglón (verificado 23-10 en el PDF SUNAT).
 */
function renglonesDeDatos(doc: Pdf, datos: readonly string[], ancho: number): string[] {
  const SEP = "  ·  ";
  const renglones: string[] = [];
  let actual = "";
  for (const dato of datos) {
    const junto = actual ? `${actual}${SEP}${dato}` : dato;
    if (!actual || doc.getTextWidth(junto) <= ancho) {
      actual = junto;
      continue;
    }
    renglones.push(actual);
    actual = dato;
  }
  if (actual) renglones.push(actual);
  // Un dato solo más ancho que la línea se parte como antes.
  return renglones.flatMap((r) => (doc.getTextWidth(r) > ancho ? (doc.splitTextToSize(r, ancho) as string[]) : [r]));
}

/** «jueves 23/10/2026 · 14:05», hora de Lima. */
export function emitidoEnLima(d: Date): string {
  const { clave, hora } = partesLima(d);
  return `${diaDeLaClave(clave)} · ${hora}`;
}

export const textoPagina = (pagina: number, total: number): string => `Página ${pagina} de ${total}`;

// ── Dibujo ──

/** El formato que jsPDF necesita, leído del data URL. */
export function formatoDeImagen(dataUrl: string): "PNG" | "JPEG" {
  return /^data:image\/jpe?g/i.test(dataUrl) ? "JPEG" : "PNG";
}

const MM_POR_PT = 0.3528;
const color = (doc: Pdf, c: Rgb) => doc.setTextColor(c[0], c[1], c[2]);
const fuente = (doc: Pdf, peso: "normal" | "bold", tam: number, c: Rgb) => {
  doc.setFont("helvetica", peso);
  doc.setFontSize(tam);
  color(doc, c);
};

/** Corta con «…» lo que no entra en `ancho` mm con la fuente actual. */
export function recortar(doc: Pdf, texto: string, ancho: number): string {
  if (doc.getTextWidth(texto) <= ancho) return texto;
  let t = texto;
  while (t.length > 1 && doc.getTextWidth(`${t}…`) > ancho) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/** Medidas del membrete: A4 (normal) o media hoja / ticket (compacto). */
const MEDIDAS = {
  normal: { margen: 16, arriba: 13, logo: 18, logoMaxAncho: 44, titulo: 15, datos: 8, tipo: 8.5, codigo: 13, fecha: 8.5 },
  compacto: { margen: 12, arriba: 9, logo: 13, logoMaxAncho: 32, titulo: 12.5, datos: 7.5, tipo: 7.5, codigo: 11, fecha: 8 },
} as const;

export interface OpcionesMembrete {
  compacto?: boolean;
}

/** El margen lateral que usa el membrete (el cuerpo del papel se alinea con él). */
export const margenDelMembrete = (o: OpcionesMembrete = {}): number => MEDIDAS[o.compacto ? "compacto" : "normal"].margen;

/**
 * Dibuja la cabecera en la página actual y devuelve el `y` (mm) donde empieza
 * el cuerpo. El logo respeta su proporción (alto fijo, ancho hasta un tope).
 */
export function dibujarMembrete(doc: Pdf, m: DatosMembrete, o: OpcionesMembrete = {}): number {
  const k = MEDIDAS[o.compacto ? "compacto" : "normal"];
  const W = doc.internal.pageSize.getWidth();
  const top = k.arriba;

  // Logo o monograma, a la izquierda.
  let anchoMarca: number = k.logo;
  let altoMarca: number = k.logo;
  if (m.logo) {
    const r = m.logo.ancho / m.logo.alto;
    anchoMarca = Math.min(k.logoMaxAncho, k.logo * r);
    altoMarca = anchoMarca / r;
    doc.addImage(m.logo.dataUrl, formatoDeImagen(m.logo.dataUrl), k.margen, top + (k.logo - altoMarca) / 2, anchoMarca, altoMarca, undefined, "FAST");
  } else {
    doc.setFillColor(m.acento[0], m.acento[1], m.acento[2]);
    doc.roundedRect(k.margen, top, k.logo, k.logo, k.logo * 0.18, k.logo * 0.18, "F");
    fuente(doc, "bold", k.logo * 1.25, [255, 255, 255]);
    doc.text(m.monograma, k.margen + k.logo / 2, top + k.logo / 2 + k.logo * 1.25 * MM_POR_PT * 0.36, { align: "center" });
  }

  // Bloque del documento, a la derecha: se mide primero para saber cuánto deja al nombre.
  const derecha: { texto: string; peso: "normal" | "bold"; tam: number; c: Rgb }[] = [
    { texto: m.tipo.toLocaleUpperCase("es-PE"), peso: "bold", tam: k.tipo, c: m.acento },
    ...(m.codigo ? [{ texto: m.codigo, peso: "bold" as const, tam: k.codigo, c: PALETA.tinta }] : []),
    ...(m.fecha ? [{ texto: m.fecha, peso: "normal" as const, tam: k.fecha, c: PALETA.secundario }] : []),
    ...(m.extra ? [{ texto: m.extra, peso: "normal" as const, tam: k.datos, c: PALETA.terciario }] : []),
  ];
  let anchoDerecha = 0;
  for (const l of derecha) {
    fuente(doc, l.peso, l.tam, l.c);
    anchoDerecha = Math.max(anchoDerecha, doc.getTextWidth(l.texto));
  }
  anchoDerecha = Math.min(anchoDerecha, (W - 2 * k.margen) * 0.42);

  const xTexto = k.margen + anchoMarca + (o.compacto ? 3.5 : 4.5);
  const anchoTexto = W - k.margen - anchoDerecha - 6 - xTexto;

  // Nombre (hasta 2 líneas), razón social y datos (hasta 2 líneas): centrados con la marca si caben.
  fuente(doc, "bold", k.titulo, PALETA.tinta);
  const titulo = (doc.splitTextToSize(m.titulo, anchoTexto) as string[]).slice(0, 2);
  fuente(doc, "normal", k.datos, PALETA.terciario);
  const datos = renglonesDeDatos(doc, m.datos, anchoTexto).slice(0, 2);
  const altoTitulo = k.titulo * MM_POR_PT * 1.18;
  const altoDato = k.datos * MM_POR_PT * 1.45;
  const alto = titulo.length * altoTitulo + (m.razonSocial ? altoDato : 0) + datos.length * altoDato + (datos.length || m.razonSocial ? 1 : 0);
  let y = top + Math.max(0, (k.logo - alto) / 2) + k.titulo * MM_POR_PT * 0.78;
  fuente(doc, "bold", k.titulo, PALETA.tinta);
  for (const l of titulo) {
    doc.text(l, xTexto, y);
    y += altoTitulo;
  }
  y += 1 - altoTitulo + altoDato;
  if (m.razonSocial) {
    fuente(doc, "normal", k.datos, PALETA.secundario);
    doc.text(recortar(doc, m.razonSocial, anchoTexto), xTexto, y);
    y += altoDato;
  }
  fuente(doc, "normal", k.datos, PALETA.terciario);
  for (const l of datos) {
    doc.text(l, xTexto, y);
    y += altoDato;
  }
  const finIzquierda = Math.max(top + k.logo, y - altoDato + 1.5);

  let yd = top + k.tipo * MM_POR_PT * 0.78;
  for (const [i, l] of derecha.entries()) {
    fuente(doc, l.peso, l.tam, l.c);
    if (i > 0) yd += l.tam * MM_POR_PT * 1.3;
    doc.text(recortar(doc, l.texto, anchoDerecha), W - k.margen, yd, { align: "right" });
  }

  const yLinea = Math.max(finIzquierda, yd + 1.5) + (o.compacto ? 2.5 : 3.5);
  doc.setDrawColor(m.acento[0], m.acento[1], m.acento[2]);
  doc.setLineWidth(0.5);
  doc.line(k.margen, yLinea, W - k.margen, yLinea);
  return yLinea + (o.compacto ? 5 : 7);
}

/**
 * La cabecera breve de las páginas que siguen (anexos, hojas 2+): el nombre del
 * negocio y el título de la página a la izquierda, el código a la derecha.
 * Devuelve el `y` del cuerpo.
 */
export function dibujarMembreteBreve(doc: Pdf, m: DatosMembrete, tituloDePagina: string, o: OpcionesMembrete = {}): number {
  const k = MEDIDAS[o.compacto ? "compacto" : "normal"];
  const W = doc.internal.pageSize.getWidth();
  const y = k.arriba + 3;
  fuente(doc, "bold", 9, PALETA.tinta);
  doc.text(recortar(doc, m.titulo, (W - 2 * k.margen) * 0.6), k.margen, y);
  if (m.codigo) {
    fuente(doc, "bold", 9, m.acento);
    doc.text(m.codigo, W - k.margen, y, { align: "right" });
  }
  fuente(doc, "normal", 8, PALETA.secundario);
  doc.text(recortar(doc, tituloDePagina, W - 2 * k.margen), k.margen, y + 4.5);
  doc.setDrawColor(PALETA.regla[0], PALETA.regla[1], PALETA.regla[2]);
  doc.setLineWidth(0.3);
  doc.line(k.margen, y + 7.5, W - k.margen, y + 7.5);
  return y + 13;
}

/** Alto que ocupa el pie desde el borde de abajo (el cuerpo no debe bajar de `H − altoDelPie`). */
export const altoDelPie = (o: OpcionesMembrete = {}): number => (o.compacto ? 12 : 18);

/**
 * El pie en TODAS las páginas (se llama al final, cuando ya se sabe cuántas
 * son): línea fina, «Emitido el jueves 23/10/2026 · 14:05 (hora de Lima)» a la
 * izquierda, «Página X de Y» a la derecha y el pie del negocio al centro.
 */
export function dibujarPies(doc: Pdf, m: DatosMembrete, o: OpcionesMembrete & { emitido?: Date } = {}): void {
  const total = doc.getNumberOfPages();
  const emitido = `Emitido el ${emitidoEnLima(o.emitido ?? new Date())} (hora de Lima)`;
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const margen = W < 160 ? 10 : margenDelMembrete(o);
    const yLinea = H - altoDelPie(o) + 3;
    doc.setDrawColor(PALETA.regla[0], PALETA.regla[1], PALETA.regla[2]);
    doc.setLineWidth(0.2);
    doc.line(margen, yLinea, W - margen, yLinea);
    const yTexto = yLinea + 4.2;
    fuente(doc, "normal", 7, PALETA.terciario);
    doc.text(emitido, margen, yTexto);
    doc.text(textoPagina(p, total), W - margen, yTexto, { align: "right" });
    if (m.pie) {
      // En media hoja no hay lugar para otra fila: el pie va al centro, entre los dos.
      const libre = o.compacto ? W - 2 * margen - doc.getTextWidth(emitido) - doc.getTextWidth(textoPagina(p, total)) - 10 : W - 2 * margen;
      fuente(doc, "normal", 7, PALETA.secundario);
      if (libre > 20) doc.text(recortar(doc, m.pie, libre), W / 2 + (o.compacto ? (doc.getTextWidth(emitido) - doc.getTextWidth(textoPagina(p, total))) / 2 : 0), o.compacto ? yTexto : yTexto + 3.6, { align: "center" });
    }
  }
}
