"use client";
import { ChevronRight, Home } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
}

interface AdminBreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export default function AdminBreadcrumb({ items, className }: AdminBreadcrumbProps) {
  return (
    <nav aria-label="Navegación" className={cn("flex items-center gap-1 text-xs text-[var(--text-tertiary)] mb-3", className)}>
      <Home className="h-3 w-3 shrink-0" />
      <ChevronRight className="h-3 w-3 shrink-0 opacity-40" />
      <span className="font-medium text-[var(--text-secondary)]">Admin</span>
      {items.map((item, idx) => (
        <span key={idx} className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3 shrink-0 opacity-40" />
          {item.onClick ? (
            <button
              onClick={item.onClick}
              className="hover:text-primary dark:hover:text-[var(--data-success-500)] transition-colors font-medium"
            >
              {item.label}
            </button>
          ) : (
            <span className={cn(
              idx === items.length - 1
                ? "text-[var(--text-primary)] font-semibold"
                : "font-medium"
            )}>
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
