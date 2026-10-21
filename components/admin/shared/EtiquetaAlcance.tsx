"use client";
/**
 * Chip «Tu tienda» / «Marketplace» / «Tu tienda y Marketplace» en la cabecera
 * de las pantallas que cambian lo que ve el cliente final (Brandon 20-10:
 * «para evitar confusiones»). Lee el mapa medido de `lib/admin/alcance-tienda`
 * con la vista que le pasa el hub y el `?sub=` de la URL (gana la clave más
 * específica). Sin entrada en el mapa no dibuja nada.
 * El ⓘ dice quién lo ve, a dónde afecta y un ejemplo (regla 9: sin párrafos).
 */
import { useSearchParams } from "next/navigation";
import { Globe, Layers, Store } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { alcanceDe, TEXTO_ALCANCE, type Alcance } from "@/lib/admin/alcance-tienda";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";

const ESTILO: Record<Alcance, { icono: typeof Store; tinta: string }> = {
  tienda: { icono: Store, tinta: "text-[var(--accent-ink)]" },
  marketplace: { icono: Globe, tinta: "text-[var(--data-info-ink)]" },
  ambas: { icono: Layers, tinta: "text-[var(--text-primary)]" },
};

export function EtiquetaAlcance({ tab, vista, className }: { tab: string; vista?: string | null; className?: string }) {
  const sub = useSearchParams()?.get("sub") ?? null;
  const entrada = alcanceDe(tab, vista, sub);
  if (!entrada) return null;
  const texto = TEXTO_ALCANCE[entrada.alcance];
  const { icono: Icono, tinta } = ESTILO[entrada.alcance];
  return (
    <span
      data-testid="etiqueta-alcance"
      data-alcance={entrada.alcance}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--rule-base)] bg-[var(--surface-sunken)] pl-2.5 pr-1 text-xs font-semibold",
        tinta,
        className,
      )}
    >
      <Icono aria-hidden className="h-3.5 w-3.5 shrink-0" />
      <span>{texto.etiqueta}</span>
      <InfoTip
        title={`Esto cambia: ${texto.etiqueta}`}
        what={texto.quien}
        affects={entrada.porque}
        example={entrada.ejemplo ?? texto.ejemplo}
        ariaLabel={`Qué cambia esta pantalla: ${texto.etiqueta}`}
        side="bottom"
      />
    </span>
  );
}

export default EtiquetaAlcance;
