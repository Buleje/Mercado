/**
 * Opciones compartidas del catálogo (categorías + orden) usadas por el rail
 * IZQUIERDO del marketplace y por CatalogView. Módulo liviano (solo iconos)
 * para no acoplar el bundle del rail al de CatalogView (framer-motion, etc.).
 */
import { Flame, Sparkles, TrendingUp, Star } from "@buleje/design-system/icons";
import type { CatalogSort } from "./catalog-filter-context";

export const SORT_OPTIONS: { id: CatalogSort; label: string; icon: React.ReactNode }[] = [
  { id: "popular", label: "Populares", icon: <Flame className="h-3.5 w-3.5" /> },
  { id: "price_asc", label: "Menor precio", icon: <TrendingUp className="h-3.5 w-3.5 rotate-180" /> },
  { id: "price_desc", label: "Mayor precio", icon: <TrendingUp className="h-3.5 w-3.5" /> },
  { id: "newest", label: "Nuevos", icon: <Sparkles className="h-3.5 w-3.5" /> },
  { id: "rating", label: "Mejor valorados", icon: <Star className="h-3.5 w-3.5" /> },
];

export const PRODUCT_CATEGORIES = [
  { id: "todos", label: "Todo" },
  { id: "abarrotes", label: "Abarrotes" },
  { id: "bebidas", label: "Bebidas" },
  { id: "lácteos", label: "Lácteos" },
  { id: "carnes", label: "Carnes" },
  { id: "frutas", label: "Frutas" },
  { id: "verduras", label: "Verduras" },
  { id: "limpieza", label: "Limpieza" },
  { id: "snacks", label: "Snacks" },
  { id: "panadería", label: "Panadería" },
];
