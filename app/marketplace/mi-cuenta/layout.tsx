"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useCustomer } from "@/contexts/customer-context";
import { cn } from "@/lib/utils";

// ── Tabs ──────────────────────────────────────────────────────────────────────

const TABS = [
  { label: "Pedidos",     href: "/marketplace/mi-cuenta/pedidos"    },
  { label: "Favoritos",  href: "/marketplace/mi-cuenta/favoritos"   },
  { label: "Cupones",    href: "/marketplace/mi-cuenta/cupones"     },
  { label: "Direcciones",href: "/marketplace/mi-cuenta/direcciones" },
  { label: "Perfil",     href: "/marketplace/mi-cuenta"             },
] as const;

// ── Layout ────────────────────────────────────────────────────────────────────

export default function MiCuentaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { customer } = useCustomer();
  const router = useRouter();
  const pathname = usePathname();

  // Auth guard: sin customer → redirigir al marketplace
  useEffect(() => {
    if (customer === null) {
      // null = hidratado pero sin customer. undefined = aun cargando (no hacer nada).
      router.replace("/marketplace");
    }
  }, [customer, router]);

  // Mientras customer es null (o aun no hidrata), no renderizar nada
  if (!customer) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">Redirigiendo...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Mi cuenta
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {customer.name}
          {customer.phone ? ` · ${customer.phone}` : ""}
        </p>
      </div>

      {/* Tabs nav horizontal */}
      <nav
        aria-label="Secciones de mi cuenta"
        className="mb-6 flex gap-1 overflow-x-auto rounded-lg border border-gray-200 bg-white p-1 dark:border-gray-700 dark:bg-gray-900"
      >
        {TABS.map((tab) => {
          // "Perfil" es la raiz — solo activo en exactamente /marketplace/mi-cuenta
          const isActive =
            tab.href === "/marketplace/mi-cuenta"
              ? pathname === "/marketplace/mi-cuenta"
              : pathname.startsWith(tab.href);

          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "min-w-max rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400",
                isActive
                  ? "bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-gray-100"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {/* Page content */}
      <div>{children}</div>
    </div>
  );
}
