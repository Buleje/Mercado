"use client";

/**
 * «Forma del menú» en Personaliza tu navegación (Brandon 2026-10-20): por
 * categorías que se despliegan, o todos los enlaces a la vista. Mismo estilo de
 * tarjetas que «Estilo de íconos» del configurador (panel siempre oscuro).
 */
import React from "react";
import { List, ListTree } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ModoMenu } from "@/components/admin/layout/sidebar-enlaces";

const OPCIONES: { id: ModoMenu; titulo: string; detalle: string; Icono: React.ElementType }[] = [
  { id: "categorias", titulo: "Por categorías", detalle: "Agrupa y se despliega al tocar", Icono: ListTree },
  { id: "enlaces", titulo: "Sin categorías", detalle: "Todos los enlaces a la vista", Icono: List },
];

export function SelectorModoMenu({ value, onChange }: { value: ModoMenu; onChange: (m: ModoMenu) => void }) {
  return (
    <div className="mb-3">
      <p id="forma-del-menu" className="text-xs font-semibold text-zinc-300 mb-2">Forma del menú</p>
      <div role="radiogroup" aria-labelledby="forma-del-menu" className="grid grid-cols-2 gap-2">
        {OPCIONES.map(({ id, titulo, detalle, Icono }) => {
          const elegido = value === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={elegido}
              data-modo-menu-opcion={id}
              onClick={() => onChange(id)}
              className={cn(
                "rounded-xl border px-3 py-2.5 text-left transition-all",
                elegido
                  ? "border-primary/60 bg-primary/10 text-zinc-100"
                  : "border-zinc-700 hover:border-zinc-500 bg-zinc-800/40 text-zinc-300",
              )}
            >
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <Icono className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {titulo}
              </span>
              <span className="block text-xs text-zinc-400 mt-0.5">{detalle}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
