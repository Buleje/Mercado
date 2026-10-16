/**
 * Lo común a los bloques de partes de la GTF (destinatario, transporte,
 * propietario y partida del Libro TH): el tipo del `set` por sección, la
 * libreta de cada papel y las props que comparten. Archivo aparte para que
 * `ctp-guia-bloques-partes` y `ctp-guia-bloque-transporte` no se importen en
 * círculo (16-10-2026).
 */

import type { GtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import { ordenarPorUso, parteAInput, type Parte, type RolParte } from "@/lib/forestal/directorio";
import type { useDirectorioForestal } from "@/hooks/use-directorio-forestal";
import type { GuardarEnLibreta } from "@/lib/forestal/libreta";
import { CLASE_FALTA } from "./ctp-guia-piezas";

export type Directorio = ReturnType<typeof useDirectorioForestal>;
/** Claves de `GtfDatos` cuyo valor es un objeto plano — las que parchea `set`. */
export type SeccionObjeto = "propietario" | "destinatario" | "transportista" | "vehiculo" | "traslado";
/** Parche superficial de una sección de la guía. */
export type SetSeccion = <K extends SeccionObjeto>(k: K, v: Partial<GtfDatos[K]>) => void;

export const vacio = (v: string | null | undefined) => !v?.trim();
/** El ámbar de «falta» en una caja vacía. */
export const falta = (v: string | null | undefined) => (vacio(v) ? CLASE_FALTA : "");

/**
 * Lo que la libreta de un bloque necesita: las partes con ese papel, las demás
 * (activas, por uso: elegir una le suma el papel) y el alta completa en el
 * Directorio. Se arma igual en todos los bloques de la guía.
 */
export function libretaDe(directorio: Directorio, rol: RolParte, opciones: Parte[] = directorio.porRol(rol)) {
  const ya = new Set(opciones.map((p) => p.id));
  return {
    rol,
    opciones,
    otras: ordenarPorUso(directorio.partes.filter((p) => p.activo && !ya.has(p.id))),
    onCrear: directorio.guardarParte,
    /* La ventana muestra la libreta entera por categorías, vehículos incluidos. */
    vehiculos: directorio.vehiculosActivos,
    onGuardarVehiculo: directorio.guardarVehiculo,
    onSumarRol: async (p: Parte, r: RolParte) => {
      await directorio.guardarParte({ ...parteAInput(p), roles: [...new Set([...p.roles, r])] });
    },
  };
}

export interface PropsParte {
  datos: GtfDatos;
  set: SetSeccion;
  directorio: Directorio;
  onAnotarParte: (p: Parte) => void;
  onGuardarEnLibreta: GuardarEnLibreta;
  /** Lo que le falta al bloque para imprimir la guía. */
  faltan: readonly string[];
}
