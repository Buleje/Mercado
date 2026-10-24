/**
 * «Analizar» del vivo de Hik-Connect (ADR-471) — lo puro: el tope de un
 * análisis cada 10 s por cámara, el cuadro que devuelve EZUIKit convertido en
 * una foto subible por la puerta de «Subir desde la galería», y el resumen de
 * lo que leyó la IA. Sin React ni fetch; lo prueba
 * `__tests__/camaras-analizar-cuadro.test.ts`.
 */

import type { Captura } from "@/lib/camaras/camaras";
import { sinLeer } from "./camaras-ui";

/** Un análisis cada tantos segundos por cámara (el servidor además tiene cupo y tope de gasto de IA). */
export const SEGUNDOS_ENTRE_ANALISIS = 10;

/** Cada cuánto y cuántas veces se mira si la IA ya leyó la foto (~2-3 s medidos; 4G más lento). */
export const ESPERA_LECTURA_MS = 2500;
export const INTENTOS_LECTURA = 12;

/** Lo que el servidor escribe en la nota de la foto (ver `app/api/admin/camaras/[id]/foto`). */
export const NOTA_DEL_VIVO = /^del vivo/i;

/** Segundos que faltan para poder analizar otra vez esta cámara; 0 = ya se puede. */
export function segundosParaAnalizar(
  ultimoMs: number | undefined,
  ahoraMs: number,
  tope = SEGUNDOS_ENTRE_ANALISIS,
): number {
  if (ultimoMs === undefined) return 0;
  const faltan = tope * 1000 - (ahoraMs - ultimoMs);
  /* Con el reloj del equipo corrido hacia atrás, nunca más que el tope. */
  return faltan > 0 ? Math.min(tope, Math.ceil(faltan / 1000)) : 0;
}

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : null;

/**
 * El base64 del cuadro, venga como venga. `capturePicture` de `ezuikit-js`
 * 9.0.23 resuelve `{ id, code, data: { fileName, base64 }, type }` (index.mjs,
 * función `kc`); su callback y su evento pasan `{ fileName, base64 }`.
 */
export function base64DeCaptura(r: unknown): string | null {
  if (typeof r === "string") return r.trim() || null;
  const o = obj(r);
  const b = obj(o?.data)?.base64 ?? o?.base64;
  return typeof b === "string" && b.trim() ? b.trim() : null;
}

const PREFIJO = /^data:(image\/(?:jpeg|jpg|png|webp));base64,/i;

/** `data:image/jpeg;base64,…` (o el base64 pelado) → la imagen. `null` si no es base64 válido. */
export function imagenDeBase64(b64: string): Blob | null {
  const m = PREFIJO.exec(b64);
  const tipo = m ? m[1].toLowerCase().replace("jpg", "jpeg") : "image/jpeg";
  const crudo = (m ? b64.slice(m[0].length) : b64).replace(/\s/g, "");
  if (!crudo || !/^[A-Za-z0-9+/]+={0,2}$/.test(crudo)) return null;
  let binario: string;
  try {
    binario = atob(crudo);
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes.length ? new Blob([bytes], { type: tipo }) : null;
}

const p2 = (n: number) => String(n).padStart(2, "0");

/**
 * El formulario de la subida a mano (`file`) más `origen=vivo`, que el
 * servidor anota en la foto para que en «Fotos» se sepa de dónde salió.
 */
export function formularioDeAnalisis(foto: Blob, ahora = new Date()): FormData {
  const ext = foto.type === "image/png" ? "png" : foto.type === "image/webp" ? "webp" : "jpg";
  const sello = `${ahora.getFullYear()}-${p2(ahora.getMonth() + 1)}-${p2(ahora.getDate())}-${p2(ahora.getHours())}${p2(ahora.getMinutes())}${p2(ahora.getSeconds())}`;
  const f = new FormData();
  f.append("file", foto, `vivo-${sello}.${ext}`);
  f.append("origen", "vivo");
  return f;
}

/** Lo que respondió la subida, dicho para el que está mirando la cámara. */
export function mensajeDeSubida(status: number, error?: string | null): string {
  if (status === 429) return "Muchas fotos seguidas: espera un minuto y vuelve a tocar «Analizar».";
  if (status === 401 || status === 403) return "Tu usuario no puede guardar fotos de las cámaras.";
  if (status === 404) return "Esta cámara ya no está en el panel. Recarga la página.";
  if (status === 413 || error === "muy_grande") return "El cuadro pesa demasiado: pásalo a SD y vuelve a probar.";
  if (status === 415) return "El cuadro no salió como imagen. Vuelve a tocar «Analizar».";
  if (error === "storage") return "No se pudo guardar la foto. Reintenta en un rato.";
  return `No se pudo guardar la foto (${error || status}).`;
}

/** La foto recién subida dentro de la lista (más nueva primero). */
export function capturaAnalizada(
  capturas: readonly Captura[],
  capturaId: string | null,
): Captura | null {
  if (capturaId) return capturas.find((c) => c.id === capturaId) ?? null;
  return capturas.find((c) => NOTA_DEL_VIVO.test(c.nota ?? "")) ?? null;
}

export interface ResumenAnalisis {
  titulo: string;
  detalle: string | null;
  /** `aviso` = la foto quedó guardada pero sin leer. */
  tono: "ok" | "aviso" | "espera";
}

/** Personas, placa y chalecos en una línea; la descripción de la IA abajo. */
export function resumenDeLectura(captura: Pick<Captura, "lectura"> | null): ResumenAnalisis {
  const l = captura?.lectura;
  if (!captura) {
    return {
      titulo: "Foto guardada",
      detalle: "La lectura de la IA aparece en «Fotos» en unos segundos.",
      tono: "espera",
    };
  }
  if (!l) {
    return {
      titulo: "Foto guardada, la IA sigue leyendo",
      detalle: "La lectura aparece en «Fotos» en unos segundos.",
      tono: "espera",
    };
  }
  if (l.motivo === "sin_ia_configurada") {
    return {
      titulo: "Foto guardada, sin IA configurada",
      detalle: "Falta la clave de la IA: la foto quedó en «Fotos» sin leer.",
      tono: "aviso",
    };
  }
  const sinLeerla = sinLeer({ lectura: l });
  if (sinLeerla && !l.descripcion) return { titulo: "Foto guardada", detalle: sinLeerla, tono: "aviso" };

  const partes: string[] = [];
  const personas = l.personas ?? (l.hayPersona ? 1 : 0);
  partes.push(
    personas === 0 ? "Nadie a la vista" : personas === 1 ? "1 persona" : `${personas} personas`,
  );
  if (l.placa) partes.push(`placa ${l.placa}`);
  else if (l.hayVehiculo) partes.push("un vehículo sin placa legible");
  const chalecos = (l.chalecos ?? []).filter((c) => c.trim());
  if (chalecos.length) {
    partes.push(
      `${chalecos.length === 1 ? "chaleco" : "chalecos"} ${chalecos.map((c) => `N° ${c}`).join(", ")}`,
    );
  }
  return { titulo: partes.join(" · "), detalle: l.descripcion, tono: "ok" };
}
