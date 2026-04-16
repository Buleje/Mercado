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

function AdminCard({ children, className, padding = "md", hover = false }: AdminCardProps) {
  return (
    <div
      data-card=""
      className={cn(
        "rounded-2xl border border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900",
        paddingMap[padding],
        hover && "hover:shadow-md hover:border-gray-200 dark:hover:border-zinc-700 transition-all duration-200",
        className,
      )}
    >
      {children}
    </div>
  );
}

export default React.memo(AdminCard);
