/**
 * El aviso de «falta la clave de IA» y los motivos por los que una lectura con
 * IA no salió — UNA sola redacción para todo el panel.
 *
 * Sin `server-only` a propósito: lo usa el lector (`vision-extract.ts`, en el
 * servidor) para el 503, y la pantalla (`AvisoClaveIa`) para no decir lo mismo
 * con otras palabras en la placa, la constancia y las planillas.
 */

/**
 * El aviso CON instrucciones: dice dónde va la clave de la plataforma. Sólo lo
 * ve quien la administra (superadmin, o el servidor de desarrollo del dueño) —
 * auditoría de seguridad 2026-10-02: el estado de la clave de la plataforma no
 * es asunto del admin de cada negocio.
 */
export const AVISO_SIN_CLAVE_IA =
  "La lectura con IA se activa con tu clave de Claude (ANTHROPIC_API_KEY en el archivo .env.local) y reiniciando el servidor.";

/** Lo que ve el admin de un negocio cuando la IA de la plataforma no está disponible, sea cual sea el motivo. */
export const AVISO_IA_NO_DISPONIBLE =
  "La lectura con IA no está disponible ahora; avisa al administrador. Mientras tanto, carga los datos a mano.";

/**
 * Lo mismo para el asistente que responde preguntas sobre el libro
 * (`/ctp/ask`): no lee un archivo, así que «carga los datos a mano» no aplica.
 */
export const AVISO_SIN_CLAVE_ASISTENTE =
  "El asistente con IA se activa con tu clave de Claude (ANTHROPIC_API_KEY en el archivo .env.local) y reiniciando el servidor.";
export const AVISO_ASISTENTE_NO_DISPONIBLE =
  "El asistente con IA no está disponible ahora; avisa al administrador. Mientras tanto, las cifras están en las pestañas del libro.";

/**
 * Por qué no se pudo leer. La pantalla elige el tono con esto y no con el
 * status HTTP: un 503 puede ser «no hay clave» (neutro, se carga a mano) o «la
 * IA está saturada» (se reintenta).
 */
export type CodigoFalloIA =
  /** No hay ninguna clave de IA configurada (sólo lo ve quien administra la plataforma). */
  | "sin_lector"
  /** La IA de la plataforma no está disponible — la versión sin detalle para el admin de un negocio. */
  | "ia_no_disponible"
  | "clave_invalida"
  | "sin_credito"
  | "sin_permiso"
  | "modelo_no_disponible"
  | "limite_ia"
  | "ia_saturada"
  | "sin_conexion"
  | "archivo_grande"
  | "formato_no_soportado"
  /** La IA se negó a leer el archivo (`stop_reason: "refusal"`). */
  | "rechazada"
  /** La respuesta se cortó por largo antes de cerrar el JSON. */
  | "cortada"
  | "pedido_rechazado"
  /** Respondió, pero lo que devolvió no se pudo interpretar. */
  | "ilegible"
  /** El PDF trae más páginas de las que la ruta acepta. */
  | "demasiadas_paginas";

/**
 * Los fallos que NO son culpa de la foto sino de la configuración de la clave:
 * otra foto no los arregla, así que no se la pide.
 */
export const FALLOS_DE_CONFIGURACION: readonly CodigoFalloIA[] = [
  "sin_lector",
  "ia_no_disponible",
  "clave_invalida",
  "sin_credito",
  "sin_permiso",
  "modelo_no_disponible",
];
