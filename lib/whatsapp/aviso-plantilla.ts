/**
 * Avisos del negocio por WhatsApp — las piezas PURAS (sin red ni base).
 *
 * Meta sólo ENTREGA texto libre dentro de las 24 h desde el último mensaje que
 * ese número le mandó al negocio. Fuera de esa ventana lo acepta con 200 y lo
 * descarta (131047): un reporte de las 6 pm que el dueño no pidió por chat
 * «sale» y no llega. Lo que el negocio inicia tiene que ir como PLANTILLA
 * aprobada, con el texto entero en su única variable `{{1}}`.
 *
 * Client-safe: lo usan el envío (servidor) y las pantallas que leen la
 * constancia que queda en `NotificationLog` («¿salió como plantilla o como
 * texto libre?»).
 */

/**
 * Nombre de la plantilla que se busca en el WABA del negocio cuando nadie
 * nombró otra (`WHATSAPP_PLANTILLA_AVISOS`). Si el dueño la aprueba en Meta con
 * este nombre, los avisos pasan a salir como plantilla sin tocar nada más.
 */
export const PLANTILLA_AVISOS_POR_DEFECTO = "aviso_libro_ctp";

/** Tope pedido para el parámetro `{{1}}` (Meta corta el cuerpo entero en 1024). */
export const TOPE_PARAMETRO_PLANTILLA = 1000;
/** Tope del cuerpo de la plantilla YA rellenada (error 132005 si se pasa). */
export const TOPE_CUERPO_PLANTILLA = 1024;
/** Tope de un mensaje de texto de WhatsApp. */
export const TOPE_TEXTO_LIBRE = 4096;

export type ModoEnvioWa = "plantilla" | "texto";
/** De dónde salieron las credenciales: el número del negocio (panel) o el de la plataforma (entorno). */
export type ViaEnvioWa = "negocio" | "servidor";

/** Cómo se nombra cada vía en la constancia (y cómo se reconoce al leerla). */
export const VIA_NEGOCIO = "número del negocio";
export const VIA_SERVIDOR = "cuenta del servidor";
/** La advertencia que acompaña a un texto libre aceptado. */
export const AVISO_TEXTO_LIBRE =
  "texto libre: puede no llegar si ese número no le escribió al negocio en las últimas 24 h";

export interface EnvioWhatsApp {
  /** Meta (o la cuenta del servidor) lo ACEPTÓ. No prueba que se haya leído. */
  ok: boolean;
  /** `null` = no había ninguna cuenta con la que mandar. */
  via: ViaEnvioWa | null;
  modo: ModoEnvioWa;
  plantilla: string | null;
  /** El id que devuelve Meta (`wamid.…`): con él se rastrea en el panel de Meta. */
  wamid: string | null;
  /** Salió como texto libre: Meta lo descarta fuera de la ventana de 24 h. */
  puedeNoLlegar: boolean;
  /** Lo que devolvió Meta, sin el token. */
  error: string | null;
  /** Por qué no se usó la plantilla, cuando había una pero no servía. */
  nota: string | null;
}

/** Dígitos para Meta; 9 dígitos = celular peruano sin código de país. */
export function telefonoParaWa(telefono: string): string {
  const d = (telefono ?? "").replace(/\D/g, "");
  return d.length === 9 ? `51${d}` : d;
}

/** Corta por caracteres visibles (no parte un emoji en dos) y cierra con «…». */
function cortar(texto: string, max: number): string {
  const chars = Array.from(texto);
  if (chars.length <= max) return texto;
  return `${chars.slice(0, Math.max(1, max - 1)).join("").trimEnd()}…`;
}

/**
 * El texto de un aviso, apto para el parámetro de una plantilla.
 *
 * Meta rechaza parámetros con saltos de línea, tabulaciones o más de cuatro
 * espacios seguidos, y vacíos. Cada renglón se une con « · » (los vacíos se
 * saltan), los espacios se colapsan y se corta a `max` con «…».
 */
export function aplanarParaPlantilla(texto: string, max: number = TOPE_PARAMETRO_PLANTILLA): string {
  const plano = (texto ?? "")
    .split(/\r\n|\r|\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" · ");
  return cortar(plano || "(sin texto)", max);
}

/**
 * Cuánto cabe en `{{1}}` para una plantilla cuyo cuerpo se conoce: el cuerpo ya
 * rellenado no puede pasar de 1024. `null` = no se sabe el cuerpo.
 */
export function topeDelParametro(cuerpo: string | null): number {
  if (!cuerpo) return TOPE_PARAMETRO_PLANTILLA;
  const veces = Math.max(1, (cuerpo.match(/\{\{1\}\}/g) ?? []).length);
  const fijo = Array.from(cuerpo.replace(/\{\{1\}\}/g, "")).length;
  const cabe = Math.floor((TOPE_CUERPO_PLANTILLA - fijo) / veces);
  return Math.max(50, Math.min(TOPE_PARAMETRO_PLANTILLA, cabe));
}

export function cuerpoTextoWa(to: string, texto: string) {
  return {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: cortar(texto, TOPE_TEXTO_LIBRE) },
  };
}

export function cuerpoPlantillaWa(
  to: string,
  plantilla: { nombre: string; idioma: string; max?: number },
  texto: string,
) {
  return {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: plantilla.nombre,
      language: { code: plantilla.idioma },
      components: [
        {
          type: "body",
          parameters: [{ type: "text", text: aplanarParaPlantilla(texto, plantilla.max) }],
        },
      ],
    },
  };
}

/**
 * La constancia de un envío ACEPTADO, para `NotificationLog`: cómo salió, por
 * qué número y con qué `wamid`. Un texto libre lleva su advertencia, para que
 * el registro no diga «enviado» a secas.
 */
export function describirEnvioWhatsApp(
  r: Pick<EnvioWhatsApp, "via" | "modo" | "plantilla" | "wamid" | "puedeNoLlegar" | "nota">,
): string {
  const modo =
    r.modo === "plantilla" ? `plantilla «${r.plantilla ?? "?"}»` : r.puedeNoLlegar ? AVISO_TEXTO_LIBRE : "texto libre";
  const via = r.via === "negocio" ? VIA_NEGOCIO : r.via === "servidor" ? VIA_SERVIDOR : null;
  return [modo, via, r.wamid, r.nota].filter(Boolean).join(" · ");
}

/** Lo que se agrega al error crudo de un envío fallido (sin tocar el error). */
export function sufijoDeFallo(via: ViaEnvioWa | null): string {
  return via === "negocio" ? ` · vía ${VIA_NEGOCIO}` : via === "servidor" ? ` · vía ${VIA_SERVIDOR}` : "";
}

/** ¿La constancia dice que salió como texto libre, sin garantía de entrega? */
export function esTextoLibreSinGarantia(mensaje: string | null | undefined): boolean {
  return (mensaje ?? "").includes(AVISO_TEXTO_LIBRE);
}

/** ¿El envío (o el fallo) fue con el número del negocio, no con la cuenta del servidor? */
export function fueConNumeroDelNegocio(mensaje: string | null | undefined): boolean {
  return (mensaje ?? "").includes(VIA_NEGOCIO);
}

/**
 * ¿Vale la pena reintentar? Sólo lo pasajero: la red, un timeout, un 5xx o un
 * 429. Un token malo o un número fuera de la lista van a fallar igual.
 */
export function esFalloTransitorio(error: string | null | undefined): boolean {
  const m = (error ?? "").toLowerCase();
  return /error: (5\d\d|429)\b/.test(m) || m.includes("fetch failed") || m.includes("timeout") || m.includes("aborted");
}

/**
 * El rechazo de Meta en palabras de qué hacer. `null` = no se reconoce (o es
 * pasajero): cada pantalla decide qué decir ahí.
 *
 * Los códigos de Meta PRIMERO: casi todos sus errores traen
 * `"type":"OAuthException"`, también el 131030 de la lista permitida (medido
 * 26-09 con la cuenta de Blas). Con «oauth» adelante, un número fuera de la
 * lista se leía como «Meta rechazó el token».
 */
export function explicarFalloWhatsApp(crudo: string | null | undefined): string | null {
  const m = (crudo ?? "").toLowerCase();
  if (!m) return null;
  if (m.includes("no configurado")) {
    return "WhatsApp: ni el negocio (Mensajes → Bot WhatsApp) ni este servidor tienen una cuenta de WhatsApp conectada.";
  }
  if (m.includes("131047") || m.includes("re-engagement") || m.includes("24 hour")) {
    return "WhatsApp: ese número no te escribió en las últimas 24 h — mándale un «hola» al número del negocio o aprueba una plantilla en Meta.";
  }
  if (m.includes("131030") || m.includes("allowed list")) {
    return "WhatsApp: la cuenta está en modo prueba — agrega ese número a la lista permitida en Meta.";
  }
  if (m.includes("131026") || m.includes("not a valid whatsapp") || m.includes("undeliverable")) {
    return "WhatsApp: ese número no tiene WhatsApp o está mal escrito.";
  }
  /* 132xxx = la plantilla: no existe con ese nombre/idioma, o no calza. */
  if (m.includes("132001") || m.includes("template name does not exist")) {
    return `WhatsApp: Meta no tiene aprobada esa plantilla con ese nombre en español — revisa que «${PLANTILLA_AVISOS_POR_DEFECTO}» (o la que nombra WHATSAPP_PLANTILLA_AVISOS) esté aprobada.`;
  }
  if (m.includes("132000") || m.includes("132012") || m.includes("132005")) {
    return "WhatsApp: el aviso no calza en la plantilla — tiene que llevar UNA sola variable ({{1}}) y poco texto fijo.";
  }
  /* El token puede ser el del número del negocio (se guarda en el panel) o el
     de la cuenta del servidor (Vercel): la constancia dice cuál se usó. */
  const dondeSeCarga = fueConNumeroDelNegocio(crudo) ? "guárdalo en Mensajes → Bot WhatsApp" : "cárgalo en Vercel";
  /* Meta distingue el token que VENCIÓ del que ni siquiera es un token («Cannot
     parse access token»: cortado, con comillas de más o de otra app). Medido
     26-09 con la clave del servidor: es el segundo caso. */
  if (m.includes("cannot parse access token") || m.includes("malformed")) {
    return `WhatsApp: el token cargado no es válido (Meta no lo puede leer) — copia otra vez el token permanente del usuario del sistema en Meta y ${dondeSeCarga}.`;
  }
  if (m.includes("expired") || m.includes("session has been invalidated")) {
    return `WhatsApp: el token venció — genera uno permanente en Meta (usuario del sistema) y ${dondeSeCarga}.`;
  }
  /* «error: 401» y no «401» suelto: un número de teléfono puede contener 401. */
  if (/error: 401\b/.test(m) || m.includes("oauth") || m.includes("access token")) {
    return `WhatsApp: Meta rechazó el token — renuévalo en Meta (usuario del sistema) y ${dondeSeCarga}.`;
  }
  return null;
}

/** Una línea para un registro que ya existe (evento de contrato, log): cómo salió o por qué no. */
export function resumenEnvioWhatsApp(r: EnvioWhatsApp): string {
  if (r.ok) return `WhatsApp: ${describirEnvioWhatsApp(r)}`;
  const explicado = explicarFalloWhatsApp(`${r.error ?? ""}${sufijoDeFallo(r.via)}`);
  return `WhatsApp no salió: ${explicado?.replace(/^WhatsApp: /, "") ?? (r.error ?? "sin motivo").slice(0, 160)}`;
}
