import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";
import type { PSM, Worker } from "tesseract.js";
import { logger } from "@/lib/logger";
import { renderizarPaginaPdf } from "./pdf-a-imagen";

/**
 * ocr-servidor — leer un papel escaneado SIN modelo de visión.
 *
 * El DNI del jefe, el título habilitante, el registro de plantación: llegan al
 * drive como PDF escaneado (por dentro, una foto) o como foto de celular. Sin
 * un modelo que mire la imagen —en local sólo hay Groq, que no ve— quedaban sin
 * texto, y sin texto no hay fecha de vencimiento ni aviso: justo los papeles
 * que más multa cuestan si se vencen.
 *
 * Este es el respaldo: tesseract.js (el mismo motor del pegado de capturas,
 * ADR-397) corriendo en el servidor con el idioma español del disco, sin
 * internet ni clave de API. Lee peor que un modelo de visión, pero lee: con el
 * texto, la IA de texto describe el papel y la regla de fechas
 * (`lib/documentos/fecha-vencimiento.ts`) encuentra «Fecha de Caducidad».
 *
 * Dos clases de página, medidas con los papeles de Blas (22-10):
 *   · llena (una resolución, una guía): se lee entera;
 *   · casi vacía (un DNI fotocopiado en una hoja A4): leída entera da basura
 *     —el carné ocupa el 15 % de la hoja, a baja resolución y con trama—. Se
 *     recorta cada bloque con tinta, se agranda, y se lee el canal de color más
 *     claro (el fondo celeste del DNI desaparece en el canal azul).
 *   Si el texto huele a documento de identidad (`<<`, «IDPER»), se hace una
 *   pasada más sólo con mayúsculas, dígitos y `<`: la zona de lectura mecánica
 *   trae la fecha de caducidad con dígito de control.
 *
 * Acotado a propósito, porque corre dentro de una petición:
 *   · hasta `OCR_MAX_PAGINAS` páginas (la fecha de un DNI o de una resolución
 *     está en la primera o la segunda) y `MAX_RECORTES` bloques por página;
 *   · nada por encima de `OCR_MAX_BYTES`;
 *   · un solo worker, reutilizado y apagado tras un rato sin uso (cargar el
 *     idioma cuesta ~1 s; dejarlo vivo para siempre son ~150 MB de más);
 *   · un documento por vez, y el presupuesto corre desde que le TOCA (no desde
 *     que entró a la fila: con tres en espera, el tercero salía sin leer);
 *   · tope de tiempo por pasada, contando la creación del worker (si se pasa,
 *     el worker se mata y se crea otro: la fila nunca queda trabada) y
 *     presupuesto total: pasado, no se empieza otra pasada;
 *   · una página o pasada que falla no tira lo ya leído de las otras;
 *   · el dibujo de un PDF no pasa de ~2600 px de ancho: un plano A1 a 4× eran
 *     64 MP (256 MB de memoria) para leer lo mismo.
 */

/** Más grande que esto no se lee: un escaneo de 40 MB son minutos de CPU. */
export const OCR_MAX_BYTES = 25 * 1024 * 1024;
/** Páginas leídas como mucho. */
export const OCR_MAX_PAGINAS = 3;
/** Tope por pasada. Medido: 4-8 s por página A4 llena en este equipo. */
const TOPE_POR_PASADA_MS = Number(process.env.DOC_OCR_TIMEOUT_MS) || 45_000;
/** Presupuesto del documento entero: después de esto no arranca otra pasada. */
const PRESUPUESTO_MS = Number(process.env.DOC_OCR_PRESUPUESTO_MS) || 60_000;
/** El worker se apaga solo después de esto sin trabajo. */
const OCIOSO_MS = 90_000;
/**
 * Un PDF se dibuja dos veces sólo si hace falta: a 2× para ver cómo es la hoja
 * y leerla entera (4-9 s por A4), y a 4× (~2400 px, los ~300 ppp de tesseract)
 * únicamente para recortar los bloques de una hoja casi vacía. Leer una página
 * llena a 4× costaba 15-18 s y no leía más (GTF de Blas, 22-10).
 */
const ESCALA_BASE = 2;
const ESCALA_FINA = 4;
/** Ningún dibujo pasa de este ancho ni de estos píxeles (una A4 a 4× = 2380 px, 8 MP). */
const ANCHO_DIBUJO_MAX = 2600;
const PIXELES_DIBUJO_MAX = 12_000_000;
/** El dibujo fino sólo vale la pena si agranda de verdad. */
const MEJORA_FINA_MIN = 1.25;
/** Margen del techo de un turno sobre presupuesto + pasada (dibujar, decodificar). */
const MARGEN_TURNO_MS = 20_000;
/** Lo que se espera a que un worker se apague (uno colgado creándose nunca contesta). */
const ESPERA_APAGADO_MS = 1_000;
/** Ancho al que se lleva una página entera (ver `ocr-navegador`: a 1× pierde decimales). */
const ANCHO_MIN = 2000;
const ANCHO_MAX = 3600;
/** Ancho al que se agranda un recorte chico (el carné del DNI mide ~950 px a 4×). */
const ANCHO_RECORTE = 2500;
/** Con menos tinta que esto (fracción de la hoja), la página se lee por bloques. */
const COBERTURA_DISPERSA = 0.35;
const MAX_RECORTES = 4;
/** Lo que se considera tinta en la vista chica (gris 0-255). */
const UMBRAL_TINTA = 200;
/** La zona de lectura mecánica sólo tiene esto. */
const LISTA_MRZ = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<";
/** Sólo los signos de la zona mecánica: la palabra «identidad» sale en cualquier GTF (casillero del DNI del chofer). */
const PARECE_IDENTIDAD = /<<|<PER|IDPER/;
const BLANCO = { r: 255, g: 255, b: 255 };

export type ResultadoOcr =
  | { ok: true; texto: string; paginas: number; confianza: number; ms: number }
  | { ok: false; motivo: "sin_idioma" | "muy_grande" | "no_soportado" | "sin_texto" | "falla" };

/** MIME que este OCR sabe leer. */
export function ocrServidorSoporta(mimeType: string): boolean {
  return mimeType === "application/pdf" || /^image\/(jpeg|jpg|png|webp|tiff|bmp|gif)$/i.test(mimeType);
}

/**
 * Dónde está `spa.traineddata.gz` en el disco. Se prueba la variable de entorno,
 * el paquete de npm y la copia de `public/` (la del navegador): sin bajar nada
 * de internet, el patio no siempre tiene.
 */
function carpetaDelIdioma(): string | null {
  const candidatas = [
    process.env.TESSERACT_LANG_PATH,
    path.join(process.cwd(), "node_modules", "@tesseract.js-data", "spa", "4.0.0_best_int"),
    path.join(process.cwd(), "public", "tesseract", "lang"),
  ].filter((c): c is string => !!c);
  return candidatas.find((c) => existsSync(path.join(c, "spa.traineddata.gz"))) ?? null;
}

/**
 * El script del worker, con ruta absoluta. tesseract.js la arma con
 * `__dirname`, que dentro del bundle del servidor no apunta a node_modules.
 */
function rutaDelWorker(): string | undefined {
  const ruta = path.join(process.cwd(), "node_modules", "tesseract.js", "src", "worker-script", "node", "index.js");
  return existsSync(ruta) ? ruta : undefined;
}

// ── El worker ───────────────────────────────────────────────────────────────

let workerVivo: Promise<Worker> | null = null;
let apagado: ReturnType<typeof setTimeout> | null = null;
/** Un documento por vez: el worker es uno y el presupuesto cuenta desde que le toca. */
let fila: Promise<unknown> = Promise.resolve();

const esperar = (ms: number) =>
  new Promise<void>((listo) => {
    const t = setTimeout(listo, ms);
    t.unref?.();
  });

/**
 * Suelta el worker y lo apaga. No espera más de `ESPERA_APAGADO_MS`: un
 * `createWorker` colgado no resuelve nunca, y esperarlo trababa la fila entera.
 * Si ese worker termina de crearse después, se apaga en ese momento (el
 * `terminate` ya quedó encadenado).
 */
async function apagarWorker(): Promise<void> {
  const w = workerVivo;
  workerVivo = null;
  if (apagado) clearTimeout(apagado);
  apagado = null;
  if (!w) return;
  const terminar = w
    .then((x) => x.terminate())
    .then(() => undefined)
    .catch((err) => logger.warn("documents.ocr_servidor.apagar_fallo", { err: String(err) }));
  await Promise.race([terminar, esperar(ESPERA_APAGADO_MS)]);
}

function programarApagado(): void {
  if (apagado) clearTimeout(apagado);
  apagado = setTimeout(() => {
    apagarWorker().catch((err) => logger.warn("documents.ocr_servidor.apagar_fallo", { err: String(err) }));
  }, OCIOSO_MS);
  // Que un worker ocioso no mantenga vivo un script o un proceso que terminó.
  apagado.unref?.();
}

function obtenerWorker(langPath: string): Promise<Worker> {
  if (!workerVivo) {
    const creando = (async () => {
      const { createWorker } = await import("tesseract.js");
      return createWorker("spa", 1, {
        langPath,
        workerPath: rutaDelWorker(),
        // Por omisión escribe `spa.traineddata` en el directorio actual (la raíz
        // del repo o la del servidor): se lee del .gz cada vez que se crea.
        cacheMethod: "none",
        gzip: true,
      });
    })();
    workerVivo = creando;
    // Si falla, el próximo pide uno nuevo; sólo si nadie lo reemplazó ya.
    creando.catch(() => {
      if (workerVivo === creando) workerVivo = null;
    });
  }
  return workerVivo;
}

/**
 * El turno de un documento: corre solo, con el apagado por ocio suspendido, y
 * con un techo duro. Pasado el techo el turno se da por perdido (se marca
 * `cortado`, se mata el worker) y la fila sigue con el próximo.
 */
interface Turno { vence: number; cortado: boolean }
function enFila<T>(trabajo: (turno: Turno) => Promise<T>, siSeCorta: T): Promise<T> {
  const turnoDelDoc = fila.then(async () => {
    // Un apagado programado al final del documento anterior no puede caer en
    // medio de éste: el worker se moría a mitad de una pasada.
    if (apagado) clearTimeout(apagado);
    apagado = null;
    const turno: Turno = { vence: Date.now() + PRESUPUESTO_MS, cortado: false };
    let techo: ReturnType<typeof setTimeout> | undefined;
    const cortar = new Promise<T>((listo) => {
      techo = setTimeout(() => {
        turno.cortado = true;
        logger.warn("documents.ocr_servidor.turno_cortado", { ms: PRESUPUESTO_MS + TOPE_POR_PASADA_MS + MARGEN_TURNO_MS });
        apagarWorker().then(() => listo(siSeCorta), () => listo(siSeCorta));
      }, PRESUPUESTO_MS + TOPE_POR_PASADA_MS + MARGEN_TURNO_MS);
      techo.unref?.();
    });
    try {
      return await Promise.race([trabajo(turno), cortar]);
    } finally {
      clearTimeout(techo);
      programarApagado();
    }
  });
  fila = turnoDelDoc.catch(() => undefined);
  return turnoDelDoc;
}

/** Cómo se lee: página entera (3), bloque único (6) o texto suelto (11), y con qué letras. */
interface Pasada { psm: "3" | "6" | "11"; lista?: string }

/**
 * Una pasada sobre una imagen, con tope de tiempo. El tope cubre también la
 * creación del worker: un `createWorker` colgado fuera de la carrera dejaba la
 * fila esperando para siempre. Si se pasa, mata el worker (no queda colgado).
 */
async function leerImagen(imagen: Buffer, langPath: string, pasada: Pasada): Promise<{ texto: string; confianza: number }> {
  let corte: ReturnType<typeof setTimeout> | undefined;
  const tope = new Promise<never>((_, rechazar) => {
    corte = setTimeout(() => rechazar(new Error("ocr_timeout")), TOPE_POR_PASADA_MS);
  });
  try {
    const { data } = await Promise.race([
      (async () => {
        const worker = await obtenerWorker(langPath);
        // Cada pasada fija las DOS cosas: si no, la lista de la pasada de
        // identidad se queda pegada y la página siguiente sale sin minúsculas.
        await worker.setParameters({ tessedit_pageseg_mode: pasada.psm as PSM, tessedit_char_whitelist: pasada.lista ?? "" });
        return worker.recognize(imagen);
      })(),
      tope,
    ]);
    return { texto: data.text ?? "", confianza: data.confidence ?? 0 };
  } catch (err) {
    // Un worker que no contestó a tiempo puede seguir ocupado: se lo mata.
    await apagarWorker();
    throw err;
  } finally {
    clearTimeout(corte);
  }
}

// ── La imagen ───────────────────────────────────────────────────────────────

type Sharp = typeof import("sharp");
interface Caja { left: number; top: number; width: number; height: number }
/** Una página ya decodificada una sola vez: de acá salen la vista chica, los recortes y la entera. */
interface Pagina { datos: Buffer; width: number; height: number; channels: 1 | 2 | 3 | 4 }

async function decodificar(sharp: Sharp, cruda: Buffer): Promise<Pagina> {
  const { data, info } = await sharp(cruda, { limitInputPixels: 80_000_000 })
    .rotate() // la orientación de la foto del celular
    .flatten({ background: BLANCO }) // el PDF dibujado trae fondo transparente
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { datos: data, width: info.width, height: info.height, channels: info.channels };
}

const desde = (sharp: Sharp, p: Pagina) =>
  sharp(p.datos, { raw: { width: p.width, height: p.height, channels: p.channels } });

/**
 * Dónde hay tinta: bandas de filas con tinta y el ancho que ocupa cada una,
 * sobre una vista de 300 px (unos ms). Devuelve las cajas en píxeles de la
 * página y qué fracción de la hoja cubren.
 */
async function cajasConTinta(sharp: Sharp, p: Pagina): Promise<{ cajas: Caja[]; cobertura: number }> {
  const W = 300;
  const { data, info } = await desde(sharp, p).grayscale().resize({ width: W }).raw().toBuffer({ resolveWithObject: true });
  const H = info.height;
  const tinta = (x: number, y: number) => data[y * W + x] < UMBRAL_TINTA;
  const bandas: [number, number][] = [];
  let ini = -1;
  let hueco = 0;
  for (let y = 0; y < H; y++) {
    let n = 0;
    for (let x = 0; x < W; x++) if (tinta(x, y)) n++;
    if (n / W > 0.01) {
      if (ini < 0) ini = y;
      hueco = 0;
    } else if (ini >= 0 && ++hueco > 6) {
      bandas.push([ini, y - hueco]);
      ini = -1;
      hueco = 0;
    }
  }
  if (ini >= 0) bandas.push([ini, H - 1]);

  const f = p.width / W;
  const cajas: Caja[] = [];
  let area = 0;
  for (const [a, b] of bandas) {
    let x0 = W;
    let x1 = -1;
    for (let y = a; y <= b; y++) for (let x = 0; x < W; x++) if (tinta(x, y)) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
    const caja = (x1 - x0) * (b - a);
    if (x1 < 0 || caja < W * H * 0.005) continue; // una raya, un punto de la fotocopia
    area += caja;
    cajas.push({ left: Math.round(x0 * f), top: Math.round(a * f), width: Math.round((x1 - x0 + 1) * f), height: Math.round((b - a + 1) * f) });
  }
  return { cajas, cobertura: area / (W * H) };
}

/** La página entera, en gris y a un ancho que el OCR lea bien. */
async function prepararEntera(sharp: Sharp, p: Pagina): Promise<Buffer> {
  const ancho = p.width < ANCHO_MIN ? ANCHO_MIN : p.width > ANCHO_MAX ? ANCHO_MAX : null;
  const base = desde(sharp, p).grayscale();
  return (ancho ? base.resize({ width: ancho }) : base).normalise().png().toBuffer();
}

/**
 * Un bloque recortado con margen, en el canal más claro (el
 * fondo estampado se borra y la letra oscura queda), agrandado y suavizado
 * (la trama de la fotocopia se vuelve gris parejo).
 */
async function prepararRecorte(sharp: Sharp, p: Pagina, c: Caja): Promise<Buffer> {
  const m = Math.round(p.width * 0.01);
  const left = Math.max(0, c.left - m);
  const top = Math.max(0, c.top - m);
  const region = { left, top, width: Math.min(p.width - left, c.width + 2 * m), height: Math.min(p.height - top, c.height + 2 * m) };
  let canal: number | null = null;
  if (p.channels >= 3) {
    const { channels } = await desde(sharp, p).extract(region).stats();
    // Siempre el más claro, aunque la diferencia sea chica: en el DNI de Blas
    // las medias eran 232/236/237 y sólo el azul dejó leer la zona mecánica
    // (en gris, nada). En una hoja gris los tres canales son el mismo.
    const medias = channels.slice(0, 3).map((x) => x.mean);
    canal = medias.indexOf(Math.max(...medias));
  }
  const recorte = desde(sharp, p).extract(region);
  const unCanal = canal === null ? recorte.grayscale() : recorte.extractChannel(canal as 0 | 1 | 2);
  const chico = region.width < ANCHO_RECORTE;
  const grande = chico ? unCanal.resize({ width: ANCHO_RECORTE, kernel: "lanczos3" }).blur(1.2) : unCanal;
  return grande.normalise().png().toBuffer();
}

/** De la pasada de identidad sólo sirven las líneas de la zona mecánica; el resto es ruido sin minúsculas. */
const lineasMrz = (t: string) =>
  t.split("\n").map((l) => l.trim()).filter((l) => /<{2,}|\d{6}.[MF<]\d{6}/.test(l)).join("\n");

const letras = (t: string) => (t.match(/[a-záéíóúñ0-9]/gi) ?? []).length;

/**
 * Ancho y alto de cada página en puntos, ya girada (/Rotate 90 cambia ancho por
 * alto). Sirve para no pedir un dibujo de 64 MP antes de saberlo. Un PDF que
 * pdf-lib no abre (cifrado raro, roto) da una página de medida desconocida.
 */
async function medidasDePaginas(buf: Buffer): Promise<({ w: number; h: number } | null)[]> {
  try {
    const { PDFDocument } = await import("pdf-lib");
    const pdf = await PDFDocument.load(new Uint8Array(buf), { ignoreEncryption: true, updateMetadata: false });
    return pdf.getPages().map((p) => {
      const { width, height } = p.getCropBox();
      const girada = Math.abs(p.getRotation().angle) % 180 === 90;
      return width > 0 && height > 0 ? (girada ? { w: height, h: width } : { w: width, h: height }) : null;
    });
  } catch {
    return [null];
  }
}

/** La escala más cercana a `deseada` que no pasa del ancho ni de los píxeles tope. */
function escalaAcotada(deseada: number, w: number, h: number): number {
  return Math.min(deseada, ANCHO_DIBUJO_MAX / w, Math.sqrt(PIXELES_DIBUJO_MAX / (w * h)));
}

/** Cada hoja: cómo dibujarla para mirarla y, si es PDF, cómo dibujarla fina para recortar. */
interface Hoja {
  dibujar: () => Promise<Buffer | null>;
  /** Recibe la medida en puntos (sale del dibujo base); null = no vale la pena. */
  fina?: (w: number, h: number) => Promise<Buffer | null> | null;
  escala: number;
}

/**
 * El texto de un PDF escaneado o de una foto, leído en el servidor.
 *
 * Nunca tira: devuelve el motivo para que quien llama decida qué decir.
 */
export async function ocrEnServidor(
  datos: Buffer | Uint8Array,
  mimeType: string,
  opciones: { maxPaginas?: number } = {},
): Promise<ResultadoOcr> {
  if (!ocrServidorSoporta(mimeType)) return { ok: false, motivo: "no_soportado" };
  if (datos.byteLength > OCR_MAX_BYTES) return { ok: false, motivo: "muy_grande" };
  const langPath = carpetaDelIdioma();
  if (!langPath) {
    logger.warn("documents.ocr_servidor.sin_idioma", {});
    return { ok: false, motivo: "sin_idioma" };
  }
  const buf = Buffer.isBuffer(datos) ? datos : Buffer.from(datos);
  const entro = Date.now();
  return enFila(
    (turno) =>
      leerDocumento(buf, mimeType, langPath, opciones.maxPaginas ?? OCR_MAX_PAGINAS, turno, Date.now() - entro).catch(
        (err): ResultadoOcr => {
          logger.warn("documents.ocr_servidor.fallo", { err: err instanceof Error ? err.message : String(err) });
          return { ok: false, motivo: "falla" };
        },
      ),
    { ok: false, motivo: "falla" },
  );
}

async function leerDocumento(
  buf: Buffer,
  mimeType: string,
  langPath: string,
  maxPaginas: number,
  turno: Turno,
  esperaMs: number,
): Promise<ResultadoOcr> {
  const inicio = Date.now();
  const queda = () => !turno.cortado && Date.now() < turno.vence;
  const sharp = (await import("sharp")).default;

  const hojas: Hoja[] = [];
  if (mimeType === "application/pdf") {
    const medidas = await medidasDePaginas(buf);
    const n = Math.max(1, Math.min(medidas.length, maxPaginas));
    for (let i = 1; i <= n; i++) {
      const m = medidas[i - 1];
      const escala = m ? escalaAcotada(ESCALA_BASE, m.w, m.h) : ESCALA_BASE;
      hojas.push({
        escala,
        dibujar: () => renderizarPaginaPdf(buf, i, undefined, { escala }),
        fina: (w, h) => {
          const fina = escalaAcotada(ESCALA_FINA, w, h);
          return fina >= escala * MEJORA_FINA_MIN ? renderizarPaginaPdf(buf, i, undefined, { escala: fina }) : null;
        },
      });
    }
  } else {
    hojas.push({ escala: 1, dibujar: async () => buf });
  }

  const textos: string[] = [];
  const confianzas: number[] = [];
  let paginas = 0;
  let fallas = 0;

  /** Una pasada que falla (o se pasa de tiempo) da null y deja seguir con lo demás. */
  const pasar = async (imagen: Buffer, pasada: Pasada) => {
    if (!queda()) return null;
    try {
      return await leerImagen(imagen, langPath, pasada);
    } catch (err) {
      fallas++;
      logger.warn("documents.ocr_servidor.pasada_fallo", { psm: pasada.psm, err: err instanceof Error ? err.message : String(err) });
      return null;
    }
  };

  for (const [n, hoja] of hojas.entries()) {
    if (!queda()) break;
    // Una página que no se deja dibujar o decodificar no tira lo leído de las otras.
    try {
      const cruda = await hoja.dibujar();
      if (!cruda) continue;
      const pagina = await decodificar(sharp, cruda);
      const { cajas, cobertura } = await cajasConTinta(sharp, pagina);
      const porBloques = cobertura < COBERTURA_DISPERSA && cajas.length > 0 && cajas.length <= MAX_RECORTES;
      // Los recortes salen del dibujo fino; las cajas se pasan a su escala.
      let fuente = pagina;
      let recortes = cajas;
      const fino = porBloques && hoja.fina ? await hoja.fina(pagina.width / hoja.escala, pagina.height / hoja.escala) : null;
      if (fino) {
        fuente = await decodificar(sharp, fino);
        const k = fuente.width / pagina.width;
        recortes = cajas.map((c) => ({
          left: Math.round(c.left * k),
          top: Math.round(c.top * k),
          width: Math.min(fuente.width, Math.round(c.width * k)),
          height: Math.min(fuente.height, Math.round(c.height * k)),
        }));
      }

      const piezas: { imagen: Buffer; psm: Pasada["psm"] }[] = porBloques
        ? await Promise.all(recortes.map(async (c) => ({ imagen: await prepararRecorte(sharp, fuente, c), psm: "11" as const })))
        : [{ imagen: await prepararEntera(sharp, pagina), psm: "3" }];

      const deLaPagina: string[] = [];
      for (const pieza of piezas) {
        let leido = await pasar(pieza.imagen, { psm: pieza.psm });
        if (!leido) continue;
        // Página entera que no dio casi nada (una foto con mucho fondo): como texto suelto.
        if (pieza.psm === "3" && letras(leido.texto) < 30) {
          const suelto = await pasar(pieza.imagen, { psm: "11" });
          if (suelto && letras(suelto.texto) > letras(leido.texto)) leido = suelto;
        }
        if (leido.texto.trim()) {
          deLaPagina.push(leido.texto.trim());
          confianzas.push(leido.confianza);
        }
        if (PARECE_IDENTIDAD.test(leido.texto)) {
          const mrz = await pasar(pieza.imagen, { psm: "6", lista: LISTA_MRZ });
          const lineas = mrz ? lineasMrz(mrz.texto) : "";
          if (lineas) deLaPagina.push(lineas);
        }
      }
      if (deLaPagina.length) {
        textos.push(deLaPagina.join("\n"));
        paginas++;
      }
    } catch (err) {
      fallas++;
      logger.warn("documents.ocr_servidor.pagina_fallo", { pagina: n + 1, err: err instanceof Error ? err.message : String(err) });
    }
  }

  const ms = Date.now() - inicio;
  if (!textos.length) return { ok: false, motivo: fallas > 0 ? "falla" : "sin_texto" };
  const confianza = Math.round(confianzas.reduce((s, c) => s + c, 0) / Math.max(1, confianzas.length));
  logger.info("documents.ocr_servidor.leido", { paginas, confianza, ms, esperaMs, fallas });
  return { ok: true, texto: textos.join("\n\n"), paginas, confianza, ms };
}

/** Para scripts y tests: apaga el worker ya, sin esperar el temporizador. */
export const apagarOcrServidor = apagarWorker;
