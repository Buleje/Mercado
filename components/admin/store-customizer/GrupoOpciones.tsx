"use client";
/**
 * Grupo de opciones grandes (radio) de Apariencia: «Formato de tu tienda» y
 * «Cómo te piden tus clientes». Nació dentro de `SeccionFormatoTienda`; se
 * sacó para que las dos tarjetas se vean iguales.
 */
import type { ReactNode } from "react";
import { Check } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export interface OpcionDe<V extends string> {
  valor: V;
  titulo: string;
  frase: string;
  icono: ReactNode;
}

export function GrupoOpciones<V extends string>({
  etiqueta,
  opciones,
  valor,
  onChange,
  deshabilitado = false,
  ocultarEtiqueta = false,
}: {
  etiqueta: string;
  opciones: OpcionDe<V>[];
  valor: V | null;
  onChange: (v: V) => void;
  deshabilitado?: boolean;
  ocultarEtiqueta?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="space-y-2">
      {!ocultarEtiqueta && <p className="text-sm font-semibold text-[var(--text-primary)]">{etiqueta}</p>}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {opciones.map((o) => {
          const activo = o.valor === valor;
          return (
            <button
              key={o.valor}
              type="button"
              role="radio"
              aria-checked={activo}
              disabled={deshabilitado}
              onClick={() => onChange(o.valor)}
              className={cn(
                "flex min-h-12 w-full items-start gap-3 rounded-xl border-2 p-3 text-left transition-colors duration-[var(--dur-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-wait [&>svg]:mt-0.5 [&>svg]:h-5 [&>svg]:w-5 [&>svg]:shrink-0",
                activo ? "border-primary bg-[var(--surface-sunken)]" : "border-[var(--rule-base)] hover:border-primary",
              )}
            >
              {o.icono}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-[var(--text-primary)]">{o.titulo}</span>
                <span className="block text-sm text-[var(--text-secondary)]">{o.frase}</span>
              </span>
              {activo && <Check aria-hidden className="text-primary" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
