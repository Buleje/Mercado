"use client";

/**
 * Acciones del marketplace en UNA fila de botones (2026-10-09). Antes eran 3
 * bloques de color de 74 px (ámbar, teal y gris) con su propio título; ahora
 * van al pie de «Cómo va tu tienda hoy»: la principal llena, las otras con borde.
 */

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Package, PlusSquare, Store } from "@buleje/design-system/icons";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { resolveActiveTenantSlug } from "@/lib/tenant-fetch";
import { esMarketplace } from "@/lib/tenancy/negocio-por-defecto";

type QuickAction = {
  label: string;
  href: string;
  icon: React.ElementType;
  principal?: boolean;
  external?: boolean;
};

function buildActions(slug: string): QuickAction[] {
  return [
    { label: "Ver pedidos", href: "/admin?tab=pedidos", icon: Package, principal: true },
    { label: "Cargar producto", href: "/admin?tab=productos", icon: PlusSquare },
    { label: "Ver mi tienda", href: slug ? `/t/${slug}/tienda` : "/marketplace", icon: Store, external: true },
  ];
}

const BASE = "inline-flex min-h-11 w-full items-center justify-center gap-2 px-4 sm:w-auto sm:justify-start text-sm font-bold transition-colors hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";
const PRINCIPAL = "bg-[var(--accent-dark)] text-white hover:bg-[var(--accent-600)]";
const SECUNDARIA = "border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]";

export function VendorQuickActions({ pendientes = 0 }: { pendientes?: number }) {
  const [slug, setSlug] = useState("");

  useEffect(() => {
    let active = true;
    void resolveActiveTenantSlug().then((resolved) => {
      if (active && !esMarketplace(resolved)) setSlug(resolved);
    });
    return () => {
      active = false;
    };
  }, []);

  const actions = useMemo(() => buildActions(slug), [slug]);

  return (
    <nav aria-label="Acciones del marketplace" className="flex flex-wrap gap-2">
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <EnlacePanel
            apariencia="heredada"
            key={action.label}
            href={action.href}
            {...(action.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className={`${BASE} ${action.principal ? PRINCIPAL : SECUNDARIA}`}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {action.label}
            {action.principal && pendientes > 0 && (
              <span className="ml-0.5 inline-flex min-w-6 items-center justify-center rounded-full bg-[color-mix(in_srgb,currentColor_22%,transparent)] px-1.5 text-xs font-extrabold tabular-nums">
                {pendientes}
              </span>
            )}
            {action.external && <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70" aria-label="Se abre en otra pestaña" />}
          </EnlacePanel>
        );
      })}
    </nav>
  );
}
