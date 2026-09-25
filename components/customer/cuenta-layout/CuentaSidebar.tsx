"use client";

/**
 * CuentaSidebar — navegacion lateral sticky para /cuenta/* (desktop lg+).
 *
 * Se renderiza en el layout del grupo y highlightea la ruta activa.
 * En breakpoints menores a lg se oculta y se muestra CuentaMobileTabs.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Kicker, Caption } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import { useTenantPath } from "@/hooks/use-tenant-path";
import {
  CUENTA_NAV_ITEMS,
  findActiveNavItem,
} from "./cuenta-nav.config";

export interface CuentaSidebarProps {
  className?: string;
}

export function CuentaSidebar({ className }: CuentaSidebarProps) {
  const pathname = usePathname() ?? "/cuenta";
  const active = findActiveNavItem(pathname);
  // Prefija las rutas con /t/<slug> en la tienda individual → la navegación
  // no se sale del contexto del tenant (aislamiento de navegación).
  const tenantPath = useTenantPath();

  return (
    <aside
      aria-label="Navegacion de cuenta"
      className={cn(
        "hidden lg:block w-60 shrink-0",
        className,
      )}
    >
      <div className="sticky top-28">
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
          <Kicker className="px-2 pt-1 pb-2 block">Mi cuenta</Kicker>
          <nav className="flex flex-col gap-0.5" aria-label="Secciones de cuenta">
            {CUENTA_NAV_ITEMS.filter((item) => !item.hiddenInSidebar).map((item) => {
              const Icon = item.icon;
              const isActive = active?.id === item.id;
              return (
                <Link
                  key={item.id}
                  href={tenantPath(item.href)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors",
                    "text-[length:var(--ts-sm)]",
                    isActive
                      ? "bg-[var(--surface-sunken)] text-[var(--text-primary)] font-semibold"
                      : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      isActive
                        ? "text-[var(--text-primary)]"
                        : "text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)]",
                    )}
                    aria-hidden
                  />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="mt-4 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
          <Kicker>Ayuda</Kicker>
          <Caption className="block mt-2 text-[var(--text-secondary)] leading-relaxed">
            Tu bodega de confianza. Si necesitas algo, nuestro equipo responde
            por WhatsApp en minutos.
          </Caption>
          <Link
            href={tenantPath("/ayuda")}
            className="mt-3 inline-block text-[length:var(--ts-xs)] font-semibold text-[var(--accent)] hover:opacity-80"
          >
            Ver centro de ayuda
          </Link>
        </div>
      </div>
    </aside>
  );
}

export default CuentaSidebar;
