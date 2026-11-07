/**
 * Espejo del celular › «Que también lo vean otros equipos» (24-10, pedido de
 * Brandon: «mirarlo desde otro equipo del panel —tablet, otra PC— a 1 cuadro
 * cada 1-2 segundos, sin guardar fotos ni pasarlas por la IA»).
 *
 * Lo que comparten la PC que espeja, el servidor y el visor: tiempos, medidas
 * y textos. Sin React ni servidor, así se prueba suelto. El camino:
 *
 *   PC (scrcpy + `<video>`) ── cada 1,5 s, un cuadro reducido ──▶
 *   POST /api/admin/camaras/espejo/cuadro ── sólo el último, 10 s, en memoria
 *   efímera (Upstash o un Map) ──▶ GET del mismo recurso desde otro equipo
 *   CON EL MISMO USUARIO.
 *
 * A propósito NO va por la entrada de las cámaras (`modo=vivo`): esa guarda
 * fotos en el bucket público y les pasa la IA, y del celular salen WhatsApp o
 * el banco (Ley 29733).
 */

export const URL_CUADRO_ESPEJO = "/api/admin/camaras/espejo/cuadro";

/** Cada cuánto la PC toma un cuadro del `<video>`. */
export const INTERVALO_ENVIO_MS = 1500;
/** Con la pantalla quieta no se manda el mismo cuadro: se reenvía sólo para que no venza. */
export const REENVIO_SIN_CAMBIO_MS = 4500;
/** Lado mayor del cuadro que sale de la PC: alcanza para leer la pantalla en una tablet. */
export const LADO_MAX_CUADRO = 720;
export const CALIDAD_CUADRO = 0.6;
/** Si con 0,6 pasa el tope (pantallas con fotos), un segundo intento más liviano. */
export const CALIDAD_CUADRO_MINIMA = 0.4;
/** Tope del cuerpo en el servidor; a 720 px y 0,6 un cuadro pesa ~30-120 KB. */
export const MAX_BYTES_CUADRO = 200 * 1024;
/** El servidor acepta hasta este lado (margen sobre `LADO_MAX_CUADRO`); más es un cuadro que no salió de esta pantalla. */
export const LADO_MAX_ENTRADA = 1600;
/** Cuánto vive el último cuadro: pasado esto, «no hay espejo ahora». */
export const SEGUNDOS_VIDA_CUADRO = 10;

/** Cada cuánto pregunta el visor mientras llegan cuadros, y cuando nadie comparte. */
export const INTERVALO_VISOR_MS = 1500;
export const INTERVALO_VISOR_SIN_ESPEJO_MS = 5000;
/** Más viejo que esto, el visor avisa que llega lento. */
export const SEGUNDOS_CUADRO_LENTO = 5;

export const TIPOS_CUADRO = ["image/jpeg", "image/webp"] as const;
export type TipoCuadro = (typeof TIPOS_CUADRO)[number];

/** Identifica la pestaña que comparte (no es un secreto: sólo evita que dos equipos se pisen). */
export const HEADER_EMISOR = "x-espejo-emisor";
export const EMISOR_RE = /^[A-Za-z0-9-]{8,64}$/;
/** Edad del cuadro medida en el SERVIDOR: el reloj de una tablet puede estar corrido minutos. */
export const HEADER_EDAD = "x-cuadro-edad-ms";

/** Medidas del cuadro reducido (lado mayor ≤ `ladoMax`, nunca agranda). `null` = el video todavía no tiene cuadro. */
export function medidasReducidas(
  ancho: number,
  alto: number,
  ladoMax: number = LADO_MAX_CUADRO,
): { ancho: number; alto: number } | null {
  if (!(ancho > 0) || !(alto > 0)) return null;
  const escala = Math.min(1, ladoMax / Math.max(ancho, alto));
  return {
    ancho: Math.max(1, Math.round(ancho * escala)),
    alto: Math.max(1, Math.round(alto * escala)),
  };
}

/** Lado de la huella en gris con que se compara un cuadro con el anterior. */
export const LADO_HUELLA = 16;
/** Diferencia de gris (0-255) en un bloque que ya cuenta como cambio: la captura de pantalla no tiene ruido. */
const UMBRAL_HUELLA = 4;

/** Huella en gris a partir de los píxeles RGBA de un lienzo de `LADO_HUELLA`². */
export function huellaGris(rgba: ArrayLike<number>): Uint8Array {
  const n = Math.floor(rgba.length / 4);
  const huella = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    huella[i] = Math.round(
      0.299 * rgba[i * 4]! + 0.587 * rgba[i * 4 + 1]! + 0.114 * rgba[i * 4 + 2]!,
    );
  }
  return huella;
}

/** ¿Cambió la pantalla? Basta un bloque: una notificación chica cambia pocos. */
export function cambioDeHuella(antes: ArrayLike<number> | null, ahora: ArrayLike<number>): boolean {
  if (!antes || antes.length !== ahora.length) return true;
  for (let i = 0; i < ahora.length; i++)
    if (Math.abs(ahora[i]! - antes[i]!) >= UMBRAL_HUELLA) return true;
  return false;
}

/** Se manda si la pantalla cambió, o si pasó el reenvío (así el cuadro del servidor no vence con el celular quieto). */
export function tocaEnviar(cambio: boolean, msDesdeUltimoEnvio: number): boolean {
  return cambio || msDesdeUltimoEnvio >= REENVIO_SIN_CAMBIO_MS;
}

/** «12 s», «3 min», «más de una hora». */
export function duracionCorta(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const min = Math.round(s / 60);
  return min < 60 ? `${min} min` : "más de una hora";
}

export type TonoVisor = "ok" | "aviso" | "neutro";

/**
 * La línea de estado del visor.
 * @param tsLocal cuándo se tomó el último cuadro visto, en el reloj de ESTE equipo (llegada − edad del servidor).
 * @param hayCuadro la última consulta trajo cuadro (200) o no (204).
 */
export function textoVisor(
  tsLocal: number | null,
  hayCuadro: boolean,
  ahora: number,
): { texto: string; tono: TonoVisor } {
  if (tsLocal === null) return { texto: "Ahora no lo compartes desde otro equipo", tono: "neutro" };
  const edad = ahora - tsLocal;
  if (!hayCuadro) return { texto: `Se cortó hace ${duracionCorta(edad)}`, tono: "aviso" };
  return edad <= SEGUNDOS_CUADRO_LENTO * 1000
    ? { texto: `Hace ${duracionCorta(edad)}`, tono: "ok" }
    : { texto: `Hace ${duracionCorta(edad)} · llega lento`, tono: "aviso" };
}
