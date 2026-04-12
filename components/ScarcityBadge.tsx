import { cn } from "@/lib/utils";

interface ScarcityBadgeProps {
  stock: number;
  className?: string;
}

/**
 * #30 Scarcity real — badge de urgencia por stock bajo.
 * stock <= 3 → rojo "Ultimas X unidades"
 * stock <= 5 → naranja "Pocas unidades"
 * stock > 5  → null
 */
export default function ScarcityBadge({ stock, className }: ScarcityBadgeProps) {
  if (stock > 5) return null;

  if (stock <= 3) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold text-white bg-red-500 animate-pulse shadow-sm",
          className
        )}
      >
        Ultimas {stock} unidades
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold text-white bg-secondary animate-pulse shadow-sm",
        className
      )}
    >
      Pocas unidades
    </span>
  );
}
