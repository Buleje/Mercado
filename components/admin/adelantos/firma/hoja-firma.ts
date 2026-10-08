/**
 * Arma las imágenes del recibo firmado en el navegador (canvas):
 *   · la firma sola, en tinta negra sobre blanco, para el PDF;
 *   · la HOJA que se guarda como foto del adelanto: la foto que ya tenía (el
 *     voucher) arriba, y debajo la firma con el monto, quién firmó y la hora.
 *
 * Es papel, no pantalla: blanco y negro en los dos temas (por eso colores con
 * nombre y no tokens del tema).
 */

import type { LineasHoja } from "@/lib/adelantos/recibo-firmado";
import { cajaDeTrazos, encuadrar, pintarTrazos, type Trazo } from "@/lib/firma/trazos";

const PAPEL = "white";
const TINTA = "black";
const GRIS = "dimgray";
const FUENTE = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/** La firma recortada a su tinta, en un canvas de `ancho × alto`. */
export function firmaEnCanvas(trazos: readonly Trazo[], ancho = 900, alto = 300): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = ancho;
  c.height = alto;
  const ctx = c.getContext("2d");
  const caja = cajaDeTrazos(trazos);
  if (!ctx || !caja) return c;
  ctx.fillStyle = PAPEL;
  ctx.fillRect(0, 0, ancho, alto);
  pintarTrazos(ctx, trazos, { encuadre: encuadrar(caja, ancho, alto, 16), tinta: TINTA, grosor: 5 });
  return c;
}

/**
 * Carga una imagen ya guardada para pintarla en un canvas. `crossOrigin`: el
 * bucket público responde con `Access-Control-Allow-Origin: *`; sin pedirlo
 * así, el canvas queda «manchado» y no se puede exportar. La hoja privada
 * (`/api/adelantos/<id>/comprobante`) es del mismo origen: con `anonymous` el
 * navegador igual manda la cookie de la sesión.
 */
export function cargarImagen(url: string, msTope = 15_000): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const tope = window.setTimeout(() => reject(new Error("tardó demasiado")), msTope);
    img.crossOrigin = "anonymous";
    img.onload = () => {
      window.clearTimeout(tope);
      resolve(img);
    };
    img.onerror = () => {
      window.clearTimeout(tope);
      reject(new Error("no se pudo leer la imagen"));
    };
    img.src = url;
  });
}

/** Parte un texto en renglones que entren en `ancho` píxeles. */
function renglones(ctx: CanvasRenderingContext2D, texto: string, ancho: number): string[] {
  const salida: string[] = [];
  let linea = "";
  for (const palabra of texto.split(/\s+/)) {
    const prueba = linea ? `${linea} ${palabra}` : palabra;
    if (ctx.measureText(prueba).width > ancho && linea) {
      salida.push(linea);
      linea = palabra;
    } else linea = prueba;
  }
  if (linea) salida.push(linea);
  return salida;
}

interface Renglon {
  texto: string;
  fuente: string;
  color: string;
  alto: number;
}

const ANCHO_HOJA = 1000;
const MARGEN = 40;
const ALTO_FIRMA = 280;
const FOTO_MAX_ALTO = 1100;

/**
 * La hoja que se manda: JPEG de 1000 px de ancho (el servidor la pasa a WebP
 * hasta 1200, así que no se achica). JPEG y no PNG: con el voucher arriba un
 * PNG pasaba de 3 MB y Vercel corta el cuerpo en 4,5. Dos pasadas: medir los
 * renglones con la fuente real y después pintar en un canvas del alto exacto.
 *
 * `anteriorEsFirma`: al volver a firmar, la foto de arriba es la hoja firmada
 * anterior, y se rotula así — decía «Foto que ya tenía el adelanto» y parecía
 * el voucher. Se conserva (lleva el voucher adentro) y queda archivada aparte.
 */
export async function componerHoja({
  trazos,
  lineas,
  fotoAnterior,
  anteriorEsFirma = false,
}: {
  trazos: readonly Trazo[];
  lineas: LineasHoja;
  fotoAnterior?: HTMLImageElement | null;
  anteriorEsFirma?: boolean;
}): Promise<Blob> {
  const util = ANCHO_HOJA - 2 * MARGEN;
  const medidor = document.createElement("canvas").getContext("2d");
  if (!medidor) throw new Error("el navegador no deja dibujar");

  const bloque = (texto: string, px: number, peso: number, color = TINTA): Renglon[] => {
    medidor.font = `${peso} ${px}px ${FUENTE}`;
    return renglones(medidor, texto, util).map((t) => ({ texto: t, fuente: medidor.font, color, alto: Math.round(px * 1.35) }));
  };
  const arriba = [...bloque(lineas.titulo, 34, 700), ...bloque(lineas.monto, 44, 800), ...bloque(lineas.letras, 24, 500, GRIS), ...bloque(lineas.quien, 24, 500)];
  const abajo = [...bloque(lineas.firmo, 28, 700), ...bloque(lineas.cuando, 24, 500), ...bloque(lineas.pie, 18, 400, GRIS)];

  const escalaFoto = fotoAnterior ? Math.min(util / fotoAnterior.naturalWidth, FOTO_MAX_ALTO / fotoAnterior.naturalHeight, 1) : 0;
  const altoFoto = fotoAnterior ? Math.round(fotoAnterior.naturalHeight * escalaFoto) + 40 + 36 : 0;
  const suma = (r: Renglon[]) => r.reduce((s, x) => s + x.alto, 0);
  const alto = MARGEN + altoFoto + suma(arriba) + 24 + ALTO_FIRMA + 16 + suma(abajo) + MARGEN;

  const c = document.createElement("canvas");
  c.width = ANCHO_HOJA;
  c.height = alto;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("el navegador no deja dibujar");
  ctx.fillStyle = PAPEL;
  ctx.fillRect(0, 0, ANCHO_HOJA, alto);
  ctx.textBaseline = "top";

  let y = MARGEN;
  const escribir = (lista: Renglon[]) => {
    for (const r of lista) {
      ctx.font = r.fuente;
      ctx.fillStyle = r.color;
      ctx.fillText(r.texto, MARGEN, y);
      y += r.alto;
    }
  };

  if (fotoAnterior) {
    escribir(bloque(anteriorEsFirma ? "Recibo firmado anterior (reemplazado)" : "Foto que ya tenía el adelanto", 20, 600, GRIS));
    const w = Math.round(fotoAnterior.naturalWidth * escalaFoto);
    const h = Math.round(fotoAnterior.naturalHeight * escalaFoto);
    ctx.drawImage(fotoAnterior, MARGEN + (util - w) / 2, y, w, h);
    y += h + 20;
    ctx.strokeStyle = GRIS;
    ctx.setLineDash([10, 8]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(MARGEN, y);
    ctx.lineTo(ANCHO_HOJA - MARGEN, y);
    ctx.stroke();
    ctx.setLineDash([]);
    y += 20;
  }

  escribir(arriba);
  y += 24;
  ctx.drawImage(firmaEnCanvas(trazos, util, ALTO_FIRMA), MARGEN, y);
  y += ALTO_FIRMA;
  ctx.strokeStyle = TINTA;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(MARGEN, y);
  ctx.lineTo(ANCHO_HOJA - MARGEN, y);
  ctx.stroke();
  y += 16;
  escribir(abajo);

  return new Promise((resolve, reject) => {
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("no se pudo armar la imagen"))), "image/jpeg", 0.92);
  });
}

/** Una imagen guardada como JPEG en data URL, para meterla en el PDF. */
export async function imagenComoJpeg(url: string): Promise<string> {
  const img = await cargarImagen(url);
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("el navegador no deja dibujar");
  ctx.fillStyle = PAPEL;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0);
  return c.toDataURL("image/jpeg", 0.85);
}
