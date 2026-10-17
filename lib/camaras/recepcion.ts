/**
 * «Probar recepción» (2026-10-05) — lo puro: el aviso de prueba con el formato
 * real de Hikvision, las direcciones que se prueban y cómo se lee cada respuesta.
 *
 * ## Por qué la prueba no deja nada en la base
 *
 * El aviso viaja a la puerta de siempre (`/api/webhooks/camara`) con
 * `modo=prueba`: el receptor lo lee entero —multipart, alerta, foto, sharp—
 * pero NO lo guarda (ni storage, ni historial, ni IA, ni «último aviso»).
 * Marcar y borrar después deja una ventana en la que la foto de prueba existe
 * (la IA la lee, un aviso de WhatsApp sale) y un archivo huérfano en el bucket
 * si el borrado falla; validar sin escribir no tiene esa ventana.
 *
 * Y antes del aviso, un GET a la misma dirección pregunta si ese servidor
 * conoce `modo=prueba` (`prueba: true`). Un servidor viejo —la dirección fija
 * apuntando a un despliegue anterior— trataría el aviso como foto real y la
 * guardaría: sin esa respuesta, la prueba con foto no se manda.
 */

/** Lo que la ruta del webhook contesta a un aviso de prueba. */
export interface RespuestaPrueba {
  ok: boolean;
  prueba?: boolean;
  conFoto?: boolean;
  evento?: string | null;
  error?: string;
}

export type NombrePaso = "llega" | "https" | "http";

export interface PasoRecepcion {
  paso: NombrePaso;
  ok: boolean;
  /** Código HTTP; `null` = no hubo respuesta (DNS, conexión, tiempo). */
  status: number | null;
  ms: number | null;
  /** Qué significa, en el idioma de la pantalla. */
  detalle: string;
}

export interface ResultadoRecepcion {
  /** La base que se probó (la misma que copia la pantalla). */
  base: string | null;
  /** Por qué no se pudo probar nada. */
  bloqueo: "sin_publica" | "tunel_caido" | null;
  pasos: PasoRecepcion[];
  /** Qué protocolo poner en la cámara según lo que llegó; `null` = ninguno llegó. */
  protocolo: "https" | "http" | null;
}

export const RUTA_WEBHOOK = "/api/webhooks/camara";

/** La alerta de Motion Detection 2.0 con blanco «persona», como la manda el firmware. */
export function alertaDePrueba(cuando: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<EventNotificationAlert version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">
<ipAddress>0.0.0.0</ipAddress><channelID>1</channelID>
<dateTime>${cuando}</dateTime>
<activePostCount>1</activePostCount>
<eventType>VMD</eventType><eventState>active</eventState>
<eventDescription>Motion alarm (prueba desde el panel)</eventDescription>
<channelName>Prueba</channelName><targetType>human</targetType>
</EventNotificationAlert>`;
}

/**
 * El cuerpo multipart como lo arma la cámara: la alerta en XML y la foto en
 * una parte con nombre de firmware y `Content-ID`.
 */
export function avisoDePrueba(
  jpeg: Buffer,
  cuando: string,
): { cuerpo: Buffer; contentType: string } {
  const b = "MIME_boundary";
  const salto = "\r\n";
  const cabecera = (lineas: string[]) =>
    Buffer.from(`--${b}${salto}${lineas.join(salto)}${salto}${salto}`, "latin1");
  const cuerpo = Buffer.concat([
    cabecera([
      'Content-Disposition: form-data; name="MoveDetection.xml"',
      "Content-Type: application/xml",
    ]),
    Buffer.from(alertaDePrueba(cuando), "utf8"),
    Buffer.from(salto, "latin1"),
    cabecera([
      'Content-Disposition: form-data; name="VMDImage"; filename="VMDImage.jpg"',
      "Content-Type: image/jpeg",
      "Content-ID: image_1",
    ]),
    jpeg,
    Buffer.from(salto, "latin1"),
    Buffer.from(`--${b}--${salto}`, "latin1"),
  ]);
  return { cuerpo, contentType: `multipart/form-data; boundary=${b}` };
}

/**
 * Las direcciones que se prueban. Con una base HTTPS se prueba además la misma
 * por HTTP (puerto 80): hay firmwares cuyo «HTTP Listening» no ofrece HTTPS, y
 * la pantalla tiene que poder decir si así también llega.
 */
export function direccionesDePrueba(
  base: string,
  token: string,
): { llega: string; https: string | null; http: string | null } {
  const limpia = base.replace(/\/+$/, "");
  const k = encodeURIComponent(token);
  const conToken = (b: string, extra = "") => `${b}${RUTA_WEBHOOK}?k=${k}${extra}`;
  if (limpia.startsWith("https://")) {
    const comoHttp = limpia.replace(/^https:\/\//, "http://");
    return {
      llega: conToken(limpia),
      https: conToken(limpia, "&modo=prueba"),
      http: conToken(comoHttp, "&modo=prueba"),
    };
  }
  return { llega: conToken(limpia), https: null, http: conToken(limpia, "&modo=prueba") };
}

/** Lo que no es respuesta del receptor: el túnel, el DNS, otro servidor. */
function fallaDeCamino(status: number | null, error?: string): string {
  if (status === null) {
    return error === "tiempo"
      ? "No contestó en 12 s: la dirección no llega a este servidor."
      : "No se pudo conectar: la dirección no existe o el túnel no responde.";
  }
  if (status === 404)
    return "En esa dirección no está el receptor de cámaras (¿ese servidor no lo tiene desplegado?).";
  if (status === 429) return "Demasiadas pruebas seguidas: espera 5 minutos y vuelve a probar.";
  if (status === 502 || status === 503 || status === 530) {
    return "La dirección existe pero no alcanza al panel: ¿está prendido el panel (npm run dev) y el túnel abierto?";
  }
  return `Respondió ${status}: no es el receptor de cámaras.`;
}

/** El GET con el token: ¿la dirección llega y conoce esta cámara? */
export function leerLlega(
  status: number | null,
  json: RespuestaPrueba | null,
  ms: number | null,
  error?: string,
): PasoRecepcion {
  const base = { paso: "llega" as const, status, ms };
  if (status === 200 && json?.ok && json.prueba) {
    return { ...base, ok: true, detalle: "La dirección llega al panel y reconoce esta cámara." };
  }
  if (status === 200 && json?.ok) {
    return {
      ...base,
      ok: false,
      detalle:
        "La dirección llega, pero ese servidor es una versión anterior: no sabe probar sin guardar, así que no se mandó la foto de prueba.",
    };
  }
  if (status === 401) {
    return {
      ...base,
      ok: false,
      detalle:
        "La dirección llega, pero no reconoce esta cámara: ¿cambiaste su dirección? Cópiala de nuevo.",
    };
  }
  return { ...base, ok: false, detalle: fallaDeCamino(status, error) };
}

/** El aviso de prueba por HTTPS o por HTTP. */
export function leerAviso(
  paso: "https" | "http",
  status: number | null,
  json: RespuestaPrueba | null,
  ms: number | null,
  error?: string,
): PasoRecepcion {
  const base = { paso, status, ms };
  const nombre = paso === "https" ? "HTTPS (puerto 443)" : "HTTP (puerto 80)";
  if (status === 200 && json?.ok && json.prueba && json.conFoto) {
    return {
      ...base,
      ok: true,
      detalle: `Por ${nombre} llegó el aviso con su foto y se leyó como «persona».`,
    };
  }
  if (status === 200 && json?.ok && json.prueba) {
    return { ...base, ok: false, detalle: `Por ${nombre} llegó el aviso, pero sin la foto.` };
  }
  if (status !== null && status >= 300 && status < 400) {
    return {
      ...base,
      ok: false,
      detalle: `Por ${nombre} la dirección redirige a otra: la cámara no sigue redirecciones. Usa HTTPS.`,
    };
  }
  if (status === 400 && json?.error === "modo_invalido") {
    return {
      ...base,
      ok: false,
      detalle: "Ese servidor es una versión anterior y no sabe probar sin guardar.",
    };
  }
  if (status === 415)
    return { ...base, ok: false, detalle: `Por ${nombre} llegó, pero no aceptó la foto.` };
  return { ...base, ok: false, detalle: fallaDeCamino(status, error) };
}

/** HTTPS si llegó por HTTPS (más seguro); si no, HTTP si llegó así. */
export function protocoloQueSirve(pasos: readonly PasoRecepcion[]): "https" | "http" | null {
  if (pasos.some((p) => p.paso === "https" && p.ok)) return "https";
  if (pasos.some((p) => p.paso === "http" && p.ok)) return "http";
  return null;
}
