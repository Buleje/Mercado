/**
 * objetivos/objetivos-config.ts — nombres, colores y el objetivo vacío
 * (ADR-497). Lo usan la lista, la línea de tiempo, la ventana y la estrategia
 * que se convierte en objetivo.
 */
import type { DatosSeccion } from "@/lib/planificacion/secciones";
import type { Tono } from "../piezas/clases";

export type Objetivo = DatosSeccion<"objetivos">["items"][number];
export type Accion = Objetivo["acciones"][number];
export type EstadoObjetivo = Objetivo["estado"];
export type Plazo = Objetivo["plazo"];

export const ESTADO_OBJETIVO: Readonly<Record<EstadoObjetivo, { nombre: string; tono: Tono }>> = {
  "por-empezar": { nombre: "Por empezar", tono: "neutro" },
  "en-curso": { nombre: "En curso", tono: "info" },
  hecho: { nombre: "Hecho", tono: "exito" },
  pausado: { nombre: "Pausado", tono: "aviso" },
};

export const NOMBRE_PLAZO: Readonly<Record<Plazo, string>> = {
  corto: "Corto plazo",
  mediano: "Mediano plazo",
  largo: "Largo plazo",
};

/** Cuánto suele durar cada plazo, para sugerir la fecha de fin. */
export const MESES_PLAZO: Readonly<Record<Plazo, number>> = { corto: 6, mediano: 18, largo: 36 };

export function objetivoNuevo(id: string, campos: Partial<Omit<Objetivo, "id">> = {}): Objetivo {
  return {
    id,
    titulo: "",
    area: "",
    plazo: "corto",
    inicio: "",
    fin: "",
    responsable: "",
    indicador: "",
    meta: "",
    avance: null,
    estado: "por-empezar",
    estrategiaId: "",
    acciones: [],
    nota: "",
    ...campos,
  };
}

/** El enlace que abre un objetivo desde otra vista (estrategias, resumen). */
export function enlaceObjetivo(id: string): string {
  return `/admin?tab=planificacion&vista=objetivos&sub=lista&abrir=${encodeURIComponent(id)}`;
}
