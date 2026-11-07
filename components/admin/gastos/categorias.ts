import {
  Home, Lightbulb, Users, Truck, Sparkles, Megaphone, Wrench, Package,
  type LucideIcon,
} from "@buleje/design-system/icons";

/** Las categorías del alta de gasto del panel (Control de Gastos). */
export const CATEGORIAS_GASTO = [
  { value: "alquiler", label: "Alquiler" },
  { value: "servicios", label: "Servicios" },
  { value: "personal", label: "Personal" },
  { value: "transporte", label: "Transporte" },
  { value: "limpieza", label: "Limpieza" },
  { value: "marketing", label: "Marketing" },
  { value: "mantenimiento", label: "Mantenimiento" },
  { value: "otros", label: "Otros" },
] as const;

const ICONOS: Record<string, LucideIcon> = {
  alquiler: Home,
  servicios: Lightbulb,
  personal: Users,
  transporte: Truck,
  limpieza: Sparkles,
  marketing: Megaphone,
  mantenimiento: Wrench,
  otros: Package,
};

export function iconoDeCategoria(category: string): LucideIcon {
  return ICONOS[category] ?? Package;
}
