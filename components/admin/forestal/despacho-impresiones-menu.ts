/**
 * Las impresiones de una GTF de SALIDA en el menú ⋯ de la fila de Despacho del
 * Libro CTP (Brandon 27-10): las MISMAS cuatro del Libro TH (`opcionesGtf`),
 * con sus nombres e íconos, para que quien aprendió una sepa usar la otra.
 *
 * Una guía ampara varias líneas (una por producto): se pida desde la línea que
 * sea, se imprime la guía ENTERA — lo dicen las pistas.
 *
 * · Borrador (sin N°): las cuatro a la vista y apagadas, con el camino.
 * · Anulada: sólo hoja SERFOR y resumen, con el sello (el talonario y «con
 *   formato» imprimirían una guía válida).
 */

import { FileText, Printer, ReceiptText } from "@buleje/design-system/icons";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import { estadoDeGuia } from "@/lib/forestal/gtf-estado";
import { AVISO_SIN_GUIA } from "./hooks/use-guia-salida";

export type AccionImpresion = "hoja" | "resumen" | "talonario" | "con-formato";

export interface DespachoImprimible {
  gtfNumber: string | null;
  status: "registrado" | "anulado";
}

export const SELLO_ANULADA = "Sale con el sello de anulada";
/** El título del grupo en el menú: lo que se imprime es la guía, no la línea. */
export const SECCION_IMPRIMIR = "Imprimir la guía entera";

export function opcionesImpresionDespacho(
  e: DespachoImprimible,
  { onImprimir, ocupado = null }: { onImprimir: (accion: AccionImpresion) => void; ocupado?: AccionImpresion | null },
): MenuAccion[] {
  const borrador = estadoDeGuia(e.gtfNumber) !== "emitida";
  const anulada = e.status === "anulado";
  const opcion = (id: AccionImpresion, label: string, hint: string, icon: MenuAccion["icon"], tone?: MenuAccion["tone"]): MenuAccion => ({
    id: `imprimir-${id}`,
    seccion: SECCION_IMPRIMIR,
    label,
    hint: borrador ? AVISO_SIN_GUIA : anulada ? SELLO_ANULADA : hint,
    icon,
    tone,
    busy: ocupado === id,
    disabled: borrador || (ocupado != null && ocupado !== id),
    onSelect: () => onImprimir(id),
  });
  const a: MenuAccion[] = [
    opcion("hoja", "Imprimir hoja SERFOR", "La guía entera (todas sus líneas) en la hoja de casilleros; si salen trozas, con su lista", Printer, "dark"),
    opcion("resumen", "Imprimir resumen interno", "De la guía entera: por especie y producto, cadena, trozas, permiso, Anexo 04 y plazo", FileText),
  ];
  if (anulada) return a;
  a.push(
    opcion("talonario", "Imprimir en talonario", "Sólo los valores de la guía entera, cada uno en su casillero del talonario de la matricial", ReceiptText),
    opcion("con-formato", "Imprimir con formato", "La guía entera en hoja blanca, con todo el formato; si salen trozas, también su lista", FileText),
  );
  return a;
}
