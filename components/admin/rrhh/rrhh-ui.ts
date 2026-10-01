/**
 * rrhh-ui.ts — etiquetas, letras y clases de token compartidas del hub de
 * Recursos Humanos (ADR-414). Single source: la hoja del día, la del mes y el
 * historial pintan el MISMO estado con la MISMA letra y el MISMO color.
 *
 * El color nunca va solo (regla del panel, a11y real): cada botón/celda lleva
 * SIEMPRE la letra o la palabra al lado, nunca sólo un fondo de color.
 */

import type { KeyboardEvent } from "react";
import { etiquetaDia } from "@/lib/rrhh/fechas";
import type { ColaboradorMinDTO, EstadoAsistencia, EstadoColaborador, FechaKey } from "@/lib/rrhh/tipos";

/** `HojaAsistenciaDTO.ventana` — la ventana de corrección del rol (§4). */
export interface VentanaMarcado {
  /** `null` = sin límite hacia atrás (admin/owner/manager). */
  desde: FechaKey | null;
  hasta: FechaKey;
}

export interface EstadoAsistenciaMeta {
  letra: string;
  label: string;
  /** «6 presentes», no «6 presente» — el contador del día lo decía en singular. */
  labelPlural: string;
  /** Texto — AA en claro y oscuro (`-700` claro, `-500` oscuro, memoria hub-ui-tokens-dark). */
  claseTexto: string;
  /** Chip: fondo suave + texto, para la hoja del mes y los badges. */
  claseChip: string;
}

export const ESTADO_ASISTENCIA_META: Record<EstadoAsistencia, EstadoAsistenciaMeta> = {
  PRESENTE: {
    letra: "P",
    label: "Presente",
    labelPlural: "Presentes",
    claseTexto: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
    claseChip: "bg-[var(--data-success-500)]/10 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  },
  TARDANZA: {
    letra: "T",
    label: "Tardanza",
    labelPlural: "Tardanzas",
    claseTexto: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
    claseChip: "bg-[var(--data-warning-500)]/10 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  },
  MEDIO_DIA: {
    letra: "½",
    label: "Medio día",
    labelPlural: "Medios días",
    claseTexto: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
    claseChip: "bg-[var(--data-warning-500)]/10 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  },
  FALTA: {
    letra: "F",
    label: "Falta",
    labelPlural: "Faltas",
    claseTexto: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
    claseChip: "bg-[var(--data-error-500)]/10 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
  },
  PERMISO: {
    letra: "Pe",
    label: "Permiso",
    labelPlural: "Permisos",
    claseTexto: "text-[var(--data-info-700)] dark:text-[var(--data-info-500)]",
    claseChip: "bg-[var(--data-info-500)]/10 text-[var(--data-info-700)] dark:text-[var(--data-info-500)]",
  },
  DESCANSO: {
    letra: "D",
    label: "Descanso",
    labelPlural: "Descansos",
    claseTexto: "text-[var(--text-secondary)]",
    claseChip: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
  },
  VACACIONES: {
    letra: "V",
    label: "Vacaciones",
    labelPlural: "Vacaciones",
    claseTexto: "text-[var(--accent-ink)] dark:text-[var(--accent)]",
    claseChip: "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]",
  },
};

/** Orden fijo de los botones de la hoja del día y de la leyenda. */
export const ORDEN_ESTADOS_ASISTENCIA: EstadoAsistencia[] = [
  "PRESENTE",
  "TARDANZA",
  "MEDIO_DIA",
  "FALTA",
  "PERMISO",
  "DESCANSO",
  "VACACIONES",
];

/** «P Presente · T Tardanza · …» — leyenda de abajo de la hoja del mes. */
export function leyendaDeCalculo(): string {
  return ORDEN_ESTADOS_ASISTENCIA.map((e) => `${ESTADO_ASISTENCIA_META[e].letra} ${ESTADO_ASISTENCIA_META[e].label}`).join(" · ");
}

export interface ColaboradorEstadoMeta {
  label: string;
  claseChip: string;
}

export const COLABORADOR_ESTADO_META: Record<EstadoColaborador, ColaboradorEstadoMeta> = {
  ACTIVO: {
    label: "Activo",
    claseChip: "bg-[var(--data-success-500)]/10 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  },
  VACACIONES: {
    label: "Vacaciones",
    claseChip: "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]",
  },
  LICENCIA: {
    label: "Licencia",
    claseChip: "bg-[var(--data-info-500)]/10 text-[var(--data-info-700)] dark:text-[var(--data-info-500)]",
  },
  SUSPENDIDO: {
    label: "Suspendido",
    claseChip: "bg-[var(--data-warning-500)]/10 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  },
  CESADO: {
    label: "Cesado",
    claseChip: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
  },
};

/** Copy obligatorio junto a todo monto de referencia (ADR-414 §3, texto exacto de Brandon). */
export const COPY_REFERENCIA =
  "Referencia: no es planilla electrónica ni boleta. No calcula CTS, gratificaciones, EsSalud, ONP/AFP ni horas extra.";

const MODALIDAD_LABEL: Record<string, string> = {
  HORA: "por hora",
  DIA: "por día",
  SEMANA: "por semana",
  MES: "por mes",
  SIN_PAGO: "sin pago",
};

export function etiquetaModalidad(modalidad: string): string {
  return MODALIDAD_LABEL[modalidad] ?? modalidad.toLowerCase();
}

/** `12345.4` → "S/ 12,345.40" — mismo formato que el resto del panel (PEN, 2 decimales). */
export function formatearPEN(monto: number): string {
  return `S/ ${monto.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * ¿Este colaborador entra en el masivo/contadores de ESE día?
 *
 * Vista previa de UI — NO reemplaza la regla del servidor
 * (`incluidosEnMasivo`, `lib/rrhh/asistencia.ts`), que es la que de verdad
 * decide qué se guarda. Es sólo para pintar contadores y separar «No
 * incluidos» sin un viaje al servidor por cada fecha que se mira.
 */
export function estaIncluidoEseDia(c: ColaboradorMinDTO, fecha: FechaKey): boolean {
  if (c.estado !== "ACTIVO") return false;
  if (c.fechaIngreso && c.fechaIngreso > fecha) return false;
  if (c.fechaCese && c.fechaCese < fecha) return false;
  return true;
}

/** Por qué un colaborador NO está incluido hoy — para el texto de «No incluidos». */
export function motivoNoIncluido(c: ColaboradorMinDTO, fecha: FechaKey): string {
  if (c.fechaIngreso && c.fechaIngreso > fecha) return `Ingresa el ${c.fechaIngreso.slice(8, 10)}/${c.fechaIngreso.slice(5, 7)}`;
  if (c.fechaCese && c.fechaCese < fecha) return `Cesó el ${c.fechaCese.slice(8, 10)}/${c.fechaCese.slice(5, 7)}`;
  return COLABORADOR_ESTADO_META[c.estado].label;
}

/** `1 persona` / `3 personas` — nunca «persona(s)». */
export function pluralizar(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** Clases del focus visible de una fila clicable — `inset` para no salirse de la tabla. */
export const CLASE_FOCUS_FILA = "focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]";

/**
 * Props para que una `<tr onClick=…>` (o cualquier bloque clicable que no es
 * nativamente un control) también se abra con Enter/Espacio y tenga foco
 * visible — patrón del panel para filas clicables sin controles anidados
 * (`PersonalView.tsx`, `FilaGanado.tsx`). Si algún día una fila así suma un
 * botón/link adentro, ese control para la propagación con
 * `e.stopPropagation()` en su propio handler — no hace falta tocar esto.
 */
export function filaClicableProps(onActivar: () => void) {
  return {
    role: "button" as const,
    tabIndex: 0,
    onKeyDown: (e: KeyboardEvent<HTMLTableRowElement>) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      onActivar();
    },
  };
}

/**
 * ¿`fecha` está dentro de la ventana de corrección del rol? Vista previa de
 * UI — el servidor la vuelve a chequear siempre (403 `fuera_de_ventana`).
 * Sin esto, almacenero/cajero podían tocar un día fuera de rango y recién
 * enterarse por el 403.
 */
export function dentroDeVentana(fecha: FechaKey, ventana: VentanaMarcado): boolean {
  if (ventana.desde && fecha < ventana.desde) return false;
  if (fecha > ventana.hasta) return false;
  return true;
}

/** «Sólo puedes corregir desde el martes 09/09» — motivo visible, no sólo color. */
export function motivoFueraDeVentana(ventana: VentanaMarcado): string {
  if (!ventana.desde) return "Fuera del rango permitido.";
  return `Sólo puedes corregir desde el ${etiquetaDia(ventana.desde)}`;
}

/** `"2026-09-08"` → `"08/09/2026"`. Las fechas date-only del módulo se mostraban crudas en ISO. */
export function formatearFecha(key: string | null | undefined): string {
  if (!key || key.length < 10) return "";
  return `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}`;
}

/** «6 presentes», «1 falta» — contador de un estado de asistencia. */
export function contarEstado(n: number, estado: EstadoAsistencia): string {
  const meta = ESTADO_ASISTENCIA_META[estado];
  return `${n} ${(n === 1 ? meta.label : meta.labelPlural).toLowerCase()}`;
}

/** «Juan Pérez Ríos» → «JP». Para el avatar de la ficha; sin nombre, «?». */
export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  return partes.slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}
