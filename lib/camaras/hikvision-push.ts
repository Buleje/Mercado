/**
 * Lo que manda una Hikvision cuando «avisa al servidor» (HTTP Listening / servidor
 * de alarma) — leído a mano, sin confiar en el parser del framework.
 *
 * ## Por qué no alcanza con `req.formData()`
 *
 * La cámara no manda un formulario: manda la ALERTA (un XML o un JSON con el
 * tipo de evento) y la FOTO en partes de un multipart, cada una con el nombre que
 * le pone su firmware — `fielddetectionImage`, `linedetectionImage`, `Picture`…
 * El webhook buscaba `file|image|picture` y respondía 400 «sin_imagen» a la
 * cámara real (medido 2026-10-01 con el formato de un evento de intrusión).
 *
 * Y hay una trampa más: el estándar del navegador trata como TEXTO toda parte
 * que no traiga `filename`, y algunos firmwares mandan el JPEG sin él. Pasado a
 * texto, el binario se corrompe sin avisar. Por eso las partes se separan sobre
 * los bytes y la foto se reconoce por lo que ES (tipo, extensión o los primeros
 * bytes), no por cómo se llama.
 *
 * Todo puro: entra un Buffer, sale un dato. Nunca lanza.
 */

import { normalizarEvento, type EventoCamara } from "./camaras";

/**
 * Un aviso real trae 2-4 partes (alerta + 1-3 fotos). Sin tope, 8 MB de
 * delimitadores vacíos son un millón de objetos y ~370 MB de memoria.
 */
export const MAX_PARTES = 32;
/** Una alerta es un XML/JSON de pocos KB: un texto más grande no se interpreta. */
const MAX_TEXTO_ALERTA = 64 * 1024;

export interface ParteMultipart {
  nombre: string | null;
  archivo: string | null;
  tipo: string | null;
  datos: Buffer;
}

/** El `boundary` del Content-Type, con o sin comillas. */
export function boundaryDe(contentType: string): string | null {
  const m = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
  return m ? (m[1] ?? m[2] ?? null) : null;
}

function cabecerasDe(bloque: string): Pick<ParteMultipart, "nombre" | "archivo" | "tipo"> {
  const disp = /content-disposition:[^\r\n]*/i.exec(bloque)?.[0] ?? "";
  const nombre = /\bname="([^"]*)"/i.exec(disp)?.[1] ?? null;
  const archivo = /\bfilename="([^"]*)"/i.exec(disp)?.[1] ?? null;
  const tipo = /content-type:\s*([^\r\n;]+)/i.exec(bloque)?.[1]?.trim().toLowerCase() ?? null;
  return { nombre, archivo, tipo };
}

/**
 * Separa un multipart sobre los bytes. Acepta CRLF (lo del estándar) y LF pelado
 * (lo que mandan algunos firmwares). Lo que no se puede leer, se salta.
 */
export function partesMultipart(cuerpo: Buffer, contentType: string): ParteMultipart[] {
  const boundary = boundaryDe(contentType);
  if (!boundary) return [];
  const delimitador = Buffer.from(`--${boundary}`);
  const partes: ParteMultipart[] = [];

  let inicio = cuerpo.indexOf(delimitador);
  while (inicio !== -1 && partes.length < MAX_PARTES) {
    const desde = inicio + delimitador.length;
    /* `--boundary--` cierra el cuerpo. */
    if (cuerpo[desde] === 0x2d && cuerpo[desde + 1] === 0x2d) break;
    const siguiente = cuerpo.indexOf(delimitador, desde);
    if (siguiente === -1) break;

    const bloque = cuerpo.subarray(desde, siguiente);
    const finCrlf = bloque.indexOf("\r\n\r\n");
    const finLf = bloque.indexOf("\n\n");
    const usaCrlf = finCrlf !== -1 && (finLf === -1 || finCrlf <= finLf);
    const finCabeceras = usaCrlf ? finCrlf : finLf;
    if (finCabeceras !== -1) {
      const cabeceras = bloque.subarray(0, finCabeceras).toString("latin1");
      let datos = bloque.subarray(finCabeceras + (usaCrlf ? 4 : 2));
      /* El salto de línea antes del próximo delimitador es del formato, no del archivo. */
      if (datos.length >= 2 && datos[datos.length - 2] === 0x0d && datos[datos.length - 1] === 0x0a) {
        datos = datos.subarray(0, datos.length - 2);
      } else if (datos.length >= 1 && datos[datos.length - 1] === 0x0a) {
        datos = datos.subarray(0, datos.length - 1);
      }
      partes.push({ ...cabecerasDe(cabeceras), datos });
    }
    inicio = siguiente;
  }
  return partes;
}

/** Qué formato de imagen es, mirando los primeros bytes. `null` = no es una foto. */
export function tipoPorFirma(datos: Buffer): string | null {
  if (datos.length >= 3 && datos[0] === 0xff && datos[1] === 0xd8 && datos[2] === 0xff) return "image/jpeg";
  if (datos.length >= 8 && datos.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return "image/png";
  if (datos.length >= 12 && datos.subarray(0, 4).toString("latin1") === "RIFF" && datos.subarray(8, 12).toString("latin1") === "WEBP")
    return "image/webp";
  return null;
}

/**
 * La foto del aviso: la primera parte que sea imagen por su tipo, su extensión o
 * sus bytes. El tipo devuelto sale de los bytes cuando se puede: un firmware que
 * declara `application/octet-stream` igual manda un JPEG.
 */
export function imagenDelAviso(partes: readonly ParteMultipart[]): { datos: Buffer; tipo: string } | null {
  for (const p of partes) {
    if (p.datos.length === 0) continue;
    const porFirma = tipoPorFirma(p.datos);
    const declarada = p.tipo?.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(p.archivo ?? "");
    if (porFirma) return { datos: p.datos, tipo: porFirma };
    if (declarada) return { datos: p.datos, tipo: p.tipo?.startsWith("image/") ? p.tipo : "image/jpeg" };
  }
  return null;
}

export interface AlertaHikvision {
  /** `fielddetection`, `linedetection`, `VMD`, `videoloss`… tal como lo manda. */
  tipoEvento: string | null;
  /** `active` = pasó algo; `inactive` = terminó o es el latido de «sigo viva». */
  estado: string | null;
  /** `human` / `vehicle` cuando el aparato ya distingue el blanco. */
  objetivo: string | null;
  descripcion: string | null;
  canal: string | null;
}

/**
 * El contenido de `<nombre>…</nombre>`. El patrón es lineal a propósito: con
 * `\\s*([^<]*?)\\s*` los espacios se pueden repartir de N² maneras, y 8 MB de
 * espacios sin cierre colgaban el proceso minutos (revisión 2026-10-01). Se
 * captura todo y se recorta después.
 */
function etiqueta(xml: string, nombre: string): string | null {
  const m = new RegExp(`<(?:\\w+:)?${nombre}>([^<]*)</(?:\\w+:)?${nombre}>`, "i").exec(xml);
  const valor = m?.[1]?.trim();
  return valor ? valor : null;
}

function buscarEnJson(v: unknown, claves: readonly string[], profundidad = 0): string | null {
  if (!v || typeof v !== "object" || profundidad > 4) return null;
  for (const [k, valor] of Object.entries(v as Record<string, unknown>)) {
    if (claves.includes(k) && (typeof valor === "string" || typeof valor === "number")) return String(valor);
  }
  for (const valor of Object.values(v as Record<string, unknown>)) {
    const hallado = buscarEnJson(valor, claves, profundidad + 1);
    if (hallado) return hallado;
  }
  return null;
}

/** Lee la alerta, venga en XML (`EventNotificationAlert`) o en JSON. `null` si no es una. */
export function leerAlerta(texto: string): AlertaHikvision | null {
  if (texto.length > MAX_TEXTO_ALERTA) return null;
  const t = texto.trim();
  if (!t) return null;
  if (t.startsWith("{")) {
    let json: unknown;
    try {
      json = JSON.parse(t);
    } catch {
      return null;
    }
    const tipoEvento = buscarEnJson(json, ["eventType"]);
    if (!tipoEvento) return null;
    return {
      tipoEvento,
      estado: buscarEnJson(json, ["eventState"]),
      objetivo: buscarEnJson(json, ["targetType", "detectionTarget"]),
      descripcion: buscarEnJson(json, ["eventDescription"]),
      canal: buscarEnJson(json, ["channelName", "channelID"]),
    };
  }
  if (!/EventNotificationAlert/i.test(t)) return null;
  return {
    tipoEvento: etiqueta(t, "eventType"),
    estado: etiqueta(t, "eventState"),
    objetivo: etiqueta(t, "targetType") ?? etiqueta(t, "detectionTarget"),
    descripcion: etiqueta(t, "eventDescription"),
    canal: etiqueta(t, "channelName") ?? etiqueta(t, "channelID"),
  };
}

/** La alerta dentro de un multipart: la parte de texto que se deja leer como tal. */
export function alertaDelAviso(partes: readonly ParteMultipart[]): AlertaHikvision | null {
  for (const p of partes) {
    if (tipoPorFirma(p.datos) || p.datos.length > MAX_TEXTO_ALERTA) continue;
    const alerta = leerAlerta(p.datos.toString("utf8"));
    if (alerta) return alerta;
  }
  return null;
}

/**
 * Traduce la jerga de Hikvision a los eventos del historial. El blanco que ya
 * distingue el aparato (persona / vehículo) manda sobre el tipo de detección.
 */
export function eventoDeAlerta(alerta: AlertaHikvision): EventoCamara {
  const objetivo = normalizarEvento(alerta.objetivo);
  if (objetivo === "persona" || objetivo === "vehiculo") return objetivo;
  const tipo = (alerta.tipoEvento ?? "").toLowerCase();
  /* Intrusión, cruce de línea, entrar/salir de zona y PIR son «algo se movió ahí». */
  if (/^(vmd|pir|fielddetection|linedetection|regionentrance|regionexiting)$/.test(tipo)) return "movimiento";
  return normalizarEvento(tipo);
}

/** Lo que el historial guarda del aviso, en una línea corta. */
export function notaDeAlerta(alerta: AlertaHikvision): string | null {
  const partes = [alerta.descripcion ?? alerta.tipoEvento, alerta.canal ? `canal ${alerta.canal}` : null].filter(Boolean);
  return partes.length ? partes.join(" · ").slice(0, 200) : null;
}
