"use client";

import { PanelTopClose, PanelTopOpen } from "@buleje/design-system/icons";
import { AdminTooltip } from "@/components/admin/shared/AdminTooltip";
import { fijarCabeceraOculta, useCabeceraOculta } from "@/hooks/use-cabecera-oculta";
import { cn } from "@/lib/utils";

/**
 * Al lado del logo de la barra lateral (Brandon 24-10): oculta o muestra el
 * encabezado del panel (buscador, avisos, cuenta). Ctrl+K lo vuelve a mostrar
 * para buscar (`use-buscador-en-linea`). Con el encabezado oculto, la campana,
 * los mensajes y la cuenta pasan a la barra: los manda el propio encabezado
 * por portal a `[data-hueco-cabecera]` (`AdminTopHeader`).
 */
export function BotonCabecera({ oscuro }: { oscuro: boolean }) {
  const oculta = useCabeceraOculta();
  const texto = oculta ? "Mostrar el encabezado" : "Ocultar el encabezado";
  const Icono = oculta ? PanelTopOpen : PanelTopClose;
  return (
    <AdminTooltip content={texto} side="right" className="text-sm">
      <button
        type="button"
        onClick={() => fijarCabeceraOculta(!oculta)}
        aria-label={texto}
        aria-pressed={oculta}
        data-qa="boton-cabecera"
        className={cn(
          "grid h-11 w-11 shrink-0 place-items-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
          oscuro
            ? "text-white/70 hover:bg-white/10 hover:text-white"
            : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--accent-ink)]",
          oculta && (oscuro ? "bg-white/10 text-white" : "bg-[var(--surface-sunken)] text-[var(--accent-ink)]"),
        )}
      >
        <Icono className="h-5 w-5" aria-hidden />
      </button>
    </AdminTooltip>
  );
}
