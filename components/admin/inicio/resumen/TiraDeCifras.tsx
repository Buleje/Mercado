"use client";

import type { MouseEvent } from "react";
import { StatCard } from "@buleje/design-system";
import { AlertTriangle, Info, Lightbulb } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { irEnElPanel } from "@/lib/admin/ir-en-el-panel";
import { cantidad, solesEje } from "@/lib/admin/inicio/formato-tablero";
import { formatTime } from "@/lib/format";
import type { OverviewData } from "@/lib/admin/overview-tipos";
import { cn } from "@/lib/utils";
import type { CifraTira } from "./cifras-tira";

/**
 * La tira de cifras de arriba del Resumen (2026-10-29). Reemplaza al hero de
 * `TodayHub` (una venta gigante + 4 casillas, dos en «—», y 40 % de la pantalla
 * en blanco) por 6-7 cifras parejas con su variación y su mini-serie del
 * período. Las que no tienen dato no se dibujan: se nombran en una línea.
 */

const TONO = {
  normal: "text-[var(--text-primary)]",
  aviso: "text-[var(--data-warning-ink)]",
  bien: "text-[var(--data-success-ink)]",
  mal: "text-[var(--data-error-ink)]",
} as const;

/** Barras de la mini-serie: una por día o tramo; la cifra exacta en el `title`. */
function MiniBarras({
  serie,
  color,
  formato,
  etiquetas,
  nombre,
}: {
  serie: number[];
  color: string;
  formato: "soles" | "cantidad";
  etiquetas?: string[];
  nombre: string;
}) {
  const max = Math.max(0, ...serie.map((v) => Math.abs(v)));
  // Soles enteros: la serie de ventas llega redondeada por tramo desde el servidor.
  const fmt = (v: number) => (formato === "soles" ? solesEje(v) : cantidad(v));
  const iMax = serie.findIndex((v) => Math.abs(v) === max);
  const resumen =
    max > 0 ? `${nombre}: lo más alto ${fmt(serie[iMax])}${etiquetas?.[iMax] ? ` (${etiquetas[iMax]})` : ""}` : nombre;
  return (
    <div role="img" aria-label={resumen} className="flex h-7 items-end gap-px @2xl:h-8">
      {serie.map((v, i) => {
        const alto = max > 0 ? Math.max(6, (Math.abs(v) / max) * 100) : 0;
        return (
          <span
            key={`${etiquetas?.[i] ?? ""}-${i}`}
            title={`${etiquetas?.[i] ?? ""} ${fmt(v)}`.trim()}
            className="min-w-0 flex-1 rounded-t-[2px]"
            style={{
              height: v === 0 ? 2 : `${alto}%`,
              backgroundColor: v === 0 ? "var(--rule-base)" : v < 0 ? "var(--data-7)" : color,
            }}
          />
        );
      })}
    </div>
  );
}

/**
 * Una cifra de la tira: la `StatCard` del DS en densidad compacta (ADR-489,
 * «cifras = StatCard») + su mini-serie al pie. El borde lo pone este marco, que
 * abraza también a las barras; la tarjeta va sin borde ni fondo propio.
 * El color de la cifra sale de `-ink` (texto semántico, AA en claro y oscuro),
 * no del `emphasis` de la tarjeta.
 */
function Cifra({ c, className }: { c: CifraTira; className?: string }) {
  return (
    <div
      data-cifra={c.id}
      className={cn("flex min-w-0 flex-col border border-[var(--rule-base)] bg-[var(--surface-raised)]", className)}
    >
      <StatCard
        density="compact"
        className="h-auto border-0 bg-transparent"
        label={c.label}
        info={
          c.hint ? (
            <InfoTip title={c.label} what={c.hint} className="-my-1 shrink-0" ariaLabel={`Qué suma «${c.label}»`} />
          ) : undefined
        }
        value={
          <span className={cn("block truncate", TONO[c.tono ?? "normal"])} title={c.value}>
            {c.value}
          </span>
        }
        delta={c.delta ?? undefined}
        deltaLabel={c.delta != null ? c.deltaLabel : undefined}
        subValue={
          c.sub ? (
            <span
              className={cn("block truncate", c.subTono === "aviso" && "text-[var(--data-warning-ink)]")}
              title={c.sub}
            >
              {c.sub}
            </span>
          ) : undefined
        }
      />
      {c.serie && c.serieColor && (
        <div className="mt-auto px-3 pb-2.5">
          <MiniBarras
            serie={c.serie}
            color={c.serieColor}
            formato={c.serieFormato ?? "soles"}
            etiquetas={c.serieEtiquetas}
            nombre={c.label}
          />
        </div>
      )}
    </div>
  );
}

// Literales completos: Tailwind sólo genera las clases que lee escritas.
const COLS_ANCHO: Record<number, string> = {
  1: "@6xl:grid-cols-1",
  2: "@6xl:grid-cols-2",
  3: "@6xl:grid-cols-3",
  4: "@6xl:grid-cols-4",
  5: "@6xl:grid-cols-5",
  6: "@6xl:grid-cols-6",
  7: "@6xl:grid-cols-7",
  8: "@6xl:grid-cols-8",
};
const SPAN_MEDIO: Record<number, string> = {
  1: "@2xl:col-span-1",
  2: "@2xl:col-span-2",
  4: "@2xl:col-span-4",
};

/**
 * Sin huecos en la última fila: 2 columnas en el celular, 4 en el panel y
 * todas en una fila desde ~72rem. La cifra que sobra en la última fila se
 * estira (7 cifras en 4 columnas → la 7.ª ocupa dos).
 */
function spanDe(i: number, n: number): string {
  const cls: string[] = [];
  const angosto = n % 2 === 1 && i === n - 1;
  const resto = n % 4;
  let medio = 1;
  if (resto > 0 && i >= n - resto) {
    if (resto === 1) medio = 4;
    else if (resto === 2) medio = 2;
    else if (i === n - 1) medio = 2;
  }
  if (angosto) cls.push("col-span-2");
  if (medio !== (angosto ? 2 : 1)) cls.push(SPAN_MEDIO[medio]);
  if (angosto || medio !== 1) cls.push("@6xl:col-span-1");
  return cls.join(" ");
}

const ICONO_CONSEJO = { opportunity: Lightbulb, warning: AlertTriangle, info: Info } as const;
const COLOR_CONSEJO = {
  opportunity: "text-[var(--accent)]",
  warning: "text-[var(--data-warning-500)]",
  info: "text-[var(--text-tertiary)]",
} as const;

export function TiraDeCifras({
  cifras,
  sinMovimiento,
  insight,
  generatedAt,
}: {
  cifras: CifraTira[];
  sinMovimiento: string[];
  insight: OverviewData["insight"];
  generatedAt: string;
}) {
  const Icono = insight ? ICONO_CONSEJO[insight.type] : null;
  return (
    <section data-tira-cifras="" aria-label="Cifras del período" className="space-y-2">
      <div className="@container">
        <div className={cn("grid grid-cols-2 gap-2 @2xl:grid-cols-4", COLS_ANCHO[cifras.length])}>
          {cifras.map((c, i) => (
            <Cifra key={c.id} c={c} className={spanDe(i, cifras.length)} />
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
        {insight && Icono && (
          <>
            <Icono className={cn("h-5 w-5 shrink-0", COLOR_CONSEJO[insight.type])} strokeWidth={2.25} aria-hidden />
            <p className="min-w-0 flex-1 basis-[16rem] font-semibold text-[var(--text-primary)]">{insight.text}</p>
            {insight.cta && (
              <a
                href={insight.cta.href}
                onClick={(e: MouseEvent<HTMLAnchorElement>) => irEnElPanel(e)}
                className="inline-flex min-h-12 items-center rounded-full border border-[var(--rule-base)] px-4 font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)]"
              >
                {insight.cta.label}
              </a>
            )}
          </>
        )}
        {sinMovimiento.length > 0 && (
          <p className="min-w-0 font-medium text-[var(--text-tertiary)]">
            Sin movimiento en el período: {sinMovimiento.join(", ")}.
          </p>
        )}
        <p className="ml-auto font-semibold text-[var(--text-tertiary)]">Actualizado {formatTime(generatedAt)}</p>
      </div>
    </section>
  );
}
