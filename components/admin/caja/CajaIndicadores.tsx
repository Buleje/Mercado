"use client";

/**
 * Los cuatro números de la caja abierta (apertura, ventas en efectivo, ventas
 * digitales, esperado en el cajón), plegables y recordados por navegador con
 * el patrón de `LothSeccionKpis`: plegados siguen diciendo las cifras en una
 * línea. Las acciones de uso constante (ingreso, retiro, cerrar) van en la
 * misma fila: sin botones huérfanos en una fila propia.
 */
import type { ReactNode } from "react";
import { Banknote, Calculator, ChevronDown, DollarSign, Smartphone } from "@buleje/design-system/icons";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import { fmt, type StatsCaja } from "./tipos";

export const CLAVE_INDICADORES_CAJA = "caja:indicadores-abiertos";

interface Props {
  apertura: number;
  stats: StatsCaja | null;
  acciones: ReactNode;
}

export function CajaIndicadores({ apertura, stats, acciones }: Props) {
  const [abierto, setAbierto] = useLocalStorage<boolean>(CLAVE_INDICADORES_CAJA, true);
  const tarjetas: Array<{ rotulo: string; valor: number; icono: typeof Banknote; destacado?: boolean; ayuda?: ReactNode }> = [
    { rotulo: "Apertura", valor: apertura, icono: DollarSign },
    { rotulo: "Ventas efectivo", valor: stats?.salesEfectivo ?? 0, icono: Banknote },
    { rotulo: "Ventas digital", valor: stats?.salesDigital ?? 0, icono: Smartphone, ayuda: "Yape, Plin, tarjeta y transferencia: no entran al cajón." },
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

  return (
    <section aria-label="Indicadores de la caja" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setAbierto(!abierto)}
          aria-expanded={abierto}
          aria-controls="caja-indicadores-panel"
          title={abierto ? "Plegar los indicadores" : "Ver los indicadores"}
          className="inline-flex items-center gap-1.5 min-h-10 rounded-xl px-2.5 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", abierto && "rotate-180")} aria-hidden />
          Indicadores
        </button>
        {!abierto && (
          <p className="min-w-0 flex-1 truncate text-sm text-[var(--text-secondary)] tabular-nums">
            {tarjetas.map((t, i) => (
              <span key={t.rotulo}>
                {i > 0 && " · "}
                {t.rotulo} <span className={cn("font-bold", t.destacado ? "text-primary" : "text-[var(--text-primary)]")}>{fmt(t.valor)}</span>
              </span>
            ))}
          </p>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">{acciones}</div>
      </div>
      <div id="caja-indicadores-panel" hidden={!abierto} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {tarjetas.map(({ rotulo, valor, icono: Icono, destacado, ayuda }) => (
          <div
            key={rotulo}
            className={cn(
              "rounded-xl border p-3 bg-[var(--surface-raised)]",
              destacado ? "border-primary/40 ring-1 ring-primary/20" : "border-[var(--rule-soft)] dark:border-[var(--rule-base)]",
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="h-7 w-7 rounded-lg flex items-center justify-center bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
                <Icono className="h-4 w-4" aria-hidden />
              </span>
              <span className="text-xs font-bold text-[var(--text-tertiary)] uppercase">{rotulo}</span>
              {ayuda && <InfoTip what={ayuda} />}
            </div>
            <p className={cn("text-lg font-extrabold tabular-nums", destacado ? "text-primary" : "text-[var(--text-primary)]")}>{fmt(valor)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
