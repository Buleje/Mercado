"use client";

/**
 * Las cifras del programa de puntos con el patrón de indicadores del panel.
 * Salen de /api/loyalty/metrics (el servidor cuenta TODOS los clientes; antes
 * la vista sumaba sólo los 100 primeros que había bajado, y llamaba «Clientes»
 * a esos 100). «Puntos por vencer» no está: el programa no vence puntos (no
 * hay cron ni movimiento `expiry`), y la tarjeta que lo mostraba lo inventaba.
 */
import { StatCard } from "@buleje/design-system";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatNumber } from "@/lib/format";
import { solesDePuntos } from "./mensajes";
import type { MetricasPuntos } from "./use-puntos";

export function useIndicadoresPuntos(m: MetricasPuntos | null, cargando: boolean) {
  const n = (v: number | undefined) => (m ? formatNumber(v ?? 0) : "—");
  return useKpisPlegables({
    claveMemoria: "crecimiento-puntos",
    alto: "md",
    compactoEnMovil: true,
    sinDatosAun: cargando && !m,
    resumen: m ? `${m.activeMembers} con puntos · ${formatNumber(m.totalPointsCirculating)} pts` : undefined,
    tarjetas: [
      <StatCard density="compact" key="c" label="Clientes con puntos" value={n(m?.activeMembers)} subValue={m ? `de ${formatNumber(m.totalCustomers)}` : undefined} />,
      <StatCard
        density="compact"
        key="p"
        label="Puntos sin canjear"
        value={n(m?.totalPointsCirculating)}
        subValue={m ? `≈ ${solesDePuntos(m.totalPointsCirculating)}` : undefined}
        info={<InfoTip what="Lo que tus clientes podrían descontar hoy si canjearan todo." />}
      />,
      <StatCard density="compact" key="k" label="Canjes en 30 días" value={n(m?.redeemTransactions)} subValue={m ? `${formatNumber(m.pointsRedeemedLast30d)} pts` : undefined} />,
      <StatCard density="compact" key="g" label="Ganados en 30 días" value={n(m?.pointsIssuedLast30d)} subValue={m ? "pts" : undefined} />,
    ],
  });
}
