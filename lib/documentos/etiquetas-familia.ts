import type { FamiliaArchivo } from "@/lib/documents/tipos-archivo";

/**
 * Cómo se llama cada tipo de archivo en la pantalla.
 *
 * Vive acá y no dentro de `tipos-archivo.ts` porque ese módulo arma la
 * etiqueta larga ("Hoja de cálculo · XLSX") para poner debajo del nombre, y
 * los chips del filtro necesitan la corta. Duplicar el texto haría que un día
 * el filtro diga una cosa y la tarjeta otra.
 */
const CORTA: Record<FamiliaArchivo, string> = {
  pdf: "PDF",
  planilla: "Excel",
  texto: "Word y texto",
  imagen: "Fotos",
  presentacion: "Presentaciones",
  comprimido: "Comprimidos",
  audio: "Audios",
  video: "Videos",
  correo: "Correos",
  plano: "Planos",
  otro: "Otros",
};

export function etiquetaFamilia(familia: FamiliaArchivo): string {
  return CORTA[familia];
}
