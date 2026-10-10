/**
 * La conexión directa de una cámara (ADR-421), lo puro: los tipos que ve la
 * pantalla, en cuál de los tres estados está y qué hacer con cada falla.
 *
 * Vive aparte del modal para que la fila, el hook y el formulario lo usen sin
 * importarse en círculo. `ConectarCamaraModal` lo re-exporta: los que ya lo
 * importaban de ahí siguen andando.
 */

import {
  textoDeFalla,
  type CamaraPublica,
  type ConexionCamaraPublica,
} from "@/lib/camaras/camaras";
import type { ContactoCamara } from "@/lib/camaras/contacto";

/**
 * Lo que la pantalla recibe de la conexión: todo menos el secreto.
 *
 * Son los tipos «públicos» del modelo, con nombre corto para leerlos acá. La
 * clave cifrada no existe de este lado: `camaraParaPantalla` la saca en el
 * servidor y esta pantalla no tiene forma de pedirla.
 */
export type ConexionCamara = ConexionCamaraPublica;
/**
 * `ultimoAviso`: la última vez que la CÁMARA tocó la puerta, con o sin foto
 * (lo arma el GET; las escrituras no lo traen y la pantalla conserva el que tenía).
 */
export type CamaraConConexion = CamaraPublica & { ultimoAviso?: ContactoCamara | null };

export interface DatosConexion {
  host: string;
  puerto: number;
  usuario: string;
  clave: string;
  https: boolean;
  canal: number;
}

export type ResultadoConexion =
  | { ok: true; conexion: ConexionCamara }
  | { ok: false; motivo: string; detalle: string };

/**
 * Qué HACER con cada falla, no qué pasó.
 *
 * «401 Unauthorized» no le dice nada a quien está parado frente a la cámara
 * con el celular en la mano. Cada motivo que devuelve el servidor se traduce
 * al siguiente paso concreto.
 */
const QUE_HACER: Record<string, string> = {
  credenciales:
    "El usuario o la clave no son los de la cámara. Es la cuenta del aparato, no la de Hik-Connect.",
  inalcanzable:
    "Esta computadora no llega a la cámara. Tienen que estar en la misma red, o la cámara necesita una dirección pública.",
  tiempo: "La cámara no contestó a tiempo. Fíjate si está encendida y en la misma red.",
  "no-es-hikvision": "Algo contestó en esa dirección, pero no parece una cámara Hikvision.",
};

/**
 * El modelo ya traduce el motivo a qué PASÓ (`textoDeFalla`); acá se prefiere
 * la frase que dice qué HACER, que es lo que necesita quien está parado frente
 * a la cámara. Para los motivos sin consejo propio (puerto bloqueado, pedido
 * rechazado) se muestra la del modelo en vez de inventar otra.
 */
export function queHacer(motivo: string, detalle?: string | null): string {
  return QUE_HACER[motivo] ?? textoDeFalla(motivo, detalle);
}

export type EstadoConexion =
  | { tipo: "push" }
  | { tipo: "conectada"; conexion: ConexionCamara }
  | { tipo: "falla"; conexion: ConexionCamara; motivo: string; detalle: string };

/**
 * En cuál de los tres estados está la cámara.
 *
 * Una falla vieja no tapa una conexión que después funcionó: gana la más
 * nueva de las dos marcas de tiempo.
 */
export function estadoDeConexion(camara: CamaraConConexion): EstadoConexion {
  const c = camara.conexion ?? null;
  if (!c) return { tipo: "push" };
  const f = c.ultimaFalla ?? null;
  const fallaGana =
    !!f && (!c.probadaEn || new Date(f.en).getTime() > new Date(c.probadaEn).getTime());
  if (f && fallaGana) return { tipo: "falla", conexion: c, motivo: f.motivo, detalle: f.detalle };
  return { tipo: "conectada", conexion: c };
}

/** Cómo se llama el aparato, con lo que haya contestado. */
export function nombreDelAparato(c: ConexionCamara): string {
  return [c.modelo, c.firmware].filter(Boolean).join(" · ") || "Cámara conectada";
}
