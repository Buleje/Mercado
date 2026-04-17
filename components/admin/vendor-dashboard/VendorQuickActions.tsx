"use client";

import { useEffect, useMemo, useState } from "react";
import { Package, PlusSquare, Store, ExternalLink } from "lucide-react";
import Link from "next/link";
import { resolveActiveTenantSlug } from "@/lib/tenant-fetch";

type QuickAction = {
  label: string;
  description: string;
  href: string;
  icon: React.ElementType;
  color: string;
  external?: boolean;
};

function buildActions(slug: string): QuickAction[] {
  return [
    {
      label: "Ver pedidos",
      description: "Atiende los pedidos pendientes",
      href: "/admin?tab=pedidos",
      icon: Package,
      color: "bg-[#f97316] hover:bg-orange-500",
    },
    {
      label: "Cargar producto",
      description: "Agrega un nuevo producto",
      href: "/admin?tab=productos",
      icon: PlusSquare,
      color: "bg-[#00B4A6] hover:bg-teal-500",
    },
    {
      label: "Ver mi tienda",
      description: "Abre tu tienda en el marketplace",
      href: slug ? `/t/${slug}/tienda` : "/marketplace",
      icon: Store,
      color: "bg-gray-700 hover:bg-gray-800 dark:bg-gray-600 dark:hover:bg-gray-500",
      external: true,
    },
  ];
}

export function VendorQuickActions() {
  const [slug, setSlug] = useState("");

  useEffect(() => {
    let active = true;

    void resolveActiveTenantSlug().then((resolved) => {
      if (active && resolved !== "main") setSlug(resolved);
    });

    return () => {
      active = false;
    };
  }, []);

  const actions = useMemo(() => buildActions(slug), [slug]);

  return (
    <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-6 ">
      <h3 className="font-bold text-gray-900 dark:text-foreground mb-4">Acciones rápidas</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.label}
              href={action.href}
              {...(action.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              className={`flex items-center gap-3 p-4 rounded-xl text-white transition-colors min-h-14 ${action.color}`}
            >
              <Icon className="h-6 w-6 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sm leading-tight">{action.label}</p>
                <p className="text-xs opacity-80 leading-tight mt-0.5 truncate">{action.description}</p>
              </div>
              {action.external && <ExternalLink className="h-4 w-4 shrink-0 opacity-60" />}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
