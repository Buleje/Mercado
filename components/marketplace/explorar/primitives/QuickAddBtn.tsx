"use client";

/**
 * QuickAddBtn — boton flota que aparece on hover en cards de productos.
 *
 * Estilo Holded: pill negra con icono Plus, sin sombra heavy.
 * Trigger: parent debe tener `group` class. El boton tiene
 * `opacity-0 group-hover:opacity-100`.
 *
 * Uso:
 * ```tsx
 * <Link className="group ...">
 *   <Image ... />
 *   <QuickAddBtn onAdd={() => addToCart(item)} label="Agregar" />
 * </Link>
 * ```
 *
 * Importante: el caller debe pasar `e.preventDefault()` en onAdd si el
 * card es un Link (sino navega).
 */

import { Plus, Check } from "@buleje/design-system/icons";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  onAdd: (e: React.MouseEvent) => void | Promise<void>;
  label?: string;
  className?: string;
}

export default function QuickAddBtn({ onAdd, label = "Agregar", className }: Props) {
  const [added, setAdded] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await onAdd(e);
    setAdded(true);
    setTimeout(() => setAdded(false), 1400);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={label}
      className={cn(
        "absolute bottom-2.5 right-2.5 z-20",
        "inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full",
        "text-xs font-bold",
        "bg-[var(--text-primary)] text-[var(--surface-canvas)]",
        "shadow-lg shadow-black/10",
        "transition-all duration-200 ease-out",
        "opacity-0 translate-y-1",
        "group-hover:opacity-100 group-hover:translate-y-0",
        "group-hover/card:opacity-100 group-hover/card:translate-y-0",
        "focus-visible:opacity-100 focus-visible:translate-y-0",
        "hover:bg-[var(--accent)] hover:scale-105",
        "active:scale-95",
        added && "bg-[var(--accent)] opacity-100 translate-y-0",
        "motion-reduce:transition-none motion-reduce:hover:scale-100",
        className,
      )}
    >
      {added ? (
        <>
          <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          Agregado
        </>
      ) : (
        <>
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          {label}
        </>
      )}
    </button>
  );
}
