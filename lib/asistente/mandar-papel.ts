/**
 * lib/asistente/mandar-papel.ts — «manda la resolución de plantación a Alex»
 *
 * Lo PURO del pedido de mandar un papel por WhatsApp desde el asistente
 * (panel, WhatsApp o Telegram del dueño): leer la frase, puntuar un nombre
 * contra los contactos, tapar el número y armar el mensaje. Lo que toca la base
 * y la red vive en `mandar-papel.server.ts`.
 *
 * El lector es deliberadamente estricto: sólo entiende una ORDEN de mandar un
 * papel a OTRA persona («manda/envía/pásale/comparte <papel> a <persona>»).
 * «Mándame el contrato» (a uno mismo) no es esto: lo contesta el bot del dueño
 * con el archivo. «Mándale S/ 50 a Alex» es plata, «mándale un mensaje a Alex»
 * no es un papel: devuelven `null` y siguen su camino de siempre. Y aunque lo
 * lea mal, nada sale sin la tarjeta de confirmación.
 *
 * PURO: sin React, sin fetch, sin DOM, sin `Date.now`.
 */

import { plegar } from "@/lib/documentos/busqueda-natural";
import { diaConNombre, normalizarTelefono } from "@/lib/forestal/contactos-envio";
import type { LLMResponse, ToolCallResult } from "@/lib/llm-providers/types";

/** El nombre de la herramienta (dominio documentos, acción `mandar-papel`). */
export const TOOL_MANDAR_PAPEL = "documentos_mandar_papel";

/** Lo que se entendió de la frase. `persona` puede venir vacía si sólo dio el número. */
export interface PedidoDeEnvio {
  papel: string;
  persona: string;
  /** El número que escribió en la frase, ya normalizado (con 51). */
  telefono?: string;
}

/* Verbos de mandar a un TERCERO (ya plegados: sin tildes, minúsculas). */
const VERBOS_MANDAR = new Set([
  "manda", "mandale", "mandales", "mandar", "mandarle", "mandarles", "mande", "mandes", "mandas",
  "mandaselo", "mandasela", "mandaselos", "mandaselas",
  "envia", "enviale", "enviales", "enviar", "enviarle", "enviarles", "envie", "envies", "envias",
  "enviaselo", "enviasela",
  "pasa", "pasale", "pasales", "pasar", "pasarle", "pasarles", "pase", "pases", "pasas",
  "pasaselo", "pasasela",
  "comparte", "compartele", "compartile", "compartir", "compartirle", "compartirles", "comparta", "compartas", "compartes",
  "reenvia", "reenviale", "reenviar", "reenviarle",
  "remite", "remitele", "remitir", "remitirle",
]);

/* «Mándame…», «pásamelo»: es para uno mismo (lo contesta el bot del dueño). */
const VERBOS_A_MI = /^(manda|envia|pasa|comparte|compart[ie]|reenvia|remite)(r)?(me|nos)(lo|la|los|las)?$/;

const FAMILIA_PASAR = /^pas/;
const FAMILIA_COMPARTIR = /^compart/;

/* Lo que puede ir antes del verbo sin cambiar la orden. */
const RELLENO_ANTES = new Set([
  "hola", "oye", "oe", "hey", "buenas", "buenos", "dias", "tardes", "noches", "porfa", "porfis", "porfavor", "por", "favor",
  "asistente", "nova", "ya", "ahora", "ahorita", "puedes", "podes", "podrias", "puede", "podria", "pudieras", "quiero", "quisiera",
  "necesito", "que", "le", "les", "me", "se", "lo", "la", "a", "ok", "okay", "oka", "bueno", "pues", "please", "plis", "pls",
  "tambien", "rapido", "si", "y", "entonces", "ayudame", "ayudas", "nos",
]);

/* Separan el papel de la persona. */
const SEPARADORES = new Set(["a", "al", "para", "pa"]);

/* Cortan el nombre de la persona: lo que sigue ya no es su nombre. */
const CORTAN_PERSONA = new Set([
  "para", "pa", "que", "porque", "y", "e", "con", "por", "ya", "hoy", "ahora", "ahorita", "manana", "rapido", "urgente",
  "porfa", "porfis", "porfavor", "gracias", "pls", "plis", "please", "cuando", "antes", "despues", "luego", "pronto", "de", "del",
  "lo", "la", "le", "se", "nomas", "noma", "nada", "mas", "tambien", "si", "no",
]);

const ARTICULOS = new Set(["el", "la", "los", "las", "un", "una", "unos", "unas", "este", "esta", "estos", "estas", "ese", "esa", "esos", "esas", "mi", "mis", "nuestro", "nuestra", "su", "sus", "lo"]);

/* «el papel de…», «el pdf de…»: el nombre genérico no ayuda a buscar. */
const GENERICOS = new Set(["papel", "papeles", "documento", "documentos", "archivo", "archivos", "pdf", "copia", "foto", "escaneo", "scan", "link", "enlace"]);

/* Lo que se manda y no es un papel del Archivo: con esto el pedido es otro. */
const NO_ES_PAPEL = new Set([
  "mensaje", "mensajes", "mensajito", "recordatorio", "saludo", "saludos", "aviso", "audio", "audios", "correo", "email", "mail",
  "texto", "ubicacion", "pago", "pagos", "pedido", "pedidos", "producto", "productos", "mercaderia", "madera",
  "troza", "trozas", "carga", "camion", "plata", "dinero", "soles", "sol", "yape", "plin", "efectivo", "transferencia", "deposito",
  "adelanto", "adelantos", "vuelto", "propina", "cobro",
]);

/* Plata en cualquier parte del papel: «mándale 50 soles a Alex» nunca es un papel. */
const ES_PLATA = /^(s\/\d*|soles?|plata|dinero|yape(a|ale)?|plin|\$\d*|usd|dolares?|lucas?)$/;

/* «por WhatsApp» / «al wsp»: el canal ya es WhatsApp. */
const ES_WHATSAPP = /^(whatsapp|whatsap|whats|wasap|wassap|wsp|wpp|wap|wa)$/;
const ANTES_DE_WHATSAPP = new Set(["por", "al", "el", "x", "en", "via"]);

interface Token {
  /** Tal como lo escribió, sin la puntuación de los bordes. */
  crudo: string;
  /** Plegado y sin signos: para comparar. */
  p: string;
}

function tokenizar(texto: string): Token[] {
  return texto
    .replace(/[¿¡!?,;:"“”«»()[\]{}]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^['.]+|['.]+$/g, ""))
    .filter(Boolean)
    .map((crudo) => ({ crudo, p: plegar(crudo).replace(/[^a-z0-9/+$]/g, "") }))
    .filter((t) => t.p.length > 0);
}

function sinWhatsApp(ts: Token[]): Token[] {
  const out: Token[] = [];
  for (let i = 0; i < ts.length; i++) {
    if (ES_WHATSAPP.test(ts[i].p)) {
      if (out.length > 0 && ANTES_DE_WHATSAPP.has(out[out.length - 1].p)) out.pop();
      continue;
    }
    out.push(ts[i]);
  }
  return out;
}

const esNumero = (t: Token) => /^\+?\d+$/.test(t.p);

/** La persona: los tokens hasta el primero que corta. El número, si lo escribió, va aparte. */
function leerPersona(ts: Token[]): { persona: string; telefono?: string } | null {
  let i = 0;
  while (i < ts.length && ARTICULOS.has(ts[i].p) && ts[i].p !== "mi") i++;
  const nombre: string[] = [];
  const digitos: string[] = [];
  for (; i < ts.length; i++) {
    const t = ts[i];
    if (esNumero(t)) {
      digitos.push(t.p.replace(/\D/g, ""));
      continue;
    }
    if (digitos.length > 0) break; // el número terminó: lo que sigue ya no es suyo
    if (CORTAN_PERSONA.has(t.p) || SEPARADORES.has(t.p) || ARTICULOS.has(t.p)) break;
    nombre.push(t.crudo);
  }
  const telefono = digitos.length > 0 ? normalizarTelefono(digitos.join("")) : null;
  if (digitos.length > 0 && !telefono) return null; // un número que no es celular: mejor no adivinar
  const persona = nombre.join(" ").trim();
  if (!persona && !telefono) return null;
  if (/^(mi|yo|mi\s+mismo|nosotros)$/.test(plegar(persona))) return null;
  return telefono ? { persona, telefono } : { persona };
}

/** El papel sin artículos ni «el documento de…» adelante. Vacío si no queda nada útil. */
function limpiarPapel(ts: Token[]): string {
  let i = 0;
  for (;;) {
    if (i < ts.length && ARTICULOS.has(ts[i].p)) {
      i++;
      continue;
    }
    if (i < ts.length && GENERICOS.has(ts[i].p) && i + 1 < ts.length && /^(de|del)$/.test(ts[i + 1].p)) {
      i += 2;
      continue;
    }
    break;
  }
  const resto = ts.slice(i);
  // «el documento» a secas no es un papel.
  if (resto.length === 1 && GENERICOS.has(resto[0].p)) return "";
  return resto.map((t) => t.crudo).join(" ").trim();
}

function papelValido(ts: Token[]): boolean {
  const utiles = ts.filter((t) => !ARTICULOS.has(t.p));
  if (utiles.length === 0) return false;
  if (NO_ES_PAPEL.has(utiles[0].p)) return false;
  if (ts.some((t) => ES_PLATA.test(t.p))) return false;
  // «mándale 50 a Alex»: sólo números no es un papel.
  if (utiles.every(esNumero)) return false;
  return true;
}

/**
 * La orden de mandar un papel a otra persona, o `null` si la frase es otra
 * cosa. Entiende «manda <papel> a <persona>», «pásale <papel> al <persona>»,
 * «comparte <papel> con <persona>», el orden al revés («mándale a Alex la
 * resolución») y un número en lugar del nombre («… al 987 654 321»).
 */
export function leerPedidoDeEnvio(texto: string): PedidoDeEnvio | null {
  if (!texto || texto.length > 400) return null;
  const ts = sinWhatsApp(tokenizar(texto));

  // El verbo: sólo relleno antes («hola, porfa, pásale…»).
  let v = -1;
  for (let i = 0; i < ts.length; i++) {
    const p = ts[i].p;
    if (VERBOS_A_MI.test(p)) return null;
    if (VERBOS_MANDAR.has(p)) {
      // «mandé / envié / pasé» es pasado: lo cuenta, no lo pide.
      if (/é$/.test(ts[i].crudo.toLowerCase())) return null;
      // «¿qué pasa con…?» no es mandar.
      if (FAMILIA_PASAR.test(p) && i > 0 && ts[i - 1].p === "que") return null;
      v = i;
      break;
    }
    if (!RELLENO_ANTES.has(p)) return null;
  }
  if (v < 0) return null;

  const verbo = ts[v].p;
  const separadores = FAMILIA_COMPARTIR.test(verbo) ? new Set([...SEPARADORES, "con"]) : SEPARADORES;
  const resto = ts.slice(v + 1);
  if (resto.length < 2) return null;

  // Al revés: «mándale a Alex la resolución», «pásale al ingeniero Pérez el contrato».
  if (separadores.has(resto[0].p)) {
    let i = 1;
    while (i < resto.length && ARTICULOS.has(resto[i].p)) i++;
    let fin = i;
    while (fin < resto.length && !ARTICULOS.has(resto[fin].p)) fin++;
    // Sin artículo que los separe: la persona es la primera palabra.
    if (fin >= resto.length) fin = Math.min(i + 1, resto.length);
    const persona = leerPersona(resto.slice(1, fin));
    const papelTs = resto.slice(fin);
    if (persona && papelValido(papelTs)) {
      const papel = limpiarPapel(papelTs);
      if (papel) return { papel, ...persona };
    }
    return null;
  }

  // Lo de siempre: «<papel> a <persona>». Del último separador al primero.
  for (let s = resto.length - 1; s >= 1; s--) {
    if (!separadores.has(resto[s].p)) continue;
    const persona = leerPersona(resto.slice(s + 1));
    if (!persona) continue;
    const papelTs = resto.slice(0, s);
    if (!papelValido(papelTs)) return null;
    const papel = limpiarPapel(papelTs);
    if (!papel) return null;
    return { papel, ...persona };
  }
  return null;
}

/** «+51 9•• ••• 123»: se reconoce el número sin mostrarlo entero. */
export function enmascararTelefono(t: string): string {
  const m = /^51(\d)\d{2}\d{3}(\d{3})$/.exec(t);
  if (m) return `+51 ${m[1]}•• ••• ${m[2]}`;
  if (t.length <= 5) return `+${t}`;
  return `+${t.slice(0, 2)}${"•".repeat(t.length - 5)}${t.slice(-3)}`;
}

/* Tratamientos que no son parte del nombre («don Alex», «la ingeniera Rosa»). */
const TRATAMIENTOS = new Set([
  "el", "la", "don", "dona", "sr", "sra", "srta", "senor", "senora", "senorita", "ing", "inge", "ingeniero", "ingeniera",
  "dr", "dra", "doctor", "doctora", "lic", "licenciado", "licenciada", "profe", "profesor", "profesora", "tio", "tia",
]);

function palabrasDeNombre(s: string): string[] {
  return plegar(s)
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !TRATAMIENTOS.has(w));
}

/**
 * Cuánto se parece lo que escribió al nombre de un contacto:
 * 3 = el mismo nombre · 2 = todas sus palabras están en el nombre («Alex» en
 * «Alex Ramírez») · 1 = todas empiezan una palabra del nombre («Ram» en
 * «Ramírez», de 3 letras para arriba) · 0 = no es.
 */
export function puntajeDeNombre(persona: string, nombre: string): 0 | 1 | 2 | 3 {
  const buscadas = palabrasDeNombre(persona);
  const delContacto = palabrasDeNombre(nombre);
  if (buscadas.length === 0 || delContacto.length === 0) return 0;
  if (buscadas.join(" ") === delContacto.join(" ")) return 3;
  if (buscadas.every((w) => delContacto.includes(w))) return 2;
  if (buscadas.every((w) => (w.length >= 3 ? delContacto.some((c) => c.startsWith(w)) : delContacto.includes(w)))) return 1;
  return 0;
}

function capitalizar(w: string): string {
  return w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w;
}

/** El WhatsApp que recibe la persona: saludo, quién lo manda, el papel, el enlace y hasta cuándo sirve. */
export function mensajeDelPapel(o: {
  nombrePersona: string;
  negocio: string | null;
  nombrePapel: string;
  url: string;
  /** `YYYY-MM-DD` del día en que vence el enlace. */
  vence: string;
}): string {
  const primero = o.nombrePersona.trim().split(/\s+/)[0] ?? "";
  const saludo = primero && !/^\+?\d/.test(primero) ? `Hola ${capitalizar(primero)}` : "Hola";
  const quien = o.negocio?.trim() ? `${o.negocio.trim()} te comparte` : "te comparto";
  return `${saludo}, ${quien} este papel: *${o.nombrePapel}*\n${o.url}\n\nEl enlace vence el ${diaConNombre(o.vence)}.`;
}

/**
 * La llamada a la herramienta que el asistente arma solo cuando la frase ya se
 * entendió: no hace falta preguntarle al modelo (ni gastar sus tokens) para
 * saber que «manda la resolución a Alex» es mandar un papel. Igual pasa por el
 * ensayo y la tarjeta de confirmación como cualquier otra.
 *
 * `sufijo` hace único el id: la conversación guarda las rondas anteriores y un
 * proveedor que ve dos `tool_call_id` iguales en el historial rechaza el pedido.
 */
export function llamadaDeAtajo(pedido: PedidoDeEnvio, sufijo: string): ToolCallResult {
  return {
    id: `atajo-mandar-papel-${sufijo}`,
    function: { name: TOOL_MANDAR_PAPEL, arguments: JSON.stringify(pedido) },
  };
}

/**
 * Lo mismo, con la forma de una respuesta del modelo: el panel y la
 * conversación del dueño la usan EN LUGAR de la primera llamada al LLM, y el
 * resto del camino (ensayo, tarjeta, aprobación) no se entera de la diferencia.
 * Cero tokens: no descuenta presupuesto de IA.
 */
export function respuestaDeAtajo(pedido: PedidoDeEnvio, sufijo: string): LLMResponse {
  return {
    ok: true,
    content: null,
    toolCalls: [llamadaDeAtajo(pedido, sufijo)],
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    body: null,
    provider: "anthropic",
    model: "atajo-sin-modelo",
  };
}
