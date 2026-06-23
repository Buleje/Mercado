/**
 * Configuracion compartida de navegacion del area /cuenta.
 *
 * Usada por:
 *   - CuentaSidebar (desktop lg+)
 *   - CuentaMobileTabs (mobile/tablet)
 *   - SectionsGrid (cards de secciones del dashboard)
 *
 * Al agregar una sub-ruta bajo /cuenta, registrala aca primero para que
 * automaticamente aparezca en sidebar, tabs y grid.
 */

import type { LucideIcon } from "@buleje/design-system/icons";
import {
  LayoutDashboard,
  Package,
  Truck,
  Repeat,
  Gift,
  Tag,
  Award,
  Heart,
  Bell,
  MapPin,
  CreditCard,
  Settings,
} from "@buleje/design-system/icons";

export type CuentaNavItem = {
  id: string;
  label: string;
  shortLabel: string;
  href: string;
  icon: LucideIcon;
  /** Oculta del sidebar/tabs si true (p.ej seguimiento que es dinamico). */
  hiddenInSidebar?: boolean;
  /** Oculta del SectionsGrid si true. */
  hiddenInGrid?: boolean;
};

export const CUENTA_NAV_ITEMS: CuentaNavItem[] = [
  {
    id: "inicio",
    label: "Inicio",
    shortLabel: "Inicio",
    href: "/cuenta",
    icon: LayoutDashboard,
    hiddenInGrid: true,
  },
  {
    id: "pedidos",
    label: "Mis pedidos",
    shortLabel: "Pedidos",
    href: "/cuenta/pedidos",
    icon: Package,
  },
  {
    id: "seguimiento",
    label: "Seguimiento",
    shortLabel: "Seguir",
    href: "/cuenta/pedidos",
    icon: Truck,
    hiddenInSidebar: true,
  },
  {
    id: "suscripciones",
    label: "Bodega al Mes",
    shortLabel: "Suscripciones",
    href: "/cuenta/suscripciones",
    icon: Repeat,
  },
  {
    id: "gift-cards",
    label: "Gift Cards",
    shortLabel: "Gift Cards",
    href: "/cuenta/gift-cards",
    icon: Gift,
  },
  {
    id: "cupones",
    label: "Cupones",
    shortLabel: "Cupones",
    href: "/cuenta/cupones",
    icon: Tag,
  },
  {
    id: "socio-buleje",
    label: "Socio Buleje",
    shortLabel: "Socio",
    href: "/cuenta/socio-buleje",
    icon: Award,
  },
  {
    id: "favoritos",
    label: "Favoritos",
    shortLabel: "Favoritos",
    href: "/favoritos",
    icon: Heart,
  },
  {
    id: "notificaciones",
    label: "Notificaciones",
    shortLabel: "Alertas",
    href: "/cuenta/notificaciones",
    icon: Bell,
  },
  {
    id: "direcciones",
    label: "Direcciones",
    shortLabel: "Direcciones",
    href: "/cuenta/direcciones",
    icon: MapPin,
  },
  {
    id: "pagos",
    label: "Metodos de pago",
    shortLabel: "Pagos",
    href: "/cuenta/pagos",
    icon: CreditCard,
  },
  {
    id: "preferencias",
    label: "Preferencias",
    shortLabel: "Ajustes",
    href: "/cuenta/preferencias",
    icon: Settings,
  },
];

/** Dado un pathname, devuelve el item activo. Matches por prefijo mas largo.
 *  Tolera el prefijo de la tienda individual `/t/<slug>/…` comparando sobre la
 *  ruta base (sin el prefijo) — así el highlight funciona en marketplace y en
 *  `/t/comprafacil/cuenta/*` por igual. */
export function findActiveNavItem(pathname: string): CuentaNavItem | null {
  const base = pathname.replace(/^\/t\/[^/]+/, "") || "/";
  const matches = CUENTA_NAV_ITEMS.filter(
    (item) => !item.hiddenInSidebar && base.startsWith(item.href),
  );
  if (!matches.length) return null;
  // El match con el href mas largo gana (mas especifico).
  return matches.reduce((best, curr) =>
    curr.href.length > best.href.length ? curr : best,
  );
}
