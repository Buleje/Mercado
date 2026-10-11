"use client";

/**
 * Las cifras de Movimientos, Pérdidas y Vencimientos en UN panel plegable cada
 * una (`useKpisPlegables`). Plegado, el botón lleva el titular: plegar no es
 * esconder el dato. Antes: 4-5 tarjetas grandes siempre abiertas y, en
 * Pérdidas, un «Impacto acumulado» al pie que repetía la «Pérdida total».
 */
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { CAUSA, EN_EL_PERIODO, type Periodo, type ResumenPerdidas, type TotalesMovimientos } from "./tipos";
import type { CuentasLotes } from "./vencimientos";

export const soles = (n: number) => `S/ ${formatNumber(n, { min: 2 })}`;
const conSigno = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

type Tono = "neutral" | "success" | "warning" | "danger";
interface Tarjeta { rotulo: string; valor: string; tono?: Tono; ayuda?: string }

const TONO: Record<Tono, string> = {
  neutral: "text-[var(--text-primary)]",
  success: "text-[var(--accent-ink)] dark:text-[var(--accent)]",
  warning: "text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]",
  danger: "text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]",
};

function tarjetas(lista: Tarjeta[]) {
  return lista.map(({ rotulo, valor, tono = "neutral", ayuda }) => (
    <div key={rotulo} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
      <div className="mb-1 flex items-center gap-1.5">
        <span className="text-sm font-semibold text-[var(--text-secondary)]">{rotulo}</span>
        {ayuda && <InfoTip what={ayuda} />}
      </div>
      <p className={cn("text-lg font-extrabold tabular-nums", TONO[tono])}>{valor}</p>
    </div>
  ));
}

const BASE = { alto: "md" as const, compactoEnMovil: true, anchoFijo: true };

export function useIndicadoresMovimientos(t: TotalesMovimientos, periodo: Periodo, sinDatosAun: boolean) {
  const en = EN_EL_PERIODO[periodo];
  return useKpisPlegables({
    ...BASE,
    claveMemoria: "inventario-movimientos",
    sinDatosAun,
    resumen: `Neto ${conSigno(t.neto)}`,
    tarjetas: tarjetas([
      {
        rotulo: `Movimientos ${en}`,
        valor: String(t.count),
        ayuda: t.neutrales > 0 ? `${t.neutrales} ${t.neutrales === 1 ? "es un ajuste" : "son ajustes"} de costo: no cambian el stock y no suman abajo.` : undefined,
      },
      { rotulo: `Entradas ${en}`, valor: conSigno(t.entradas), tono: "success" },
      { rotulo: `Salidas ${en}`, valor: conSigno(-t.salidas), tono: t.salidas > 0 ? "warning" : "neutral" },
      { rotulo: `Neto ${en}`, valor: conSigno(t.neto), tono: t.neto < 0 ? "danger" : t.neto > 0 ? "success" : "neutral", ayuda: "Entradas menos salidas, en unidades de cada producto." },
    ]),
  });
}

export function useIndicadoresPerdidas(r: ResumenPerdidas, periodo: Periodo, sinDatosAun: boolean) {
  const en = EN_EL_PERIODO[periodo];
  return useKpisPlegables({
    ...BASE,
    claveMemoria: "inventario-perdidas",
    sinDatosAun,
    resumen: soles(r.soles),
    tarjetas: tarjetas([
      {
        rotulo: `Pérdida ${en}`,
        valor: soles(r.soles),
        tono: r.soles > 0 ? "danger" : "neutral",
        ayuda: `Cantidad × el costo de hoy de cada producto (el movimiento no guarda el de ese día).${r.sinCosto > 0 ? ` ${r.sinCosto} sin costo cargado suman S/ 0.` : ""}`,
      },
      { rotulo: `Unidades perdidas ${en}`, valor: String(r.unidades), tono: r.unidades > 0 ? "warning" : "neutral" },
      ...r.porCausa.map((c) => ({
        rotulo: CAUSA[c.causa].label,
        valor: soles(c.soles),
        ayuda: `${c.registros} ${c.registros === 1 ? "pérdida" : "pérdidas"}, ${c.unidades} ${c.unidades === 1 ? "unidad" : "unidades"}.`,
      })),
    ]),
  });
}

export function useIndicadoresLotes(c: CuentasLotes, total: number, sinDatosAun: boolean) {
  return useKpisPlegables({
    ...BASE,
    claveMemoria: "inventario-vencimientos",
    sinDatosAun,
    resumen: c.vencido + c.critico > 0 ? `${c.vencido + c.critico} por atender` : `${total} ${total === 1 ? "lote" : "lotes"}`,
    tarjetas: tarjetas([
      {
        rotulo: "Valor en riesgo",
        valor: soles(c.valorEnRiesgo),
        tono: c.valorEnRiesgo > 0 ? "danger" : "neutral",
        ayuda: `Cantidad × costo de los lotes vencidos y de los que vencen esta semana (${c.unidadesEnRiesgo} unidades).`,
      },
      { rotulo: "Lotes con stock", valor: String(total - c.agotado), ayuda: c.agotado > 0 ? `Más ${c.agotado} sin unidades: ya no ponen nada en riesgo.` : undefined },
    ]),
  });
}
