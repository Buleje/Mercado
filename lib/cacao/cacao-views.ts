/**
 * cacao-views.ts — sub-vistas del módulo Acopio & Beneficio de Cacao, agrupadas
 * en 3 familias (Operación · Gestión · Inteligencia). Fuente única compartida por
 * CacaoAcopio (sub-nav de la página) y el sidebar del admin (sub-enlaces bajo
 * "Cacao"), para no acumular 8 pestañas planas en una sola. Brandon 2026-06-30.
 */

import {
  PackageCheck, Droplets, Warehouse, Coins, Users, BarChart3, Newspaper, Sparkles, Activity, HandCoins,
  type LucideIcon,
} from "@buleje/design-system/icons";

export type CacaoView =
  | "acopio" | "beneficio" | "inventario" | "ventas"
  | "productores" | "liquidaciones" | "resumen" | "mercado" | "noticias" | "asesor";

export type CacaoViewDef = { key: CacaoView; label: string; icon: LucideIcon; hint: string };
export type CacaoViewGroup = { id: string; label: string; views: CacaoViewDef[] };

export const CACAO_VIEW_GROUPS: CacaoViewGroup[] = [
  {
    id: "operacion",
    label: "Operación",
    views: [
      { key: "acopio", label: "Acopio", icon: PackageCheck, hint: "Lotes recibidos" },
      { key: "beneficio", label: "Beneficio", icon: Droplets, hint: "Fermentación + secado" },
      { key: "inventario", label: "Inventario", icon: Warehouse, hint: "Cacao seco" },
      { key: "ventas", label: "Ventas", icon: Coins, hint: "Cacao vendido" },
    ],
  },
  {
    id: "gestion",
    label: "Gestión",
    views: [
      { key: "productores", label: "Productores", icon: Users, hint: "Proveedores" },
      { key: "liquidaciones", label: "Liquidaciones", icon: HandCoins, hint: "Pagos al productor" },
      { key: "resumen", label: "Resumen", icon: BarChart3, hint: "KPIs de campaña" },
    ],
  },
  {
    id: "inteligencia",
    label: "Inteligencia",
    views: [
      { key: "mercado", label: "Mercado", icon: Activity, hint: "Precio en vivo" },
      { key: "noticias", label: "Noticias", icon: Newspaper, hint: "Cacao Perú y mundo" },
      { key: "asesor", label: "Asesor", icon: Sparkles, hint: "¿Vender o aguantar?" },
    ],
  },
];

export const CACAO_VIEWS: CacaoViewDef[] = CACAO_VIEW_GROUPS.flatMap((g) => g.views);
const CACAO_VIEW_KEYS = new Set<string>(CACAO_VIEWS.map((v) => v.key));

/** URL param que deep-linkea una sub-vista (ej. ?tab=cacao-acopio&cacaoView=beneficio). */
export const CACAO_VIEW_PARAM = "cacaoView";
export const DEFAULT_CACAO_VIEW: CacaoView = "acopio";

export function isCacaoView(v: string | null | undefined): v is CacaoView {
  return !!v && CACAO_VIEW_KEYS.has(v);
}
