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
    <div className="w-full bg-[var(--surface-canvas)] pt-1 pb-3">
      <nav className="mx-auto max-w-[1400px] px-4 sm:px-6" aria-label="Secciones del módulo">
        {/* Control segmentado: contenedor hundido con leve elevación; el tab
            activo es una pastilla teal sólida. Reemplaza el subrayado plano
            anterior — "se siente" un control de módulos, no texto suelto. */}
        <div className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-1 shadow-sm">
          {tabs.map(({ label, href, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={[
                  "group inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold whitespace-nowrap transition-all duration-150",
                  active
                    ? "bg-[var(--accent)] text-white shadow-sm"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]",
                ].join(" ")}
              >
                <span
                  className={[
                    "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition-colors",
                    active
                      ? "bg-white/20 text-white"
                      : "bg-[var(--surface-raised)] text-[var(--text-tertiary)] group-hover:text-[var(--accent)]",
                  ].join(" ")}
                >
                  <Icon className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                </span>
                {label}
              </Link>
            );
          })}
        </div>
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
