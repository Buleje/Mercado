"use client";

/** Qué IA contesta ahora, en una línea arriba del chat (y el atajo a Modelos). */
import { Cpu } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import type { BulejeIaModelos } from "@/hooks/use-buleje-ia-modelos";

export function AvisoModelo({ modelos, onIrAModelos }: { modelos: BulejeIaModelos; onIrAModelos: () => void }) {
  if (modelos.cargando && !modelos.plataforma) return null;
  const p = modelos.principal;
  const texto = p
    ? `Contesta: ${p.nombre} · ${p.modelo}${modelos.principalLeeFotos === false ? " (no lee fotos)" : ""}`
    : modelos.plataforma?.disponible
      ? "Usando la IA de la plataforma (no lee fotos)"
      : "Todavía no hay una IA lista: elige una en Modelos";
  return (
    <button
      type="button"
      onClick={onIrAModelos}
      title="Cambiar el modelo que contesta"
      className={button({
        variant: "ghost",
        className: "min-w-0 max-w-full justify-start gap-1.5 rounded-xl px-2 font-medium text-[var(--text-secondary)]",
      })}
    >
      <Cpu className="h-4 w-4 shrink-0" aria-hidden />
      <span className="truncate text-xs sm:text-sm">{texto}</span>
    </button>
  );
}
