"use client";

import type { ReactNode } from "react";
import { Users, TrendingUp, UserCheck, Crown } from "@buleje/design-system/icons";
import dynamic from "next/dynamic";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmt } from "@/components/admin/crm/crm-compartido";
import type { Crm } from "@/components/admin/crm/use-crm";
import { ResumenSegmentos } from "@/components/admin/segmentos/ResumenSegmentos";

const CRMTabChart = dynamic(() => import("@/components/admin/CRMTabChart"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full animate-pulse bg-[var(--surface-sunken)] rounded-xl" />
  ),
});

/** Colores del canal: tokens de datos (antes tres hex sueltos que no cambiaban en oscuro). */
const CHANNEL_COLORS = ["var(--accent)", "var(--data-warning-500)", "var(--data-2)", "var(--data-5)", "var(--text-secondary)"];
const CHANNEL_LABELS: Record<string, string> = { local: "Local", whatsapp: "WhatsApp", web: "Web", referido: "Referido", redes: "Redes" };

function Tarjeta({ rotulo, valor, icono: Icono, ayuda, detalle }: {
  rotulo: string; valor: string; icono: typeof Users; ayuda?: ReactNode; detalle?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
      <div className="mb-1 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
          <Icono className="h-4 w-4" aria-hidden />
        </span>
        <span className="text-sm font-semibold text-[var(--text-secondary)]">{rotulo}</span>
        {ayuda && <InfoTip what={ayuda} />}
      </div>
      <p className="truncate text-lg font-extrabold tabular-nums text-[var(--text-primary)]" title={valor}>{valor}</p>
      {detalle && <p className="truncate text-sm text-[var(--text-secondary)]" title={detalle}>{detalle}</p>}
    </div>
  );
}

/**
 * Indicadores de Mis clientes con el patrón del panel (`useKpisPlegables`):
 * el botón va en la cabecera de la vista y arranca CERRADO, con el titular
 * adentro; el panel, debajo. Antes eran cuatro tarjetas grandes siempre
 * abiertas más una línea «Top · 15 clientes · Prom · Activos 30d» que repetía
 * tres de ellas: el mejor cliente es ahora la quinta tarjeta y la línea se va.
 */
export function useIndicadoresCrm(crm: Crm) {
  const { customers, stats } = crm;

  const channelCounts: Record<string, number> = {};
  for (const c of customers) {
    if (c.comoLlego) {
      const key = c.comoLlego.toLowerCase();
      channelCounts[key] = (channelCounts[key] ?? 0) + 1;
    }
  }
  const entries = Object.entries(channelCounts).sort((a, b) => b[1] - a[1]);
  const totalWithChannel = entries.reduce((s, [, v]) => s + v, 0);
  const chartData = entries.map(([name, value]) => ({ name: CHANNEL_LABELS[name] ?? name, value }));

  /* Canal de adquisición: sólo con 5 o más clientes que dijeron cómo llegaron. */
  const canal = totalWithChannel >= 5 ? (
    <div className="flex items-center gap-4 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
      <div style={{ width: 96, height: 96 }}>
        <CRMTabChart data={chartData} colors={CHANNEL_COLORS} />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-bold text-[var(--text-secondary)]">Cómo llegaron</p>
        {chartData.map((d, i) => (
          <div key={d.name} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: CHANNEL_COLORS[i % CHANNEL_COLORS.length] }} aria-hidden />
            <span className="font-medium text-[var(--text-primary)]">{d.name}</span>
            <span className="tabular-nums text-[var(--text-secondary)]">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  ) : undefined;

  return useKpisPlegables({
    claveMemoria: "crm-clientes",
    alto: "md",
    compactoEnMovil: true,
    /* ≤ 22 caracteres: lo que entra en el botón md sin cortarse (memoria kpis-plegables-resumen). */
    resumen: `${stats.activos} activos de ${stats.total}`,
    /* Segmentos se fundió acá (10-10): repetía la faceta «Segmento» de Mis clientes con otra
       regla. Tocar un segmento filtra la tabla por él. */
    encabezado: (
      <div className="space-y-3">
        {canal}
        <ResumenSegmentos clientes={customers} onElegir={(seg) => crm.setFilterSegment([seg])} />
      </div>
    ),
    tarjetas: [
      /* Los nuevos van debajo del total: cinco tarjetas partían la fila a 1280 (4 + 1). */
      <Tarjeta
        key="total"
        rotulo="Clientes"
        valor={String(stats.total)}
        detalle={stats.nuevos === 1 ? "1 nuevo" : `${stats.nuevos} nuevos`}
        icono={Users}
        ayuda="Nuevos: todavía no compran o compraron una sola vez."
      />,
      <Tarjeta
        key="activos"
        rotulo="Activos (30 días)"
        valor={String(stats.activos)}
        icono={UserCheck}
        ayuda="Compraron al menos una vez en los últimos 30 días: un pedido que no se canceló o una venta del POS con su celular."
      />,
      <Tarjeta
        key="promedio"
        rotulo="Gasto promedio"
        valor={fmt(stats.gastoProm)}
        icono={TrendingUp}
        ayuda="Lo que gastó cada cliente, en promedio: ventas del POS con su celular + pedidos entregados. Un pedido en curso suma cuando se entrega."
      />,
      <Tarjeta
        key="mejor"
        rotulo="Mejor cliente"
        valor={stats.mejor ? fmt(stats.mejor.totalSpent ?? 0) : "—"}
        detalle={stats.mejor ? stats.mejor.name : "Nadie gastó todavía"}
        icono={Crown}
      />,
    ],
  });
}
