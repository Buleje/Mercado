"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  User,
  Package,
  Heart,
  Tag,
  MapPin,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { useCustomer } from "@/contexts/customer-context";
import { cn } from "@/lib/utils";

// ── Tabs ──────────────────────────────────────────────────────────────────────

const TABS: ReadonlyArray<{ label: string; href: string; Icon: LucideIcon }> = [
  { label: "Perfil",      href: "/marketplace/mi-cuenta",             Icon: User    },
  { label: "Pedidos",     href: "/marketplace/mi-cuenta/pedidos",     Icon: Package },
  { label: "Favoritos",   href: "/marketplace/mi-cuenta/favoritos",   Icon: Heart   },
  { label: "Cupones",     href: "/marketplace/mi-cuenta/cupones",     Icon: Tag     },
  { label: "Direcciones", href: "/marketplace/mi-cuenta/direcciones", Icon: MapPin  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

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
      router.replace("/marketplace");
    }
  }, [customer, router]);

  if (!customer) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-[var(--text-tertiary)]">Redirigiendo...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)]">
      {/* ── Hero card — avatar grande + datos clave ──────────────────────── */}
      <section className="border-b border-[var(--rule-base)] bg-linear-to-b from-[var(--accent-soft)]/40 to-transparent">
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
          <div className="flex items-center gap-4 sm:gap-5">
            {/* Avatar circular con iniciales — color de marca */}
            <div className="relative shrink-0">
              <div className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-linear-to-br from-[var(--accent)] to-[var(--accent-600,var(--accent))] text-white text-2xl sm:text-3xl font-black shadow-lg shadow-[var(--accent)]/30 ring-4 ring-[var(--surface-canvas)]">
                {getInitials(customer.name)}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
                Mi cuenta
              </p>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] truncate">
                {customer.name}
              </h1>
              {customer.phone && (
                <p className="mt-1 text-sm text-[var(--text-secondary)] font-medium">
                  {customer.phone}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Tabs nav — chips grandes con icono ───────────────────────────── */}
      <div className="sticky top-0 z-20 border-b border-[var(--rule-soft)] bg-[var(--surface-raised)]/95 backdrop-blur-md">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <nav
            aria-label="Secciones de mi cuenta"
            className="flex gap-1.5 overflow-x-auto scrollbar-hide py-2"
          >
            {TABS.map((tab) => {
              const isActive =
                tab.href === "/marketplace/mi-cuenta"
                  ? pathname === "/marketplace/mi-cuenta"
                  : pathname.startsWith(tab.href);
              const Icon = tab.Icon;

              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "shrink-0 inline-flex items-center gap-2 rounded-full px-4 h-10 text-sm font-bold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
                    isActive
                      ? "bg-[var(--accent-600,var(--accent))] text-white shadow-md shadow-[var(--accent)]/30"
                      : "border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-secondary)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)]",
                  )}
                >
                  <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* ── Page content ─────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>
    </div>
  );
}
