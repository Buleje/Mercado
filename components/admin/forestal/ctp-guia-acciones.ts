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
  FolderOpen,
  Pencil,
  QrCode,
  Share2,
  ThumbsDown,
} from "@buleje/design-system/icons";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import { yaRecibida } from "@/lib/forestal/fecha-de-llegada";
import { esSinCosto } from "@/lib/forestal/madera-de-servicio";
import { normalizarFotos } from "@/lib/forestal/fotos-carga";
import { TOTAL_CASILLEROS } from "@/lib/forestal/documentos-guia";
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
  /**
   * Etiquetas QR de las trozas de esta guía que hoy siguen en el patio
   * (ADR-436). Sin esto no se ofrece «Etiquetas de sus trozas».
   */
  onImprimirEtiquetas?: (g: Guia) => void;
  /** Los casilleros de papeles de la guía (ADR-438). Sin esto no se ofrece. */
  onDocumentos?: (g: Guia) => void;
  /** Cuántos de los 6 casilleros tienen archivo (para el rótulo); sin medir, `undefined`. */
  docsLlenos?: number;
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
  /* «Sin costo» = TODA la guía lo espera y no lo tiene; una de servicio no lo
     espera nunca (ADR-437). */
  const sinCosto = guia.lineas.every((l) => esSinCosto(l));
  const deServicio = guia.lineas.some((l) => l.maderaDeTercero === true);
  const fotos = normalizarFotos(primera.photos).length;

  /*
   * Orden por tema (revisión de Brandon, 2026-09-25: «que no haya duplicados ni
   * opciones basura, todo útil»): papeles → plata y correcciones → navegar →
   * crear → anular, al final y en rojo.
   *
   * «Ver la GTF de SERFOR» se FUSIONÓ con el documento: con ficha de SERFOR,
   * `papelesDeGuia` arma exactamente los papeles de `papelesDeIngreso` (la
   * misma GTF y la misma lista), así que eran dos entradas al mismo visor.
   */
  return [
    // ── Papeles ────────────────────────────────────────────────────────────
    {
      id: "documento",
      label: "Documento de la guía",
      hint: fotos > 0
        ? "La GTF, su lista de trozas y las fotos de la carga: ver, imprimir, PDF o guardar"
        : "La GTF y su lista de trozas: ver, imprimir, PDF o guardar en el expediente",
      icon: FileText,
      onSelect: () => h.onVerDocumento(guia),
    },
    /* Los papeles que LLEGAN con el camión, uno por casillero (ADR-438). */
    ...(h.onDocumentos
      ? [{
          id: "documentos",
          label: h.docsLlenos == null ? "Documentos" : `Documentos (${h.docsLlenos} de ${TOTAL_CASILLEROS})`,
          hint: "Factura, guías de remisión, lista de trozas, GTF y otros: foto o PDF",
          icon: FolderOpen,
          onSelect: () => h.onDocumentos?.(guia),
        } satisfies MenuAccion]
      : []),
    /* El código de planta ya está puesto (recepción, ADR-336): antes de eso
       la etiqueta no tiene qué mostrar, así que se ofrece igual pero abajo
       dice «sin trozas en el patio» si no queda ninguna imprimible. */
    ...(h.onImprimirEtiquetas
      ? [{
          id: "etiquetas",
          label: "Etiquetas de sus trozas",
          hint: "Código, especie, medidas y un QR a la ficha — para pegar en el rollo",
          icon: QrCode,
          onSelect: () => h.onImprimirEtiquetas?.(guia),
        } satisfies MenuAccion]
      : []),
    /* Las fotos se guardan en TODAS las filas de la GTF (ADR-434): abrir el
       detalle de la primera alcanza para verlas y sacar una nueva. No repite
       a «Ficha»: ésa es la ficha de la GUÍA; las fotos viven en el asiento. */
    {
      id: "fotos",
      label: fotos > 0 ? `Fotos de la carga (${fotos})` : "Sacar fotos de la carga",
      hint: fotos > 0 ? "Ver las fotos del camión y la madera, o agregar otra" : "Del camión y la madera; en el celular abre la cámara",
      icon: Camera,
      onSelect: () => h.onDetail(primera),
    },
    // ── Plata y correcciones ───────────────────────────────────────────────
    {
      /* La plata de la guía, en su fila (ADR-135 → ADR-437): si la compraste o
         es de otro, el precio por especie, lo puesto en patio y el pago.
         Medido el 2026-09-26 en Blas: 0 de 11 guías con costo, 8 de servicio. */
      id: "costo",
      label: "Plata de la guía",
      hint: deServicio
        ? `Madera de servicio${primera.duenoNombre ? ` de ${primera.duenoNombre}` : ""}: sin costo · fletes y gastos`
        : sinCosto
          ? "Cuánto costó, a quién le pagas y el pago — sin costo no hay margen"
          : "Precio por especie, puesto en patio y pago",
      icon: Coins,
      onSelect: () => h.onCostear(guia),
    },
    ...(unaSola && h.onEdit && primera.status === "pendiente"
      ? [{
          id: "editar",
          label: "Corregir los datos",
          hint: "Proveedor, especie, volumen o fechas, mientras no esté validada",
          icon: Pencil,
          onSelect: () => h.onEdit?.(primera),
        } satisfies MenuAccion]
      : []),
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
    // ── Navegar ────────────────────────────────────────────────────────────
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
    // ── Crear ──────────────────────────────────────────────────────────────
    ...(unaSola && h.onDuplicate
      ? [{
          id: "duplicar",
          label: "Nuevo ingreso con estos datos",
          hint: "Mismo proveedor, origen y especie",
          icon: Copy,
          onSelect: () => h.onDuplicate?.(primera),
        } satisfies MenuAccion]
      : []),
    // ── Anular (al final, en rojo) ─────────────────────────────────────────
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
    /* «Ver la GTF de SERFOR» ya no va acá: todos los asientos de una guía
       comparten la MISMA GTF, y el «Documento de la guía» de la fila de arriba
       la muestra entera (revisión 2026-09-25: era un duplicado). */
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
