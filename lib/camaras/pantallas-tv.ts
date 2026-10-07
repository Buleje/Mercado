/**
 * Contrato de «Ver las cámaras en otra pantalla» (pedido de Brandon 07-10:
 * «conectar o ver mis cámaras y pasarlas a mi celular, estilo duplicación de
 * pantalla desde mi sistema; mi televisor es Smart TV»).
 *
 * El Modo TV: el televisor abre `/tv` en su navegador (sin login), muestra un
 * código de 6 caracteres; el dueño lo escribe en el panel (o escanea el QR del
 * TV con su celular) y elige qué cámaras y por cuánto tiempo. Desde ahí el TV
 * tiene una credencial PROPIA (cookie httpOnly `buleje-tv`) que sólo sirve
 * para mirar esas cámaras: no abre el panel, no escribe nada, vence sola y se
 * revoca desde el panel.
 *
 * Las rutas `/api/tv/camaras/**` son ESPEJO exacto de las de
 * `/api/admin/camaras/**` que usan los visores (misma forma de respuesta), así
 * los visores sirven para los dos con sólo cambiar la base (`baseApi`).
 *
 * PURO y client-safe: tipos, constantes y armado de rutas. Sin secretos.
 */

/** Sin 0/O, 1/I/L: se lee de lejos en un televisor y se dicta por teléfono. */
export const TV_ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const TV_CODIGO_LARGO = 6;
/** Cuánto vive un código sin vincular. */
export const TV_CODIGO_VIDA_S = 10 * 60;
/** Cada cuánto pregunta el TV si ya lo vincularon. */
export const TV_SONDEO_MS = 2_000;
export const TV_COOKIE = "buleje-tv";
/** Duraciones que se ofrecen al vincular (horas). 8 h = un turno; 168 h = una semana. */
export const TV_DURACIONES_HORAS = [8, 24, 168] as const;
export type TvDuracionHoras = (typeof TV_DURACIONES_HORAS)[number];

/** El secreto del emparejamiento viaja en este header, nunca en la URL (security 07-10). */
export const TV_HEADER_SECRETO = "x-tv-secreto";

export const TV_API_ADMIN = "/api/admin/camaras";
export const TV_API_TV = "/api/tv/camaras";

export const TV_RUTAS = {
  /** Página pública que abre el televisor. */
  pagina: "/tv",
  /** POST (sin sesión) → `TvEmparejarRespuesta`. */
  emparejar: "/api/tv/emparejar",
  /**
   * GET ?codigo + header `TV_HEADER_SECRETO` → `TvEstadoRespuesta`; al quedar
   * vinculada, deja la cookie `buleje-tv`. Inexistente o secreto malo = «vencido».
   */
  estado: "/api/tv/estado",
  /** POST (con cookie) → borra la cookie. El TV deja de ver. */
  salir: "/api/tv/salir",
  /** GET (con cookie) → `TvCamarasRespuesta` (sólo las cámaras permitidas, sin secretos). */
  camaras: TV_API_TV,
  /** Panel: GET lista `PantallaTv[]` · POST `VincularPantallaInput` · DELETE ?id (desconectar). admin/owner. */
  pantallasAdmin: "/api/admin/camaras/pantallas",
} as const;

/** El QR del TV lleva al panel con el código ya puesto. */
export function urlVincularDesdeQr(origen: string, codigo: string): string {
  return `${origen}/admin?tab=camaras&vista=camaras&vincularTv=${encodeURIComponent(codigo)}`;
}

export function codigoTvValido(codigo: string): boolean {
  const c = codigo.trim().toUpperCase();
  return c.length === TV_CODIGO_LARGO && [...c].every((ch) => TV_ALFABETO.includes(ch));
}

export function normalizarCodigoTv(codigo: string): string {
  return codigo.replace(/[\s-]/g, "").toUpperCase();
}

export interface TvEmparejarRespuesta {
  codigo: string;
  /** Sólo lo conoce el TV que pidió el código: sin él, adivinar un código no sirve para robar la sesión. */
  secreto: string;
  /** ISO 8601. */
  expiraEn: string;
}

export type TvEstado = "esperando" | "vinculada" | "vencido";

export interface TvEstadoRespuesta {
  estado: TvEstado;
  /** Con `vinculada`: cómo la llamó el dueño y hasta cuándo ve. */
  pantalla?: { nombre: string; expiraEn: string };
}

/** Una pantalla vinculada, como la ve el dueño en el panel. */
export interface PantallaTv {
  id: string;
  nombre: string;
  /** `null` = todas las cámaras del negocio (también las que se agreguen después). */
  camaras: string[] | null;
  creadaPor: string;
  creadaEn: string;
  expiraEn: string;
  /** Último pedido del TV (ISO), para saber si sigue prendida. */
  ultimaVez: string | null;
}

export interface VincularPantallaInput {
  codigo: string;
  nombre: string;
  camaras: string[] | null;
  horas: TvDuracionHoras;
}

/** La lista que recibe el TV: misma forma que los elementos de `GET /api/admin/camaras`, sin secretos. */
export interface TvCamarasRespuesta {
  pantalla: { nombre: string; expiraEn: string };
  /** Cada cámara con los campos que los visores ya leen de la lista del panel. */
  camaras: Record<string, unknown>[];
}
