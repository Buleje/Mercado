/**
 * Contrato compartido de «imprimir la guía en el monte» (16-10).
 *
 * Brandon prepara la GTF en la oficina y la imprime en el talonario
 * autocopiativo que está en el monte, donde sólo hay un celular y una
 * impresora matricial. Dos carriles construyen sobre esto:
 *   · salida: PDF exacto (a la medida del talonario) y ESC/P directo a la
 *     matricial, con la calibración del perfil de impresora elegido.
 *   · cola: «Enviar al monte», la cola «Por imprimir» en el celular, la foto
 *     de vuelta y el control del N° de hoja.
 *
 * Ruta de la salida (carril salida):
 *   GET /api/admin/forestal/loth/gtf-matricial/salida?gtfId=<id>&formato=pdf|escp&perfil=<perfilId>[&hoja=guia|lista]
 *   → application/pdf o application/octet-stream (.prn), nombre «GTF-<numero>-<hoja>.<ext>».
 */

export type FormatoSalida = "pdf" | "escp";
export type HojaSalida = "guia" | "lista";

/** Calibración de UNA impresora: cada matricial corre el papel distinto. */
export interface PerfilImpresora {
  id: string;
  /** «Oficina», «Monte – Epson LX-350»… */
  nombre: string;
  corrimientoXmm: number;
  corrimientoYmm: number;
  /** Para impresoras que estiran o encogen (medido con la hoja de prueba). 1 = sin cambio. */
  escalaX: number;
  escalaY: number;
  actualizado?: { en: string; por: string };
}

export const PERFIL_OFICINA_ID = "oficina";

export type EstadoTrabajo = "pendiente" | "impresa" | "confirmada" | "observada" | "anulado";

/** Un pedido de impresión para el monte. */
export interface TrabajoImpresion {
  id: string;
  gtfId: string;
  /** N° completo de la guía, p. ej. «025-001-0971772». */
  numeroGuia: string;
  titular: string;
  hojas: HojaSalida[];
  perfilId: string;
  estado: EstadoTrabajo;
  creadoEn: string;
  creadoPor: string;
  impresaEn?: string;
  impresaPor?: string;
  /** Documento con la foto de la guía impresa (documentos de la guía). */
  fotoDocId?: string;
  /** N° de la hoja del talonario que se usó, leído de la foto o escrito allá. */
  numeroHoja?: string;
  /** «la hoja dice 0971773, la guía es 0971772», u otra observación. */
  observacion?: string;
  /** «Reimprimir en otra hoja» (la hoja se dañó): el motivo, obligatorio, queda escrito en el envío. */
  reimpresion?: string;
  /** El envío ya impreso que esta reimpresión reemplaza. */
  reimpresionDe?: string;
}
