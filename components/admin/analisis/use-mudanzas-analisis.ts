"use client";

/**
 * Lo que Análisis mostraba repetido y ya vive en otra pestaña, como acciones
 * de «Más» (mismo patrón que `FacturacionModule`): sólo a quien puede abrir
 * esa vista, y ninguna mientras el rol no se confirma.
 *
 *   · Reportes comparativos → Mi Plata › Comparar períodos (VistaDePlata.tsx:104-117)
 *   · Precios del mercado   → Compras › Proveedores › Comparar (CompararProveedores.tsx:63)
 *   · Reorden y auto-reorden → Compras › Sugerencias (SugerenciasVista.tsx:51-58)
 */

import { useMemo } from "react";
import { ArrowLeftRight, ShoppingCart, Store, type LucideIcon } from "@buleje/design-system/icons";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { useContextoPermiso } from "@/hooks/use-vistas-permitidas";
import { hrefDeDestino } from "@/lib/admin/enlaces-panel";
import { origenesDeVista, vistaPermitida } from "@/lib/admin/permiso-vista";
import { vistasDelModulo } from "@/lib/admin/subvistas-modulos";
import type { Tab } from "@/app/admin/_lib/tabs.types";

export type ClaveMudanza = "comparativos" | "precios-mercado" | "reorden";

interface Mudanza {
  label: string;
  hint: string;
  icon: LucideIcon;
  tab: Tab;
  vista: string;
  sub?: string;
}

const MUDANZAS: Readonly<Record<ClaveMudanza, Mudanza>> = {
  comparativos: {
    label: "Comparar períodos",
    hint: "En Mi Plata: este mes contra el anterior o contra el mismo mes del año pasado",
    icon: ArrowLeftRight,
    tab: "plata",
    vista: "comparador",
  },
  "precios-mercado": {
    label: "Precios del mercado",
    hint: "En Compras › Proveedores: tus precios contra los de la competencia",
    icon: Store,
    tab: "compras",
    vista: "proveedores",
    sub: "comparar",
  },
  reorden: {
    label: "Qué reponer y auto-reorden",
    hint: "En Compras › Sugerencias: la demanda durante la entrega de cada proveedor",
    icon: ShoppingCart,
    tab: "compras",
    vista: "sugerencias",
  },
};

function origenDe(m: Mudanza): readonly string[] {
  const vista = vistasDelModulo(m.tab).find((v) => v.key === m.vista);
  return origenesDeVista(m.tab, vista ?? {});
}

/** Las mudanzas pedidas que esta persona puede abrir, listas para «Más». */
export function useMudanzasAnalisis(claves: readonly ClaveMudanza[]): MenuAccion[] {
  const ctx = useContextoPermiso();
  const clave = claves.join("|");
  return useMemo(() => {
    if (!ctx) return [];
    return (clave ? (clave.split("|") as ClaveMudanza[]) : [])
      .map((k) => [k, MUDANZAS[k]] as const)
      .filter(([, m]) => vistaPermitida(ctx, origenDe(m)))
      .map(([k, m]) => ({
        id: `ir-${k}`,
        label: m.label,
        hint: m.hint,
        icon: m.icon,
        seccion: "Ver",
        onSelect: () => {
          irAEnlace(hrefDeDestino({ tab: m.tab, params: m.sub ? { vista: m.vista, sub: m.sub } : { vista: m.vista } }));
        },
      }));
  }, [ctx, clave]);
}
