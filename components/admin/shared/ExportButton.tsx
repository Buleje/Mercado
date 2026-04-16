"use client";

import { FileDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExportButtonProps {
  onClick?: () => void;
  className?: string;
}

export default function ExportButton({ onClick, className }: ExportButtonProps) {
  return (
    <button
      onClick={onClick ?? (() => window.print())}
      className={cn(
        "flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-surface transition-colors",
        className,
      )}
      title="Exportar PDF"
    >
      <FileDown className="h-3 w-3" />
      Exportar
    </button>
  );
}
