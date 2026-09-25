/**
 * Las acciones «de vez en cuando» de una GUÍA de Ingresos — el menú «Más».
 *
 * Una sola lista para la fila de la tabla (≥640 px) y para la tarjeta del
 * celular. Antes vivía escrita adentro de la fila y la tarjeta no tenía menú:
 * a 400 px no había forma de corregir la recepción, cargar el costo, ver el
 * documento ni rechazar una guía (medido el 2026-09-25). Dos listas escritas a
 * mano se desalinean en la primera acción nueva; una función, no.
 *
 * Sale el mismo tipo `MenuAccion` que la barra de la vista.
 */

import {
  ArrowLeftRight,
  CalendarClock,
  Camera,
  ChevronRight,
  Coins,
  Copy,
  Eye,
  FileText,
  Pencil,
  Share2,
  ThumbsDown,
} from "@buleje/design-system/icons";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import { yaRecibida } from "@/lib/forestal/fecha-de-llegada";
import { tieneCosto } from "@/lib/forestal/costo-sugerido";
import type { GuiaIngreso } from "@/lib/forestal/ingresos-por-guia";
import type { WoodEntry } from "./ctp-shared";

type Guia = GuiaIngreso<WoodEntry>;

export interface ManejadoresDeGuia {
  onVerDocumento: (g: Guia) => void;
  /** La GTF de SERFOR con su lista de trozas (sólo si el asiento la trae). */
  onVerGuia: (e: WoodEntry) => void;
  onCostear: (g: Guia) => void;
  /** Sin esto no se ofrece «Corregir la recepción» (ADR-434). */
  onCorregirRecepcion?: (g: Guia) => void;
  /** Sin esto no se ofrece «Acomodar trozas en su especie» (ADR-435). */
  onAcomodar?: (g: Guia) => void;
  /** El detalle del asiento: ahí viven las fotos de la carga (ADR-434). */
  onDetail: (e: WoodEntry) => void;
  onChain?: (e: WoodEntry) => void;
  onDuplicate?: (e: WoodEntry) => void;
  onEdit?: (e: WoodEntry) => void;
  onStartReject: (id: string) => void;
  /**
   * Los asientos de una guía de varias líneas, desplegados debajo. La tabla los
   * abre como filas; la tarjeta, como lista. Sin esto no se ofrece.
   */
  asientos?: { abierta: boolean; onAlternar: () => void };
}

export function accionesDeGuia(guia: Guia, h: ManejadoresDeGuia): MenuAccion[] {
  const primera = guia.lineas[0];
  if (!primera) return [];
  const unaSola = guia.lineas.length === 1;
  const sinCosto = !guia.lineas.some(tieneCosto);
  const fotos = Array.isArray(primera.photos) ? primera.photos.length : 0;

  return [
    {
      id: "documento",
      label: "Documento del expediente",
      hint: "El papel de la guía tal como se archiva (ADR-348)",
      icon: FileText,
      onSelect: () => h.onVerDocumento(guia),
    },
    ...(primera.serforGtf
      ? [{
          id: "gtf",
          label: "Ver la GTF de SERFOR",
          hint: "La ficha oficial con su lista de trozas — imprimir o descargar",
          icon: FileText,
          onSelect: () => h.onVerGuia(primera),
        } satisfies MenuAccion]
      : []),
    /* Las fotos se guardan en TODAS las filas de la GTF (ADR-434): abrir el
       detalle de la primera alcanza para verlas y sacar una nueva. */
    {
      id: "fotos",
      label: fotos > 0 ? `Fotos de la carga (${fotos})` : "Sacar fotos de la carga",
      hint: "Se abre el detalle de la guía: en el celular, la cámara",
      icon: Camera,
      onSelect: () => h.onDetail(primera),
    },
    {
      /* El costo, en la fila de la guía (ADR-135). Vivía sólo detrás de
         recepcionar y dentro de Rentabilidad: medido el 2026-09-15, **24 de 24
         asientos sin costo** y 197,65 m³ sin valorizar. */
      id: "costo",
      label: sinCosto ? "Cargar lo que costó" : "Corregir lo que costó",
      hint: sinCosto
        ? "Sin costo, esta madera no puede mostrar margen"
        : "Reescribe el costo de los asientos de la guía",
      icon: Coins,
      onSelect: () => h.onCostear(guia),
    },
    /* La fecha real de llegada (ADR-434): «Recibir en bloque» fechaba con HOY. */
    ...(h.onCorregirRecepcion && yaRecibida(guia)
      ? [{
          id: "corregir-recepcion",
          label: "Corregir la recepción",
          hint: "La fecha real en que llegó la madera, con motivo",
          icon: CalendarClock,
          onSelect: () => h.onCorregirRecepcion?.(guia),
        } satisfies MenuAccion]
      : []),
    /* Sólo con dos o más especies hay fila «equivocada» donde colgar una troza.
       El modal muestra primero qué se mueve: ofrecerlo de más no toca nada. */
    ...(h.onAcomodar && guia.especies.length > 1
      ? [{
          id: "acomodar",
          label: "Acomodar trozas en su especie",
          hint: "Cada troza a la fila de su especie · primero ves qué se mueve",
          icon: ArrowLeftRight,
          onSelect: () => h.onAcomodar?.(guia),
        } satisfies MenuAccion]
      : []),
    ...(!unaSola && h.asientos
      ? [{
          id: "asientos",
          label: h.asientos.abierta ? "Ocultar los asientos" : `Ver los ${guia.lineas.length} asientos`,
          hint: "Esta guía entró al libro en varias líneas",
          icon: ChevronRight,
          onSelect: h.asientos.onAlternar,
        } satisfies MenuAccion]
      : []),
    ...(unaSola && h.onChain && (primera.status === "validado" || primera.status === "procesado")
      ? [{
          id: "cadena",
          label: "Cadena de custodia",
          hint: "A dónde fue esta madera: corridas y despachos",
          icon: Share2,
          onSelect: () => h.onChain?.(primera),
        } satisfies MenuAccion]
      : []),
    ...(unaSola && h.onDuplicate
      ? [{
          id: "duplicar",
          label: "Nuevo ingreso con estos datos",
          hint: "Mismo proveedor, origen y especie",
          icon: Copy,
          onSelect: () => h.onDuplicate?.(primera),
        } satisfies MenuAccion]
      : []),
    ...(unaSola && h.onEdit && primera.status === "pendiente"
      ? [{
          id: "editar",
          label: "Corregir los datos",
          icon: Pencil,
          onSelect: () => h.onEdit?.(primera),
        } satisfies MenuAccion]
      : []),
    ...(unaSola && (primera.status === "pendiente" || primera.status === "validado")
      ? [{
          id: "rechazar",
          label: primera.status === "validado" ? "Anular el ingreso" : "Rechazar el ingreso",
          hint: "Pide un motivo: queda en el historial",
          icon: ThumbsDown,
          tone: "danger" as const,
          onSelect: () => h.onStartReject(primera.id),
        } satisfies MenuAccion]
      : []),
  ];
}

export interface ManejadoresDeAsiento {
  onDetail: (e: WoodEntry) => void;
  /** Sólo si el asiento trae la ficha de SERFOR. */
  onVerGuia?: (e: WoodEntry) => void;
  onChain?: (e: WoodEntry) => void;
  onDuplicate?: (e: WoodEntry) => void;
  onEdit?: (e: WoodEntry) => void;
  onStartReject: (id: string) => void;
}

/**
 * El «Más» de UN asiento desplegado bajo su guía (tabla ≥640 px).
 *
 * Son las mismas acciones que `CtpEntryActions` dibujaba como fila de íconos
 * —ver, GTF, duplicar, cadena, corregir, rechazar/anular—; plegadas acá porque
 * esa fila medía ~240 px y, al desplegar una guía, empujaba la tabla a
 * 1 081 px en una caja de 960 (medido 2026-09-25). «Validar» queda afuera, a
 * la vista: es el acto del día a día.
 */
export function accionesDeAsiento(e: WoodEntry, h: ManejadoresDeAsiento): MenuAccion[] {
  return [
    { id: "ver", label: "Ver la ficha completa", hint: "El asiento con sus piezas, fotos y quién validó", icon: Eye, onSelect: () => h.onDetail(e) },
    ...(h.onVerGuia
      ? [{ id: "gtf", label: "Ver la GTF de SERFOR", hint: "Con su lista de trozas — imprimir o descargar", icon: FileText, onSelect: () => h.onVerGuia?.(e) } satisfies MenuAccion]
      : []),
    ...(h.onDuplicate
      ? [{ id: "duplicar", label: "Nuevo ingreso con estos datos", hint: "Mismo proveedor, origen y especie", icon: Copy, onSelect: () => h.onDuplicate?.(e) } satisfies MenuAccion]
      : []),
    ...(h.onChain && (e.status === "validado" || e.status === "procesado")
      ? [{ id: "cadena", label: "Cadena de custodia", hint: "A dónde fue esta madera: corridas y despachos", icon: Share2, onSelect: () => h.onChain?.(e) } satisfies MenuAccion]
      : []),
    ...(h.onEdit && e.status === "pendiente"
      ? [{ id: "editar", label: "Corregir los datos", icon: Pencil, onSelect: () => h.onEdit?.(e) } satisfies MenuAccion]
      : []),
    ...(e.status === "pendiente" || e.status === "validado"
      ? [{
          id: "rechazar",
          label: e.status === "validado" ? "Anular el asiento" : "Rechazar el asiento",
          hint: "Pide un motivo: queda en el historial",
          icon: ThumbsDown,
          tone: "danger" as const,
          onSelect: () => h.onStartReject(e.id),
        } satisfies MenuAccion]
      : []),
  ];
}
