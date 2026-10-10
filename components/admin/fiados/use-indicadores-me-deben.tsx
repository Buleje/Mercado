"use client";

/**
 * Las cifras de «Me deben» en UN solo lugar, con el patrón de indicadores del
 * panel (`useKpisPlegables`): el botón va en la fila del título y, plegado,
 * lleva lo que te deben adentro.
 *
 * Hasta el 10-10 estas cifras salían tres veces y no siempre iguales: la franja
 * «Total · Cobrado · Vencidos · Tasa» (Resumen y Análisis), «Proyección de
 * cobro» (Resumen) y las cuatro tarjetas de Cobranza; el mismo mes decía
 * «Cobrado S/ 5.00» en una y «Recuperado S/ 0.00» en otra. Son vista previa:
 * los saldos vienen del servidor y acá sólo se suman.
 */
import type { ReactNode } from "react";
import { CalendarClock, HandCoins, Target, TriangleAlert } from "@buleje/design-system/icons";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatCurrency } from "@/lib/format";
import { limaDateKey, cn } from "@/lib/utils";
import { avanceDeMeta } from "@/lib/fiados/gestion-cobranza";
import { cobradoDesde, debeTodavia, fiadosVencidos, lunesDe } from "./cifras-me-deben";
import type { Cobranza } from "./use-cobranza";
import type { Fiado } from "./tipos";

type Tono = "neutro" | "error" | "exito";

interface Tarjeta {
  rotulo: string;
  valor: string;
  pie: ReactNode;
  icono: typeof HandCoins;
  tono?: Tono;
  ayuda?: string;
  barra?: number | null;
}

const COLOR: Record<Tono, string> = {
  neutro: "text-[var(--text-primary)]",
  error: "text-[var(--data-error-ink)]",
  exito: "text-[var(--data-success-ink)]",
};

export function useIndicadoresMeDeben(fiados: readonly Fiado[], cob: Cobranza, cargando: boolean) {
  const hoy = limaDateKey();
  const abiertos = fiados.filter(debeTodavia);
  const teDeben = abiertos.reduce((s, f) => s + f.saldo, 0);
  const clientes = new Set(abiertos.map((f) => f.customerId)).size;
  const vencidos = fiadosVencidos(fiados, hoy);
  const vencido = vencidos.reduce((s, f) => s + f.saldo, 0);
  const cobradoHoy = cobradoDesde(fiados, hoy);
  const cobradoSemana = cobradoDesde(fiados, lunesDe(hoy));
  const avance = avanceDeMeta(cob.meta, cob.recuperado);
  /* Las mismas promesas que «Por vencer»: sólo de clientes que todavía deben (use-cobranza). */
  const promesas = [...cob.promesas.values()];
  const rotas = promesas.filter((p) => p.estado === "incumplio").length;
  const vigentes = promesas.length - rotas;

  const tarjetas: Tarjeta[] = [
    {
      rotulo: "Te deben",
      valor: formatCurrency(teDeben),
      pie: `${clientes} cliente${clientes === 1 ? "" : "s"} · ${abiertos.length} fiado${abiertos.length === 1 ? "" : "s"}`,
      icono: HandCoins,
    },
    {
      rotulo: "Vencido",
      valor: formatCurrency(vencido),
      pie: teDeben > 0 ? `${Math.round((vencido / teDeben) * 100)} % de lo que te deben` : "nada vencido",
      icono: TriangleAlert,
      tono: vencido > 0 ? "error" : "neutro",
      ayuda: "La suma de los fiados cuya fecha de vencimiento ya pasó. El que vence hoy está al día hasta mañana.",
    },
    {
      rotulo: "Cobrado este mes",
      valor: formatCurrency(cob.recuperado),
      pie: avance.porcentaje == null
        ? `hoy ${formatCurrency(cobradoHoy)} · semana ${formatCurrency(cobradoSemana)}`
        : `${avance.porcentaje} % de tu meta de ${formatCurrency(avance.meta)} · hoy ${formatCurrency(cobradoHoy)}`,
      icono: Target,
      tono: "exito",
      barra: avance.porcentaje,
      ayuda: "Lo que te pagaron de fiados este mes, con la fecha de cada cobro; abajo, hoy y desde el lunes. La meta se pone en «Más».",
    },
    {
      rotulo: "Promesas de pago",
      valor: rotas > 0 ? `${rotas} sin cumplir` : String(vigentes),
      pie: rotas > 0 ? `${vigentes} por venir` : vigentes > 0 ? "con fecha comprometida" : "nadie prometió",
      icono: CalendarClock,
      tono: rotas > 0 ? "error" : "neutro",
      ayuda: "Las que anotaste en la bitácora. Las que no se cumplieron salen arriba en «Por vencer».",
    },
  ];

  const resumen = vencido > 0
    ? `${formatCurrency(teDeben)} · ${vencidos.length} vencido${vencidos.length === 1 ? "" : "s"}`
    : `${formatCurrency(teDeben)} por cobrar`;

  return useKpisPlegables({
    claveMemoria: "fiados-me-deben",
    alto: "md",
    compactoEnMovil: true,
    anchoFijo: true,
    sinDatosAun: cargando && fiados.length === 0,
    resumen,
    tarjetas: tarjetas.map(({ rotulo, valor, pie, icono: Icono, tono = "neutro", ayuda, barra }) => (
      <div key={rotulo} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
            <Icono className="h-4 w-4" aria-hidden />
          </span>
          <span className="text-sm font-semibold text-[var(--text-secondary)]">{rotulo}</span>
          {ayuda && <InfoTip what={ayuda} />}
        </div>
        <p className={cn("text-lg font-extrabold tabular-nums", COLOR[tono])}>{valor}</p>
        {barra != null && (
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]" aria-hidden>
            <div className="h-full rounded-full bg-[var(--data-success-500)]" style={{ width: `${barra}%` }} />
          </div>
        )}
        <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{pie}</p>
      </div>
    )),
  });
}
