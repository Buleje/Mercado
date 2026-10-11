"use client";

/**
 * Las cifras del programa de puntos con el patrón de indicadores del panel.
 * Salen de /api/loyalty/metrics (el servidor cuenta TODOS los clientes; antes
 * la vista sumaba sólo los 100 primeros que había bajado, y llamaba «Clientes»
 * a esos 100). «Puntos por vencer» no está: el programa no vence puntos (no
 * hay cron ni movimiento `expiry`), y la tarjeta que lo mostraba lo inventaba.
 */
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatNumber } from "@/lib/format";
import { solesDePuntos } from "./mensajes";
import type { MetricasPuntos } from "./use-puntos";

function Cifra({ rotulo, valor, detalle, ayuda }: { rotulo: string; valor: string; detalle?: string; ayuda?: string }) {
  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-semibold text-[var(--text-secondary)]">{rotulo}</span>
        {ayuda && <InfoTip what={ayuda} />}
      </div>
      <p className="mt-1 text-lg font-extrabold tabular-nums text-[var(--text-primary)]">
        {valor} {detalle && <span className="text-sm font-semibold text-[var(--text-tertiary)]">{detalle}</span>}
      </p>
    </div>
  );
}

export function useIndicadoresPuntos(m: MetricasPuntos | null, cargando: boolean) {
  const n = (v: number | undefined) => (m ? formatNumber(v ?? 0) : "—");
  return useKpisPlegables({
    claveMemoria: "crecimiento-puntos",
    alto: "md",
    compactoEnMovil: true,
    sinDatosAun: cargando && !m,
    resumen: m ? `${m.activeMembers} con puntos · ${formatNumber(m.totalPointsCirculating)} pts` : undefined,
    tarjetas: [
      <Cifra key="c" rotulo="Clientes con puntos" valor={n(m?.activeMembers)} detalle={m ? `de ${formatNumber(m.totalCustomers)}` : undefined} />,
      <Cifra
        key="p"
        rotulo="Puntos sin canjear"
        valor={n(m?.totalPointsCirculating)}
        detalle={m ? `≈ ${solesDePuntos(m.totalPointsCirculating)}` : undefined}
        ayuda="Lo que tus clientes podrían descontar hoy si canjearan todo."
      />,
      <Cifra key="k" rotulo="Canjes en 30 días" valor={n(m?.redeemTransactions)} detalle={m ? `${formatNumber(m.pointsRedeemedLast30d)} pts` : undefined} />,
      <Cifra key="g" rotulo="Ganados en 30 días" valor={n(m?.pointsIssuedLast30d)} detalle={m ? "pts" : undefined} />,
    ],
  });
}
