import React from "react";
import { cn } from "@/lib/utils";

interface AdminCardProps {
  children: React.ReactNode;
  className?: string;
  padding?: "sm" | "md" | "lg";
  hover?: boolean;
}

const paddingMap = {
  sm: "p-3",
  md: "p-5",
  lg: "p-6",
} as const;

/**
 * AdminCard — wrapper canónico para cards admin/superadmin.
 *
 * ADR-074 Phase 2: eliminamos los pares `bg-white dark:bg-zinc-900` y
 * `border-[var(--rule-soft)] dark:border-zinc-800` — todo son tokens que
 * ya resuelven dark mode en `app/globals.css`. Si se cambia `--surface-raised`,
 * el card sigue sin editar.
 *
 * Defaults:
 * - `rounded-xl` (nunca `rounded-2xl` — ver ADR-074 §structural)
 * - `padding = "md"` → `p-5`
 * - `hover = false` (opt-in)
 */
function AdminCard({ children, className, padding = "md", hover = false }: AdminCardProps) {
  return (
    <div
      data-card=""
      className={cn(
        "rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)]",
        paddingMap[padding],
        hover &&
          "hover:shadow-[var(--shadow-sm)] hover:border-[var(--rule-base)] transition-all duration-[var(--dur-base)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export default React.memo(AdminCard);
