"use client";

import type { MouseEvent } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Info,
  Lightbulb,
} from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { KpiTile, gridDeKpis, type SectionKPI } from "@/components/admin/inicio/_shared";
import { irEnElPanel } from "@/lib/admin/ir-en-el-panel";
import { kpiSinDato } from "@/lib/admin/inicio/hay-datos";
import { cantidad, soles } from "@/lib/admin/inicio/formato-tablero";
import { formatNumber, formatTime } from "@/lib/format";
import type { OverviewData } from "@/lib/admin/overview-tipos";
import { cn } from "@/lib/utils";

/**
 * Hero de Inicio › Resumen (2026-10-09): la venta del período en grande, su
 * variación y las cuatro cifras que la explican (pedidos, ticket, clientes que
 * compraron, clientes nuevos) con el mismo `KpiTile` que el resto del tablero.
 *
 * Reemplaza a `AdminInsightCard` en esta pantalla: aquella repetía la venta
 * por día en tres mini-cifras que redondeaban S/ 0.10 a «S/ 0», mostraba
 * «S/ 0» de relleno y una tira de días que ahora es el gráfico de «Cómo van
 * tus días». El «Bajo stock» vive en el bloque de Inventario y en las alertas.
 */

const ETIQUETA: Record<string, { venta: string; vs: string }> = {
  diario: { venta: "Ventas de hoy", vs: "vs ayer" },
  semanal: { venta: "Ventas de la semana", vs: "vs semana pasada" },
  mensual: { venta: "Ventas del mes", vs: "vs mes pasado" },
  anual: { venta: "Ventas del año", vs: "vs año pasado" },
  especifica: { venta: "Ventas de ese día", vs: "vs día anterior" },
  personalizado: { venta: "Ventas del período", vs: "vs período anterior" },
};

const ICONO_CONSEJO = { opportunity: Lightbulb, warning: AlertTriangle, info: Info } as const;
const COLOR_CONSEJO = {
  opportunity: "text-[var(--accent)]",
  warning: "text-[var(--data-warning-500)]",
  info: "text-[var(--text-tertiary)]",
} as const;

/** «S/ 1,234.50» → prefijo, enteros y decimales, para dibujarlos a distinto tamaño. */
function partirSoles(v: number): { enteros: string; decimales: string } {
  const [, resto = ""] = soles(v).split(/\s(.+)/);
  const [enteros, decimales = "00"] = resto.split(".");
  return { enteros, decimales };
}

function Variacion({ delta, vs }: { delta: number; vs: string }) {
  const sube = delta > 0;
  const Flecha = sube ? ArrowUpRight : ArrowDownRight;
  return (
    <p className="mt-3 flex items-center gap-1.5 text-sm">
      <span
        className={cn(
          "inline-flex items-center gap-0.5 font-extrabold tabular-nums",
          sube ? "text-[var(--data-success)]" : "text-[var(--data-error)]",
        )}
      >
        <Flecha className="h-4 w-4" strokeWidth={2.5} aria-hidden />
        {sube ? "+" : ""}
        {formatNumber(delta, { max: Math.abs(delta) < 10 ? 1 : 0 })}%
      </span>
      <span className="font-semibold text-[var(--text-tertiary)]">{vs}</span>
    </p>
  );
}

export function HeroResumen({
  data,
  preset,
  saludo,
}: {
  data: OverviewData;
  preset: string;
  saludo: string;
}) {
  const et = ETIQUETA[preset] ?? ETIQUETA.diario;
  const venta = data.hero.totalRange ?? data.hero.totalToday ?? 0;
  const delta = data.hero.deltaVsPrevious ?? data.hero.deltaVsYesterday ?? 0;
  const c = data.contextual;
  const pedidos = c.ordersInRange ?? c.ordersToday ?? 0;
  const { enteros, decimales } = partirSoles(venta);

  const kpis: SectionKPI[] = [
    {
      label: "Pedidos",
      value: cantidad(pedidos),
      sinDato: kpiSinDato(pedidos),
      sinDatoHint: "No hubo pedidos en este período.",
      sub: c.activeOrders > 0 ? `${cantidad(c.activeOrders)} por atender` : undefined,
      hint: "Pedidos del período. «Por atender» son los pendientes de cualquier día.",
    },
    {
      label: "Ticket prom.",
      value: soles(c.ticketAverage),
      sinDato: kpiSinDato(c.ticketAverage),
      sinDatoHint: "Sin pedidos para promediar.",
      hint: "Lo vendido ÷ los pedidos del período.",
    },
    {
      label: "Compraron",
      value: cantidad(c.uniqueCustomers),
      sinDato: kpiSinDato(c.uniqueCustomers),
      sinDatoHint:
        c.newCustomers > 0
          ? "Ningún pedido del período trae el teléfono del cliente, así que no se pueden contar."
          : "Ningún cliente identificado compró en este período.",
      hint: "Clientes distintos (por su teléfono) que hicieron un pedido en el período.",
    },
    {
      label: "Nuevos",
      value: cantidad(c.newCustomers),
      sinDato: kpiSinDato(c.newCustomers),
      sinDatoHint: "Nadie se registró como cliente en este período.",
      sub: c.newCustomers === 1 ? "cliente registrado" : "clientes registrados",
    },
  ];

  const consejo = data.insight;
  const IconoConsejo = consejo ? ICONO_CONSEJO[consejo.type] : null;

  return (
    <section
      data-hero-resumen=""
      className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]"
      aria-labelledby="hero-resumen-venta"
    >
      <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-12 lg:gap-6">
        <div className="min-w-0 lg:col-span-5">
          <p className="mb-3 text-lg font-extrabold tracking-tight text-[var(--text-primary)]">
            {saludo}
          </p>
          <div className="mb-1.5 flex items-center gap-1">
            <p
              id="hero-resumen-venta"
              className="text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]"
            >
              {et.venta}
            </p>
            <InfoTip
              title={et.venta}
              what="Lo cobrado en pedidos y ventas del período, sin los cancelados."
              className="-my-1 shrink-0"
              ariaLabel={`Qué suma «${et.venta}»`}
            />
          </div>
          <p
            className="flex items-baseline gap-1.5 leading-none text-[var(--text-primary)]"
            aria-label={soles(venta)}
          >
            <span className="text-2xl font-bold text-[var(--text-tertiary)]">S/</span>
            <span className="tabular-nums">
              <span className="text-5xl font-extrabold tracking-[var(--ls-tight)] sm:text-6xl">
                {enteros}
              </span>
              <span className="text-2xl font-bold text-[var(--text-tertiary)]">.{decimales}</span>
            </span>
          </p>
          {delta !== 0 && <Variacion delta={delta} vs={et.vs} />}
        </div>
        <div className="@container min-w-0 lg:col-span-7">
          <div className={gridDeKpis(kpis.length)}>
            {kpis.map((k) => (
              <KpiTile key={k.label} kpi={k} />
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--rule-soft)] px-5 py-3 sm:px-6">
        {consejo && IconoConsejo && (
          <>
            <IconoConsejo
              className={cn("h-5 w-5 shrink-0", COLOR_CONSEJO[consejo.type])}
              strokeWidth={2.25}
              aria-hidden
            />
            {/* basis 16rem: en celular el botón baja a otra línea en vez de exprimir el texto. */}
            <p className="min-w-0 flex-1 basis-[16rem] text-sm font-semibold text-[var(--text-primary)]">
              {consejo.text}
            </p>
            {consejo.cta && (
              <a
                href={consejo.cta.href}
                onClick={(e: MouseEvent<HTMLAnchorElement>) => irEnElPanel(e)}
                className="inline-flex min-h-11 items-center rounded-full bg-[var(--text-primary)] px-4 text-sm font-bold text-[var(--surface-raised)] transition-opacity hover:opacity-90"
              >
                {consejo.cta.label}
              </a>
            )}
          </>
        )}
        <p className="ml-auto text-xs font-semibold text-[var(--text-tertiary)]">
          Actualizado {formatTime(data.generatedAt)}
        </p>
      </div>
    </section>
  );
}
