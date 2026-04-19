"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Scale, ArrowRight } from "@buleje/design-system/icons";
import { useCompare } from "@/contexts/compare-context";

/**
 * Badge flotante que aparece en cualquier parte del marketplace cuando
 * hay 1+ productos en la lista de comparación. Linkea a /marketplace/comparar.
 * No se muestra en la propia ruta /marketplace/comparar para evitar ruido.
 */
export default function CompareFloatingBadge() {
  const { items, max } = useCompare();
  const pathname = usePathname();

  if (!pathname?.startsWith("/marketplace")) return null;
  if (pathname === "/marketplace/comparar") return null;
  if (items.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-40 pointer-events-none"
      aria-hidden={false}
    >
      <Link
        href="/marketplace/comparar"
        className="pointer-events-auto group inline-flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-full bg-gray-900 dark:bg-gray-800 text-white shadow-xl hover:bg-primary transition-colors"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 group-hover:bg-white/20 transition-colors">
          <Scale className="h-3.5 w-3.5" />
        </span>
        <span className="text-sm font-semibold">
          Comparando ({items.length}/{max})
        </span>
        <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
      </Link>
    </div>
  );
}
