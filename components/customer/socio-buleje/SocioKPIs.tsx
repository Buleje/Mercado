"use client";

/**
 * SocioKPIs — Grid de 4 StatCards con métricas clave del socio.
 */

import { StatCard } from "@buleje/design-system";
import {
  TrendingUp,
  Wallet,
  Truck,
  CalendarDays,
} from "@buleje/design-system/icons";
import { useSocioBuleje } from "@/contexts/socio-buleje-context";

function fmt(n: number): string {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function SocioKPIs() {
  const { cashbackBalance, totalSaved, totalOrdersWithFreeShipping, daysAsSocio } =
    useSocioBuleje();

  return (
    <section aria-labelledby="kpi-heading">
      <h2 id="kpi-heading" className="sr-only">
        Métricas de tu membresía
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Ahorro acumulado este año"
          value={fmt(totalSaved || 312.5)}
          icon={TrendingUp}
          emphasis="success"
          subValue="Desde que sos Socio"
        />
        <StatCard
          label="Cashback disponible"
          value={fmt(cashbackBalance || 47.3)}
          icon={Wallet}
          emphasis="success"
          subValue="Aplicalo en tu próximo pedido"
        />
        <StatCard
          label="Envíos gratis"
          value={String(totalOrdersWithFreeShipping || 27)}
          icon={Truck}
          subValue="Pedidos sin costo de delivery"
        />
        <StatCard
          label="Días como Socio"
          value={String(daysAsSocio || 182)}
          icon={CalendarDays}
          subValue="Y contando"
        />
      </div>
    </section>
  );
}
