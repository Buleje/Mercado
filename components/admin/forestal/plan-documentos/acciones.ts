/**
 * Lo que la sección de documentos le pide a quien la monta. Dos dueños:
 * el alta (todo queda en memoria hasta guardar el plan) y el plan guardado
 * (todo va al servidor en el momento). La pantalla no distingue.
 */

import type { PendientesCampos } from "@/hooks/use-campos-personalizados";
import type { SubidaEnCurso } from "../hooks/use-plan-documentos";
import type { ArchivoVista, CarpetaVista, CasilleroVista } from "./modelo";
import type { CasilleroNuevoInput } from "./NuevoCasillero";

/** Lo que el plan YA guarda: se muestra en su carpeta, no se pide de nuevo (ADR-467 §5). */
export interface DatosDelPlan {
  resolucionNumber: string | null;
  resolucionDate: string | null;
  representanteLegal: string | null;
  propietarioNombre: string | null;
}

export interface AccionesDocs {
  modo: "alta" | "plan";
  /** El plan, si ya existe (los campos de cada carpeta cuelgan de él). */
  planId: string | null;
  /** Hay algo viajando al servidor. */
  ocupado: boolean;
  subidas: readonly SubidaEnCurso[];
  subir: (files: File[], carpeta: CarpetaVista, casillero: CasilleroVista | null) => void;
  cambiarVence: (archivo: ArchivoVista, fecha: string | null) => void;
  quitar: (archivo: ArchivoVista) => void;
  ver: (archivo: ArchivoVista) => void;
  descartarSubida: (key: string) => void;
  /** Todas devuelven el motivo si no se pudo, o null. */
  crearCarpeta: (nombre: string, paraTodosLosPlanes: boolean) => Promise<string | null>;
  renombrar: (carpeta: CarpetaVista, nombre: string) => Promise<string | null>;
  /** Ausente = en este modo no se ordena (el alta usa el orden de la plantilla). */
  mover?: (carpeta: CarpetaVista, paso: -1 | 1) => Promise<string | null>;
  quitarCarpeta: (carpeta: CarpetaVista) => Promise<string | null>;
  /** Una carpeta hecha a mano en Documentos pasa a la lista del plan. */
  adoptar?: (carpeta: CarpetaVista, paraTodosLosPlanes: boolean) => Promise<string | null>;
  crearCasillero: (carpeta: CarpetaVista, input: CasilleroNuevoInput) => Promise<string | null>;
  /** Alta: lo escrito en los campos de texto de cada carpeta, por clave. */
  datos?: Record<string, PendientesCampos>;
  onDatos?: (clave: string, p: PendientesCampos) => void;
}
