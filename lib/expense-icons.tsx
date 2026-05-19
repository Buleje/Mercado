/**
 * Map iconKey → componente Lucide para categorías de gastos recurrentes.
 * Archivo separado para que PuntoCompraView pueda renderizar el ícono sin
 * forzar la importación del modal completo (que es lazy).
 */
import {
  Home,
  Zap,
  Users,
  Truck,
  Sparkles,
  Megaphone,
  Wrench,
  FileText,
  Package,
  Wallet,
  UtensilsCrossed,
  Smartphone,
  ShoppingCart,
  BarChart3,
  Target,
  Fuel,
  Wifi,
  Phone,
  Mail,
  CalendarDays,
  Clock,
  type LucideIcon,
} from "@buleje/design-system/icons";

const ICON_MAP: Record<string, LucideIcon> = {
  home: Home,
  zap: Zap,
  users: Users,
  truck: Truck,
  sparkles: Sparkles,
  megaphone: Megaphone,
  wrench: Wrench,
  "file-text": FileText,
  package: Package,
  wallet: Wallet,
  utensils: UtensilsCrossed,
  smartphone: Smartphone,
  "shopping-cart": ShoppingCart,
  "bar-chart-3": BarChart3,
  target: Target,
  fuel: Fuel,
  wifi: Wifi,
  phone: Phone,
  mail: Mail,
  calendar: CalendarDays,
  clock: Clock,
};

export function getCategoryIcon(iconKey: string): LucideIcon {
  return ICON_MAP[iconKey] ?? Package;
}
