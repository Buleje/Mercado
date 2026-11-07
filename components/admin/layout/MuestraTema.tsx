/**
 * Mini barra lateral para las tarjetas de «Diseños» y «Tema de fondo»
 * (2026-10-20). Se dibuja con las MISMAS clases de sidebar-temas.ts que usa la
 * barra real, con su acento propio (la variable `--accent` se acota a la
 * muestra): lo que se ve en la tarjeta es lo que queda al elegirlo. Antes era
 * un mapa de hex aparte que ya no se parecía a la barra.
 */
import type React from "react";
import { cn } from "@/lib/utils";
import type { AccentColor, Density } from "@/components/admin/shared/SidebarConfigurator";
import { COLOR_DE_ACENTO, estiloDeTema, type SidebarTheme } from "@/components/admin/layout/sidebar-temas";

const SEPARACION: Record<Density, string> = { compact: "space-y-px", normal: "space-y-0.5", spacious: "space-y-1" };
const FILAS = ["Inicio", "Ventas", "Compras"] as const;

export function MuestraTema({
  tema,
  acento,
  densidad = "normal",
  filas = 3,
  className,
}: {
  tema: SidebarTheme;
  acento: AccentColor;
  densidad?: Density;
  filas?: 2 | 3;
  className?: string;
}) {
  const e = estiloDeTema(tema);
  const estiloAcento = { "--accent": COLOR_DE_ACENTO[acento] } as React.CSSProperties;
  return (
    <div
      aria-hidden
      style={estiloAcento}
      className={cn("overflow-hidden rounded-lg border p-1.5", e.bg, e.border, SEPARACION[densidad], className)}
    >
      {FILAS.slice(0, filas).map((nombre, i) => {
        const activa = i === 0;
        return (
          <div
            key={nombre}
            className={cn(
              "relative flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[length:var(--ts-2xs)] leading-none",
              activa ? e.activeItem : cn(e.text, "font-medium"),
            )}
          >
            {activa && (
              <span className="absolute left-0 top-1/2 h-2.5 w-0.5 -translate-y-1/2 rounded-r-full bg-[var(--accent)]" />
            )}
            <span className={cn("h-2 w-2 shrink-0 rounded-sm bg-current", activa ? e.iconoActivo : "opacity-60")} />
            <span className="truncate">{nombre}</span>
          </div>
        );
      })}
    </div>
  );
}
