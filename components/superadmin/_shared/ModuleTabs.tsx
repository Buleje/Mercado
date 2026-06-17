"use client";

/**
 * SuperAdminModuleTabs — barra de tabs que unifica rutas hermanas en un solo
 * "módulo con funciones completas" (Brandon 2026-06-17, consolidación superadmin).
 *
 * Cada tab es una ruta real (deep-link intacto, sin remontar componentes
 * pesados ni juggling de SSR). La pestaña activa se resuelve por pathname.
 * Se inyecta al tope de cada página del módulo (justo dentro de SUPERADMIN_PAGE).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Receipt,
  CreditCard,
  Smartphone,
  SlidersHorizontal,
  Webhook,
  Building2,
  TrendingUp,
  Gauge,
  Rocket,
  Cable,
  MapPin,
  Boxes,
  type LucideIcon,
} from "@buleje/design-system/icons";

export interface ModuleTab {
  label: string;
  href: string;
  icon: LucideIcon;
}

export function SuperAdminModuleTabs({ tabs }: { tabs: ModuleTab[] }) {
  const pathname = usePathname();
  return (
    <div className="w-full border-b border-[var(--rule-base)] bg-[var(--surface-canvas)]">
      <nav
        className="mx-auto max-w-[1400px] px-4 sm:px-6 flex items-center gap-1 overflow-x-auto"
        aria-label="Secciones del módulo"
      >
        {tabs.map(({ label, href, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={[
                "inline-flex shrink-0 items-center gap-2 px-3.5 py-3 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors",
                active
                  ? "border-[var(--accent)] text-[var(--accent)]"
                  : "border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:border-[var(--rule-base)]",
              ].join(" ")}
            >
              <Icon className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

// ─── Configs por módulo (single source) ──────────────────────────────────────

export const FINANZAS_TABS: ModuleTab[] = [
  { label: "Billing & Stripe", href: "/superadmin/billing", icon: Receipt },
  { label: "Pagos pendientes", href: "/superadmin/pagos-pendientes", icon: CreditCard },
  { label: "Pagos Yape (IA)", href: "/superadmin/pagos-yape", icon: Smartphone },
];

export const SETTINGS_TABS: ModuleTab[] = [
  { label: "Plataforma", href: "/superadmin/settings", icon: SlidersHorizontal },
  { label: "Integraciones & Flags", href: "/superadmin/configuracion", icon: Webhook },
];

export const TENANTS_TABS: ModuleTab[] = [
  { label: "Tiendas", href: "/superadmin/tenants", icon: Building2 },
  { label: "Crecimiento", href: "/superadmin/tenants/growth", icon: TrendingUp },
  { label: "Uso & límites", href: "/superadmin/tenants/usage", icon: Gauge },
  { label: "Activación", href: "/superadmin/tenants/onboarding", icon: Rocket },
  { label: "Integraciones", href: "/superadmin/tenants/integrations", icon: Cable },
  { label: "Mapa", href: "/superadmin/tenants/map", icon: MapPin },
  { label: "Especializaciones", href: "/superadmin/specializations", icon: Boxes },
];
