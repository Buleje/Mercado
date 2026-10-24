"use client";

import { MessageCircle } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useEnlaceSoporte } from "@/hooks/use-enlace-soporte";
import { cn } from "@/lib/utils";

const TIP = {
  title: "Escribir a soporte",
  what: "Te abre WhatsApp con el nombre y el ID de tu negocio ya escritos; solo cuéntanos qué pasa. Tu ID le dice a soporte qué negocio eres; nunca te pedirá tu contraseña.",
  example: "«Hola, soy Buleje, ID 525-146: no me carga Ventas»",
};

/** `menu`: fila del menú de cuenta. `boton`: botón con ⓘ para Ajustes. */
export function BotonSoporte({ variante = "boton", alNavegar }: { variante?: "menu" | "boton"; alNavegar?: () => void }) {
  const href = useEnlaceSoporte();
  if (variante === "menu") {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={alNavegar}
        data-qa="escribir-soporte"
        className="w-full flex items-center gap-3 px-3 min-h-12 rounded-xl text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
      >
        <MessageCircle className="h-4 w-4 shrink-0 text-[var(--accent-ink)]" aria-hidden="true" />
        <span>Escribir a soporte</span>
      </a>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        data-qa="escribir-soporte"
        className={cn(
          "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-2.5 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
        )}
      >
        <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">Escribir a soporte</span>
        <span className="sm:hidden">Soporte</span>
      </a>
      <InfoTip {...TIP} />
    </div>
  );
}
