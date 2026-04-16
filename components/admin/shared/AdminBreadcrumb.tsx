"use client";
import { ChevronRight, Home } from "lucide-react";
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
    <nav aria-label="Navegación" className={cn("flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mb-3", className)}>
      <Home className="h-3 w-3 shrink-0" />
      <ChevronRight className="h-3 w-3 shrink-0 opacity-40" />
      <span className="font-medium text-gray-600 dark:text-gray-300">Admin</span>
      {items.map((item, idx) => (
        <span key={idx} className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3 shrink-0 opacity-40" />
          {item.onClick ? (
            <button
              onClick={item.onClick}
              className="hover:text-primary dark:hover:text-emerald-400 transition-colors font-medium"
            >
              {item.label}
            </button>
          ) : (
            <span className={cn(
              idx === items.length - 1
                ? "text-gray-900 dark:text-white font-semibold"
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
