"use client";

/**
 * Los cuatro números de la caja abierta (apertura, ventas en efectivo, ventas
 * digitales, esperado en el cajón) con el patrón de indicadores del panel
 * (`useKpisPlegables`): el botón va en la fila de las acciones de la caja y,
 * plegado, lleva el esperado adentro — plegar no es esconder el dato.
 *
 * Reemplaza a `CajaIndicadores` (una fila propia para el botón y cuatro
 * tarjetas siempre abiertas). Las mismas cifras están en el Resumen, en «De
 * dónde vino el efectivo»: por eso arrancan plegadas.
 */
import type { ReactNode } from "react";
import { Banknote, Calculator, DollarSign, Smartphone } from "@buleje/design-system/icons";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import { fmt, type StatsCaja } from "./tipos";

interface Tarjeta {
  rotulo: string;
  valor: number;
  icono: typeof Banknote;
  destacado?: boolean;
  ayuda?: ReactNode;
}

export function useIndicadoresCaja(apertura: number, stats: StatsCaja | null) {
  const tarjetas: Tarjeta[] = [
    { rotulo: "Apertura", valor: apertura, icono: DollarSign },
    { rotulo: "Ventas en efectivo", valor: stats?.salesEfectivo ?? 0, icono: Banknote },
    { rotulo: "Ventas digitales", valor: stats?.salesDigital ?? 0, icono: Smartphone, ayuda: "Yape, Plin, tarjeta y transferencia: no entran al cajón." },
    {
      rotulo: "Esperado en caja",
      valor: stats?.expectedCash ?? 0,
      icono: Calculator,
      destacado: true,
      ayuda: (
        <>
          Apertura + ventas en efectivo + ingresos ({fmt(stats?.totalIn ?? 0)}) − retiros ({fmt(stats?.totalOut ?? 0)}).
          {stats?.fueraDelCajon ? ` ${stats.fueraDelCajon}` : ""}
        </>
      ),
    },
  ];

  return useKpisPlegables({
    claveMemoria: "caja-hoy",
    alto: "md",
    compactoEnMovil: true,
    anchoFijo: true,
    resumen: `Esperado ${fmt(stats?.expectedCash ?? 0)}`,
    tarjetas: tarjetas.map(({ rotulo, valor, icono: Icono, destacado, ayuda }) => (
      <div
        key={rotulo}
        className={cn(
          "rounded-xl border bg-[var(--surface-raised)] p-3",
          destacado ? "border-primary/40 ring-1 ring-primary/20" : "border-[var(--rule-base)]",
        )}
      >
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
            <Icono className="h-4 w-4" aria-hidden />
          </span>
          <span className="text-sm font-semibold text-[var(--text-secondary)]">{rotulo}</span>
          {ayuda && <InfoTip what={ayuda} />}
        </div>
        <p className={cn("text-lg font-extrabold tabular-nums", destacado ? "text-[var(--accent-ink)] dark:text-[var(--accent)]" : "text-[var(--text-primary)]")}>
          {fmt(valor)}
        </p>
      </div>
    )),
  });
}
