"use client";

import { Package, PlusSquare, Store } from "lucide-react";
import Link from "next/link";

type QuickAction = {
  label: string;
  description: string;
  href: string;
  icon: React.ElementType;
  color: string;
};

const ACTIONS: QuickAction[] = [
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
    href: "/marketplace",
    icon: Store,
    color: "bg-gray-700 hover:bg-gray-800 dark:bg-gray-600 dark:hover:bg-gray-500",
  },
];

export function VendorQuickActions() {
  return (
    <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-6 shadow-sm">
      <h3 className="font-bold text-gray-900 dark:text-foreground mb-4">Acciones rápidas</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.label}
              href={action.href}
              className={`flex items-center gap-3 p-4 rounded-2xl text-white transition-colors min-h-[56px] ${action.color}`}
            >
              <Icon className="h-6 w-6 shrink-0" />
              <div className="min-w-0">
                <p className="font-bold text-sm leading-tight">{action.label}</p>
                <p className="text-xs opacity-80 leading-tight mt-0.5 truncate">{action.description}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
