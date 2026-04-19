"use client";

import { useState, useRef, useEffect } from "react";
import { Download } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface ExportButtonProps {
  /** Legacy: direct click handler (backward compat) */
  onClick?: () => void;
  /** CSV export handler */
  onExportCSV?: () => void;
  /** PDF export handler */
  onExportPDF?: () => void;
  /** Button label */
  label?: string;
  className?: string;
}

export default function ExportButton({
  onClick,
  onExportCSV,
  onExportPDF,
  label = "Exportar",
  className,
}: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Build options from CSV/PDF handlers
  const options = [
    onExportCSV && { key: "csv", label: "CSV", action: onExportCSV },
    onExportPDF && { key: "pdf", label: "PDF", action: onExportPDF },
  ].filter(Boolean) as { key: string; label: string; action: () => void }[];

  const hasDropdown = options.length > 0;

  // Si solo hay 1 opcion, ejecutar directo sin dropdown
  const handleClick = () => {
    if (!hasDropdown) {
      // Legacy mode: use onClick or default to window.print()
      (onClick ?? (() => window.print()))();
      return;
    }
    if (options.length === 1) {
      options[0].action();
      return;
    }
    setOpen(prev => !prev);
  };

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-semibold transition-colors",
          "border-[var(--rule-base)] dark:border-zinc-700 bg-white dark:bg-zinc-900",
          "text-[var(--text-primary)] dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800",
          className,
        )}
      >
        <Download className="h-4 w-4" />
        {label}
      </button>

      {open && options.length > 1 && (
        <div className="absolute right-0 mt-1 w-32 rounded-xl border border-[var(--rule-base)] dark:border-zinc-700 bg-white dark:bg-zinc-900 z-20 overflow-hidden">
          {options.map(opt => (
            <button
              key={opt.key}
              type="button"
              onClick={() => {
                opt.action();
                setOpen(false);
              }}
              className="w-full text-left px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
