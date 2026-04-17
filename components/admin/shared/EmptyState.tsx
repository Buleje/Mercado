"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

// ── SVG illustrations ─────────────────────────────────────────────────────────

const strokeClasses = "stroke-gray-300";

function OrdersIllustration() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" className={strokeClasses}>
      <rect x="30" y="35" width="60" height="50" rx="4" strokeWidth="2" strokeLinejoin="round" />
      <path d="M30 55 L60 70 L90 55" strokeWidth="2" strokeLinejoin="round" />
      <path d="M60 70 L60 85" strokeWidth="2" />
      <path d="M38 45 L50 45" strokeWidth="2" strokeLinecap="round" />
      <path d="M38 50 L46 50" strokeWidth="2" strokeLinecap="round" />
      <polyline points="42,30 60,20 78,30" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="42" y1="30" x2="42" y2="35" strokeWidth="2" />
      <line x1="78" y1="30" x2="78" y2="35" strokeWidth="2" />
    </svg>
  );
}

function ProductsIllustration() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" className={strokeClasses}>
      <rect x="25" y="70" width="70" height="6" rx="2" strokeWidth="2" />
      <rect x="25" y="50" width="70" height="6" rx="2" strokeWidth="2" />
      <line x1="30" y1="56" x2="30" y2="70" strokeWidth="2" />
      <line x1="90" y1="56" x2="90" y2="70" strokeWidth="2" />
      <line x1="30" y1="76" x2="30" y2="90" strokeWidth="2" />
      <line x1="90" y1="76" x2="90" y2="90" strokeWidth="2" />
      <line x1="25" y1="90" x2="95" y2="90" strokeWidth="2" strokeLinecap="round" />
      <rect x="25" y="30" width="70" height="6" rx="2" strokeWidth="2" />
      <line x1="30" y1="36" x2="30" y2="50" strokeWidth="2" />
      <line x1="90" y1="36" x2="90" y2="50" strokeWidth="2" />
    </svg>
  );
}

function CustomersIllustration() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" className={strokeClasses}>
      <circle cx="60" cy="45" r="14" strokeWidth="2" />
      <path d="M36 82 C36 68 46 60 60 60 C74 60 84 68 84 82" strokeWidth="2" strokeLinecap="round" />
      <line x1="90" y1="45" x2="106" y2="45" strokeWidth="2" strokeLinecap="round" />
      <line x1="98" y1="37" x2="98" y2="53" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SalesIllustration() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" className={strokeClasses}>
      <line x1="25" y1="90" x2="95" y2="90" strokeWidth="2" strokeLinecap="round" />
      <line x1="25" y1="30" x2="25" y2="90" strokeWidth="2" strokeLinecap="round" />
      <line x1="25" y1="75" x2="95" y2="75" strokeWidth="1" strokeDasharray="4 4" opacity="0.4" />
      <line x1="25" y1="60" x2="95" y2="60" strokeWidth="1" strokeDasharray="4 4" opacity="0.4" />
      <line x1="25" y1="45" x2="95" y2="45" strokeWidth="1" strokeDasharray="4 4" opacity="0.4" />
      <path d="M35 75 L50 70 L65 72 L80 68 L90 70" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SearchIllustration() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" className={strokeClasses}>
      <circle cx="52" cy="52" r="22" strokeWidth="2" />
      <line x1="68" y1="68" x2="88" y2="88" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="44" y1="44" x2="60" y2="60" strokeWidth="2" strokeLinecap="round" />
      <line x1="60" y1="44" x2="44" y2="60" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function GenericIllustration() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" className={strokeClasses}>
      <path d="M35 35 L35 90 L85 90 L85 50 L70 35 Z" strokeWidth="2" strokeLinejoin="round" />
      <path d="M70 35 L70 50 L85 50" strokeWidth="2" strokeLinejoin="round" />
      <line x1="45" y1="62" x2="75" y2="62" strokeWidth="2" strokeLinecap="round" />
      <line x1="45" y1="70" x2="68" y2="70" strokeWidth="2" strokeLinecap="round" />
      <line x1="45" y1="78" x2="60" y2="78" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const ILLUSTRATIONS: Record<string, React.FC> = {
  orders: OrdersIllustration,
  products: ProductsIllustration,
  customers: CustomersIllustration,
  sales: SalesIllustration,
  search: SearchIllustration,
  generic: GenericIllustration,
};

// ── Component ─────────────────────────────────────────────────────────────────

type IllustrationKey = "orders" | "products" | "customers" | "sales" | "search" | "generic";

interface Props {
  /** Lucide icon (legacy usage, still supported) */
  icon?: LucideIcon;
  /** SVG illustration key (preferred) */
  illustration?: IllustrationKey;
  title?: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}

export default function EmptyState({
  icon: Icon,
  illustration,
  title = "Sin datos",
  description = "No hay información para mostrar aún.",
  action,
  className,
}: Props) {
  const Illust = illustration ? ILLUSTRATIONS[illustration] : null;

  return (
    <div className={cn("flex flex-col items-center justify-center py-12 px-4 text-center", className)}>
      {Illust ? (
        <Illust />
      ) : Icon ? (
        <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
          <Icon className="h-7 w-7 text-primary" />
        </div>
      ) : null}
      <h3 className="text-lg font-semibold text-gray-500 mt-4">{title}</h3>
      <p className="text-sm text-gray-400 mt-1 max-w-xs">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 px-4 py-2 text-xs font-semibold rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
