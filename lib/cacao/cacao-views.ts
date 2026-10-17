/**
 * cacao-views.ts — sub-vistas del módulo Acopio & Beneficio de Cacao, agrupadas
 * en 3 familias (Operación · Gestión · Inteligencia). Fuente única compartida por
 * CacaoAcopio (sub-nav de la página) y el sidebar del admin (sub-enlaces bajo
 * "Cacao"), para no acumular 8 pestañas planas en una sola. Brandon 2026-06-30.
 *
 * 2026-10-10 (plan «panel unificado», ola 2): de 14 a 13 vistas. «Noticias»
 * vive dentro de «Mercado» (las dos leen `/market`: el precio y lo que lo
 * mueve), y «Resumen» encabeza Gestión. `?cacaoView=noticias` sigue abriendo
 * (ver `aCacaoView`).
 */

import {
  PackageCheck, Droplets, Warehouse, Coins, Users, BarChart3, Sparkles, Activity, HandCoins, MapPin, ShieldCheck, Trees, Lock,
  type LucideIcon,
} from "@buleje/design-system/icons";

export type CacaoView =
  | "campo" | "acopio" | "beneficio" | "inventario" | "ventas"
  | "productores" | "liquidaciones" | "mapa" | "certificacion" | "cierre" | "resumen" | "mercado" | "asesor";

export type CacaoViewDef = { key: CacaoView; label: string; icon: LucideIcon; hint: string };
export type CacaoViewGroup = { id: string; label: string; views: CacaoViewDef[] };

export const CACAO_VIEW_GROUPS: CacaoViewGroup[] = [
  {
    id: "operacion",
    label: "Operación",
    views: [
      { key: "campo", label: "Campo", icon: Trees, hint: "Manejo de parcelas" },
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
      /* Primero: la foto de la campaña antes de entrar a cada libro. */
      { key: "resumen", label: "Resumen", icon: BarChart3, hint: "KPIs de campaña" },
      { key: "productores", label: "Productores", icon: Users, hint: "Proveedores" },
      { key: "liquidaciones", label: "Liquidaciones", icon: HandCoins, hint: "Pagos al productor" },
      { key: "mapa", label: "Mapa", icon: MapPin, hint: "Parcelas geolocalizadas" },
      { key: "certificacion", label: "Certificación", icon: ShieldCheck, hint: "Cumplimiento EUDR + certs" },
      { key: "cierre", label: "Cierre", icon: Lock, hint: "Cerrar campaña · acta inmutable" },
    ],
  },
  {
    id: "inteligencia",
    label: "Inteligencia",
    views: [
      { key: "mercado", label: "Mercado", icon: Activity, hint: "Precio en vivo y noticias del cacao en Perú y el mundo" },
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

/** Nombres viejos que siguen llegando (enlaces, sidebar, memoria): «noticias» está dentro de Mercado. */
const CACAO_VIEW_ALIAS: Readonly<Record<string, CacaoView>> = { noticias: "mercado" };

/** La vista que corresponde a `v`: ella misma o, si es un nombre viejo, su casa de hoy. */
export function aCacaoView(v: string | null | undefined): CacaoView | null {
  if (isCacaoView(v)) return v;
  return v && Object.hasOwn(CACAO_VIEW_ALIAS, v) ? CACAO_VIEW_ALIAS[v] : null;
}
