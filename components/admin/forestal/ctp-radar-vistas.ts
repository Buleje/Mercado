/**
 * ctp-radar-vistas — dejar el radar como sirve, y volver a encontrarlo así.
 *
 * El dibujo tiene ya seis mandos (tamaño, color, orden, foco, agrupación,
 * zoom) y cada tarea quiere una combinación distinta: para cerrar el mes se
 * mira agrupado y con foco en los huecos; para mostrarle la cadena a un
 * fiscalizador, bloques grandes y todo desplegado. Rearmarlo cada vez es el
 * trabajo aburrido que hace que nadie use los mandos.
 *
 * Una vista guarda esa combinación completa bajo un nombre. La clave es el
 * NOMBRE normalizado: guardar dos veces «Cierre de mes» actualiza la misma
 * vista en vez de dejar dos que se parecen.
 *
 * Las funciones de lista son puras (tienen tests); sólo `leer`/`escribir` tocan
 * el navegador.
 */

import { z } from "zod";
import type { RadarOrden } from "@/lib/forestal/ctp-radar";
import { acotar, APARIENCIA_DEFAULT, type RadarApariencia } from "./ctp-radar-apariencia";
import type { Foco } from "./ctp-radar-tipos";

/** Tope de vistas guardadas: más que esto y la lista deja de ser un atajo. */
export const MAX_VISTAS = 12;
export const LARGO_NOMBRE = 40;

export interface VistaRadar {
  /** Nombre normalizado en minúsculas: es la identidad de la vista. */
  id: string;
  nombre: string;
  apariencia: RadarApariencia;
  orden: RadarOrden;
  foco: Foco;
  /** `null` = agrupación automática. */
  agruparManual: boolean | null;
  zoom: number;
}

/** Lo que hay que capturar de la pantalla para poder reconstruirla. */
export type EstadoVista = Omit<VistaRadar, "id" | "nombre">;

export function normalizarNombre(s: string): string {
  return s.replace(/\s+/g, " ").trim().slice(0, LARGO_NOMBRE);
}

export function idDeNombre(nombre: string): string {
  return normalizarNombre(nombre).toLowerCase();
}

/**
 * Agrega o reemplaza una vista. La más reciente queda primera: es la que se
 * acaba de usar y la que probablemente se quiera de nuevo.
 */
export function guardarEnLista(lista: readonly VistaRadar[], nombre: string, estado: EstadoVista): VistaRadar[] {
  const limpio = normalizarNombre(nombre);
  if (!limpio) return [...lista];
  const id = idDeNombre(limpio);
  const nueva: VistaRadar = { id, nombre: limpio, ...estado };
  return [nueva, ...lista.filter((v) => v.id !== id)].slice(0, MAX_VISTAS);
}

export function borrarDeLista(lista: readonly VistaRadar[], id: string): VistaRadar[] {
  return lista.filter((v) => v.id !== id);
}

// ─── Persistencia ──────────────────────────────────────────────────────────

const ESQUEMA = z.array(
  z.object({
    id: z.string().min(1).max(LARGO_NOMBRE),
    nombre: z.string().min(1).max(LARGO_NOMBRE),
    apariencia: z.object({
      dims: z.object({ w: z.number(), h: z.number(), gapY: z.number(), gapX: z.number() }),
      colores: z.record(z.string(), z.string().max(64)),
      etiquetasArista: z.boolean(),
      altoPorCantidad: z.boolean().optional(),
      columnaTitulo: z.boolean().optional(),
    }),
    orden: z.enum(["linea", "volumen", "estado"]),
    foco: z.enum(["todos", "huecos", "parciales", "cites"]),
    agruparManual: z.boolean().nullable(),
    // `.catch(1)` y no `z.number()` a secas: un zoom corrupto (NaN, o el `null`
    // que deja `JSON.stringify` sobre un NaN) tiraba la vista ENTERA —nombre,
    // colores, medidas— por el campo más trivial de todos.
    zoom: z.number().catch(1),
  }),
);

/**
 * Reconstruye una vista guardada dejándola dentro de los límites vigentes: una
 * guardada con una versión anterior puede traer medidas que hoy no existen, y
 * un zoom de 9 dibujaría un lienzo que cuelga la pestaña.
 */
function sanear(v: z.infer<typeof ESQUEMA>[number]): VistaRadar {
  const d = v.apariencia.dims;
  const colores: RadarApariencia["colores"] = {};
  for (const k of ["titulo", "ingreso", "corrida", "despacho"] as const) {
    const c = v.apariencia.colores[k];
    if (typeof c === "string" && c) colores[k] = c;
  }
  return {
    id: v.id,
    nombre: v.nombre,
    apariencia: {
      dims: { w: acotar("w", d.w), h: acotar("h", d.h), gapY: acotar("gapY", d.gapY), gapX: acotar("gapX", d.gapX) },
      colores,
      etiquetasArista: v.apariencia.etiquetasArista,
      altoPorCantidad: v.apariencia.altoPorCantidad ?? APARIENCIA_DEFAULT.altoPorCantidad,
      columnaTitulo: v.apariencia.columnaTitulo ?? APARIENCIA_DEFAULT.columnaTitulo,
    },
    orden: v.orden,
    foco: v.foco,
    agruparManual: v.agruparManual,
    zoom: Math.min(3, Math.max(0.25, Number(v.zoom) || 1)),
  };
}

/** Valida y normaliza una lista cruda (el mismo camino que usa `leerVistas`). */
export function sanearLista(crudo: unknown): VistaRadar[] {
  const p = ESQUEMA.safeParse(crudo);
  if (!p.success) return [];
  return p.data.slice(0, MAX_VISTAS).map(sanear);
}

function clave(): string {
  let slug = "main";
  try {
    slug = localStorage.getItem("active-tenant-slug") ?? "main";
  } catch {
    /* storage bloqueado (modo privado) */
  }
  return `buleje-ctp-radar-vistas-${slug}`;
}

export function leerVistas(): VistaRadar[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(clave());
    return raw ? sanearLista(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function escribirVistas(lista: readonly VistaRadar[]): void {
  try {
    localStorage.setItem(clave(), JSON.stringify(lista));
  } catch {
    /* quota: la sesión sigue con la vista aplicada */
  }
}
