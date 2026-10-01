"use client";

/**
 * Quemar el sello (fecha y hora, quién, dónde, GTF) en la foto de la carga,
 * ANTES de subirla (ADR-434).
 *
 * Por qué en la imagen y no sólo en los metadatos: la foto sale del sistema
 * —se imprime en el papel de la guía, se reenvía por WhatsApp, se guarda en una
 * carpeta— y los metadatos se quedan atrás. La franja viaja con el píxel.
 *
 * La franja se AGREGA debajo (el lienzo crece), no se pinta encima: tapar el
 * pie de la pila justo donde suele estar la codificación del rollizo sería
 * esconder lo que la foto venía a mostrar.
 *
 * Los colores del lienzo no son tokens del panel: la imagen se ve igual en tema
 * claro, oscuro o impresa, así que la franja es fija (tinta del logo, texto
 * blanco), como un sello de cámara.
 */

const LADO_MAX = 1600;
const CALIDAD = 0.85;
const FONDO_FRANJA = "rgb(18, 24, 30)";
const TEXTO_FRANJA = "rgb(255, 255, 255)";
const TEXTO_TENUE = "rgba(255, 255, 255, 0.78)";

/** Achica el texto con «…» hasta que entre en `ancho`. */
function recortar(ctx: CanvasRenderingContext2D, texto: string, ancho: number): string {
  if (ctx.measureText(texto).width <= ancho) return texto;
  let t = texto;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > ancho) t = t.slice(0, -1);
  return `${t}…`;
}

/**
 * Decodifica la foto pidiéndole al navegador que la achique DE UNA (no decodificar
 * los 12 MP completos —~48 MB en memoria— para recién después achicarla en el
 * canvas, que era lo que hacía morir la pestaña en un celular con poca RAM).
 * `resizeWidth` acota el ancho ya en el decode; si la foto es apaisada el alto
 * queda igual de chico, y si es vertical (el caso común de un teléfono) el
 * alto puede salir algo más grande que `LADO_MAX` — el `ratio` de siempre,
 * más abajo, lo vuelve a acotar sobre un bitmap que ya es mucho más chico que
 * el original. Si el navegador no soporta el resize (o lo rechaza), cae al
 * decode normal.
 */
async function decodificarAchicado(archivo: Blob): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(archivo, {
      imageOrientation: "from-image",
      resizeWidth: LADO_MAX,
      resizeQuality: "high",
    });
  } catch {
    return createImageBitmap(archivo, { imageOrientation: "from-image" }).catch(() => null);
  }
}

/**
 * Devuelve la foto sellada (WebP, lado mayor ≤ 1600 px) o `null` si el
 * navegador no la sabe abrir (p. ej. HEIC en Chrome): en ese caso quien llama
 * sube la foto sin sello y lo dice (`sellada: false`), en vez de perderla.
 */
export async function sellarImagen(archivo: Blob, lineas: readonly string[]): Promise<Blob | null> {
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") return null;
  const bitmap = await decodificarAchicado(archivo);
  if (!bitmap) return null;
  try {
    const ratio = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * ratio));
    const h = Math.max(1, Math.round(bitmap.height * ratio));

    // La letra escala con la foto: legible en una miniatura y en una hoja A4.
    const letra = Math.max(14, Math.min(40, Math.round(w * 0.028)));
    const interlinea = Math.round(letra * 1.35);
    const margen = Math.round(letra * 0.8);
    const franja = margen * 2 + interlinea * lineas.length;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h + franja;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(bitmap, 0, 0, w, h);
    ctx.fillStyle = FONDO_FRANJA;
    ctx.fillRect(0, h, w, franja);

    ctx.textBaseline = "top";
    const ancho = w - margen * 2;
    lineas.forEach((linea, i) => {
      // La primera (fecha y hora) manda: va en negrita y blanco pleno.
      ctx.font = `${i === 0 ? 700 : 500} ${letra}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
      ctx.fillStyle = i === 0 ? TEXTO_FRANJA : TEXTO_TENUE;
      ctx.fillText(recortar(ctx, linea, ancho), margen, h + margen + i * interlinea);
    });

    return await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", CALIDAD));
  } finally {
    bitmap.close?.();
  }
}

/**
 * La ubicación del teléfono, o `null` si se niega el permiso, no hay GPS o
 * tarda más de `timeoutMs`. Nunca rechaza: una foto sin lugar se sube igual.
 */
export function pedirUbicacion(timeoutMs = 6000): Promise<{ lat: number; lng: number; precisionM: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    let listo = false;
    const fin = (v: { lat: number; lng: number; precisionM: number } | null) => {
      if (listo) return;
      listo = true;
      resolve(v);
    };
    // Red de seguridad: algunos navegadores ignoran `timeout` mientras el
    // cartel de permiso sigue abierto sin respuesta.
    const reloj = setTimeout(() => fin(null), timeoutMs + 500);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        clearTimeout(reloj);
        fin({ lat: p.coords.latitude, lng: p.coords.longitude, precisionM: p.coords.accuracy });
      },
      () => {
        clearTimeout(reloj);
        fin(null);
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}
