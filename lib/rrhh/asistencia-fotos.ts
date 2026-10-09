/**
 * «Marcar con foto» (Brandon 2026-10-09): con las cámaras «al lado», cada
 * marca de asistencia guarda el cuadro que se veía en ese momento, como
 * respaldo («Juan · 07:42» con su foto de la entrada).
 *
 * La foto va al Drive del negocio, no a una columna de `Asistencia`: la marca
 * se puede corregir o reemplazar (queda la cadena `reemplazadaPorId`) y la
 * foto es del MOMENTO en que alguien miró la cámara, no de una versión de la
 * marca. Se ata por colaborador + día.
 *
 *   Cámaras / Asistencia / <AAAA-MM-DD Lima> / <HH-mm-ss> · <colaborador> · <cámara>.webp
 *
 * Contrato compartido por `POST /api/rrhh/asistencia/foto`,
 * `GET /api/rrhh/asistencia/fotos?fecha=` y la hoja del día. Sin `server-only`:
 * lo importa el cliente.
 */

export const CARPETA_ASISTENCIA = ["Cámaras", "Asistencia"] as const;

/** Etiquetas del documento: `asistencia` + `colaborador:<id>` + `fecha:<AAAA-MM-DD>`. */
export const TAG_FOTO_ASISTENCIA = "asistencia";
export const tagColaborador = (id: string) => `colaborador:${id}`;
export const tagFecha = (fecha: string) => `fecha:${fecha}`;

export interface FotoAsistencia {
  /** Id del documento del Drive. */
  id: string;
  colaboradorId: string;
  /** AAAA-MM-DD (día de Lima de la marca). */
  fecha: string;
  /** HH:mm de Lima en que se tomó. */
  hora: string;
  /** Nombre de la cámara de la que salió. */
  camara: string;
  /** Para `<img src>` y «Abrir»: la misma ruta con la que el Drive sirve el archivo. */
  url: string;
}

export type RespuestaFotoAsistencia =
  | { ok: true; foto: FotoAsistencia }
  | { ok: false; error: string };

export type RespuestaFotosAsistencia =
  | { ok: true; fotos: FotoAsistencia[] }
  | { ok: false; error: string };
