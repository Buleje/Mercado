"use client";

/**
 * Lo que comparten los cinco gráficos de «Extracción»: un color por magnitud
 * (el mismo en los cinco y el mismo que el mapa para cada etapa), los ejes, la
 * leyenda como lista y la caja con su título y su ⓘ.
 */

import type { ReactNode } from "react";
import { CardTitle } from "@buleje/design-system";
import { CHART_AXIS_COLOR, CHART_FONT } from "@/components/ui-system/charts";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fm3 } from "./loth-extraccion-shared";

/** Un color por magnitud. Tokens del DS: en oscuro cambian solos. */
export const COLOR = {
  base: "var(--data-3)",
  autorizado: "var(--data-2)",
  talado: "var(--data-warning-500)",
  trozado: "var(--data-6)",
  despachado: "var(--data-1)",
  consumido: "var(--data-8)",
  porTalar: "var(--data-4)",
  recibido: "var(--data-success-700)",
  aserrado: "var(--data-5)",
  meta: "var(--data-2)",
} as const;

export const TICK = { fontSize: CHART_FONT.axisSize - 1, fontFamily: CHART_FONT.family, fill: CHART_AXIS_COLOR };
export const CURSOR = { fill: "var(--rule-soft)", opacity: 0.5 };
export const enM3 = (v: number | string): string => `${fm3(Number(v))} m³`;
/** Recharts 3 pasa el dato original en `payload` del rectángulo cliqueado. */
export const datoDe = <T,>(d: unknown): T | undefined => (d as { payload?: T } | null)?.payload;

/** La leyenda como lista: la de recharts se monta sobre el eje a 400 px. */
export function Leyenda({ series }: { series: readonly { key: string; label: string; color: string; linea?: boolean }[] }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1" aria-label="Colores del gráfico">
      {series.map((s) => (
        <li key={s.key} className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
          <span
            aria-hidden
            className={s.linea ? "h-0.5 w-4 shrink-0 rounded-full" : "h-3 w-3 shrink-0 rounded-sm"}
            style={{ background: s.color }}
          />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/** La caja de un gráfico: su título, el ⓘ y el dibujo. */
export function Marco({
  titulo,
  ayuda,
  children,
}: {
  titulo: string;
  ayuda: { what: string; affects: string; example: string };
  children: ReactNode;
}) {
  return (
    <figure className="min-w-0 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 sm:p-4">
      <figcaption className="mb-2 flex items-center gap-1.5">
        <CardTitle className="text-sm font-bold">{titulo}</CardTitle>
        <InfoTip title={titulo} {...ayuda} side="bottom" />
      </figcaption>
      {children}
    </figure>
  );
}

/** Lo que dice un gráfico sin nada que dibujar: una frase, no ejes vacíos. */
export function SinDatos({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-[var(--text-tertiary)]">{children}</p>;
}
