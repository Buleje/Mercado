/**
 * Avisos de cámaras al celular por Web Push (2026-10-10) — la parte pura.
 *
 * Brandon: «que lo que detecta la PC con las cámaras abiertas me llegue al
 * celular». El detector del mosaico ya avisa por WhatsApp (`avisar.ts`), pero
 * ese aviso sale como texto libre si el negocio no tiene la plantilla aprobada
 * y Meta lo descarta fuera de las 24 h (medido 10-10 en Blas). El push al
 * navegador no tiene ventana ni plantilla: llega mientras el celular tenga
 * internet.
 *
 * Cada dispositivo se suscribe POR CÁMARA y con su franja («siempre» o «sólo
 * de noche»): el dueño puede querer el portón de noche y el patio siempre. La
 * pausa de 10 minutos es por cámara y una sola para todos los dispositivos:
 * una persona = un aviso en cada teléfono, no uno por foto.
 *
 * Privacidad (Ley 29733): el aviso NO lleva la foto. Lleva cámara, hora y
 * cuántas personas, cifrado de punta a punta (RFC 8291: el servicio de push
 * de Google/Apple/Mozilla no lo puede leer), y el enlace a «Personas» del
 * panel, que pide sesión.
 *
 * Sin `server-only`: la pantalla importa los tipos y `idDeEndpoint`.
 */

import { MINUTOS_ENTRE_AVISOS, esNocheEnLima, type Camara } from "./camaras";
import type { MetaFotoPersona } from "./personas";

/** Cuándo avisa a ESTE dispositivo. «No avisar» = no estar en la lista. */
export type CuandoCelular = "siempre" | "noche";
export const CUANDO_CELULAR: readonly CuandoCelular[] = ["siempre", "noche"];

export interface ClavesPush {
  p256dh: string;
  auth: string;
}

/** Un navegador que recibe avisos. El `endpoint` y las claves nunca salen del servidor. */
export interface CelularSuscrito {
  /** `idDeEndpoint(endpoint)`: lo único que ve la pantalla para reconocerse. */
  id: string;
  endpoint: string;
  keys: ClavesPush;
  /** Usuario del panel que lo prendió: si lo dan de baja, deja de recibir. */
  usuario: string;
  /** «Chrome en Android», para que la lista diga a dónde llega. */
  dispositivo: string;
  /** cámara → franja. */
  camaras: Record<string, CuandoCelular>;
  creadoEn: string;
}

export interface EstadoCelulares {
  dispositivos: CelularSuscrito[];
  /** cámara → ISO del último push que salió (la pausa de 10 min). */
  ultimoPush: Record<string, string>;
}

/** Lo que ve la pantalla de cada dispositivo: sin endpoint ni claves. */
export interface CelularVisible {
  id: string;
  usuario: string;
  dispositivo: string;
  cuando: CuandoCelular;
  creadoEn: string;
}

/** Tope de dispositivos por negocio: cada aviso es un envío por dispositivo. */
export const MAX_CELULARES = 20;
/**
 * Tope por usuario (revisión de seguridad 10-10): sin él, una sola sesión podía
 * llenar los 20 cupos del negocio con suscripciones inventadas y dejar al dueño
 * sin lugar para su celular.
 */
export const MAX_CELULARES_POR_USUARIO = 5;

/**
 * Servicios de push que se aceptan. El servidor hace un POST a ese endpoint en
 * cada aviso: sin esta lista, una suscripción inventada lo haría pegarle a
 * cualquier dirección interna (SSRF).
 */
const SERVICIOS_DE_PUSH = [
  "fcm.googleapis.com",
  /* El de Chromium sin marca (y el Chrome de Playwright): medido 10-10, `jmt17.google.com/fcm/send/…`. */
  "jmt17.google.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com",
];

export function endpointDePushValido(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    if (u.protocol !== "https:" || u.port || u.username || u.password) return false;
    const h = u.hostname.toLowerCase();
    return SERVICIOS_DE_PUSH.includes(h) || /^[a-z0-9-]+\.notify\.windows\.com$/.test(h);
  } catch {
    return false;
  }
}

/**
 * Id corto del endpoint (SHA-256, 16 hex). El navegador lo calcula con su
 * propio endpoint para saber «este soy yo» sin que el servidor se lo devuelva.
 */
export async function idDeEndpoint(endpoint: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(bytes).slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** «Chrome en Android» desde el user-agent. Sólo para leer la lista. */
export function etiquetaDispositivo(ua: string): string {
  const s = ua ?? "";
  const navegador = /Edg\//.test(s)
    ? "Edge"
    : /OPR\/|Opera/.test(s)
      ? "Opera"
      : /SamsungBrowser/.test(s)
        ? "Samsung Internet"
        : /Firefox\//.test(s)
          ? "Firefox"
          : /Chrome\/|CriOS/.test(s)
            ? "Chrome"
            : /Safari\//.test(s)
              ? "Safari"
              : "Navegador";
  const sistema = /iPhone/.test(s)
    ? "iPhone"
    : /iPad/.test(s)
      ? "iPad"
      : /Android/.test(s)
        ? "Android"
        : /Windows/.test(s)
          ? "Windows"
          : /Mac OS X|Macintosh/.test(s)
            ? "Mac"
            : /Linux/.test(s)
              ? "Linux"
              : "";
  return sistema ? `${navegador} en ${sistema}` : navegador;
}

/** ¿Esta franja avisa ahora? «Noche» = 19:00–06:00 de Lima, la misma de los WhatsApp. */
export function franjaAvisa(cuando: CuandoCelular, ahora: Date): boolean {
  return cuando === "siempre" || esNocheEnLima(ahora);
}

/** ¿Pasó la pausa desde el último push de esta cámara? */
export function fueraDeLaPausa(ultimoPushEn: string | null | undefined, ahora: Date): boolean {
  if (!ultimoPushEn) return true;
  const hace = ahora.getTime() - new Date(ultimoPushEn).getTime();
  return !Number.isFinite(hace) || hace >= MINUTOS_ENTRE_AVISOS * 60_000;
}

/**
 * A qué dispositivos va el aviso de esta cámara ahora. Vacío si la cámara está
 * apagada, si está dentro de la pausa o si ninguna franja toca. El motivo de la
 * foto («sigue» no avisa) lo filtra quien llama, con la misma lista que el
 * WhatsApp.
 */
export function destinatariosDelPush(
  camara: Pick<Camara, "id" | "activa">,
  dispositivos: readonly CelularSuscrito[],
  ahora: Date,
  ultimoPushEn: string | null | undefined,
): CelularSuscrito[] {
  if (!camara.activa || !fueraDeLaPausa(ultimoPushEn, ahora)) return [];
  return dispositivos.filter((d) => {
    const cuando = d.camaras?.[camara.id];
    return (cuando === "siempre" || cuando === "noche") && franjaAvisa(cuando, ahora);
  });
}

/** Los dispositivos de una cámara como los ve la pantalla. */
export function celularesDeLaCamara(estado: EstadoCelulares, camaraId: string): CelularVisible[] {
  return estado.dispositivos
    .filter((d) => d.camaras?.[camaraId])
    .map((d) => ({
      id: d.id,
      usuario: d.usuario,
      dispositivo: d.dispositivo,
      cuando: d.camaras[camaraId],
      creadoEn: d.creadoEn,
    }));
}

const HORA = new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima",
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit",
});

/** Título y cuerpo del aviso. Sin foto ni datos de la persona: ver la cabecera. */
export function textoDelPush(
  camara: Pick<Camara, "nombre" | "lugar">,
  meta: Pick<MetaFotoPersona, "motivo" | "personas">,
  cuando: Date,
): { title: string; body: string } {
  const n = meta.personas;
  const que =
    meta.motivo === "mas_gente"
      ? n > 1
        ? `Llegó otra persona: ahora son ${n}.`
        : "Llegó otra persona."
      : n > 1
        ? `Aparecieron ${n} personas.`
        : "Apareció una persona.";
  const lugar = camara.lugar ? ` (${camara.lugar})` : "";
  return {
    title: `📷 ${camara.nombre}${lugar} · ${HORA.format(cuando)}`,
    body: `${que} Toca para ver las fotos.`,
  };
}

/** A dónde lleva el toque: la galería «Personas» del panel (pide sesión). */
export const URL_PERSONAS = "/admin?tab=camaras&vista=personas";
