"use client";

/**
 * PermisoDe — un bloque que se mudó de pestaña se sigue viendo sólo para quien
 * lo veía en su lugar de antes (plan «panel unificado», regla R2).
 *
 *   <PermisoDe origen="analytics-pro">
 *     <Plegable titulo="Rotación">…</Plegable>
 *   </PermisoDe>
 *
 * `origen` es la pestaña (o pestañas) donde el bloque vivía: plan, plantilla,
 * rubro y rol se evalúan sobre ella (`lib/admin/permiso-vista.ts`). Si no pasa,
 * no se dibuja nada —o `sinPermiso`, si el lugar necesita decir algo—. Mientras
 * el rol no se confirma tampoco pasa: el bloque no se monta ni pide sus datos.
 */

import type { ReactNode } from "react";
import type { Tab } from "@/app/admin/_lib/tabs.types";
import { usePermisoDe } from "@/hooks/use-vistas-permitidas";

export interface PermisoDeProps {
  origen: Tab | readonly Tab[];
  children: ReactNode;
  /** Lo que se dibuja en su lugar cuando no pasa (por defecto, nada). */
  sinPermiso?: ReactNode;
}

export function PermisoDe({ origen, children, sinPermiso = null }: PermisoDeProps) {
  const permitido = usePermisoDe(typeof origen === "string" ? [origen] : origen);
  return <>{permitido ? children : sinPermiso}</>;
}

export default PermisoDe;
