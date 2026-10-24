import { CardTitle } from "@buleje/design-system";
import {
  ArrowDownToLine, ArrowUpFromLine, Percent, Receipt, TrendingUp, Wallet,
} from "@buleje/design-system/icons";
import { kpiSinDato } from "@/lib/admin/inicio/hay-datos";
import { cantidad, porcentaje, soles } from "@/lib/admin/inicio/formato-tablero";

import { KpiTile, type SectionKPI } from "./_shared";
import { margenLegible, type CajaData } from "./caja-presentacion";

/** Variación contra el período anterior; «— 0%» se lee mejor como frase. */
function variacion(d: number | null): Pick<SectionKPI, "delta" | "deltaLabel" | "sub"> {
  if (d === 0) return { sub: "igual que antes" };
  return { delta: d, deltaLabel: "vs período anterior" };
}

/**
 * La cabecera de la pestaña: las cuatro cifras que el dueño mira primero
 * («¿cuánto entró, cuánto salió, me quedó plata, cuántas veces cobré?»).
 * Reemplaza 6 StatCards + una barra «Ingresos − Egresos = Balance» que repetía
 * las tres primeras. El margen absurdo («-5418190.0%» con S/ 0.10 de ventas)
 * sale «—» con ⓘ que dice por qué.
 */
export default function CajaResumen({ data, periodo }: { data: CajaData; periodo: string }) {
  const ticketProm = data.ticketsTotal > 0 ? data.ingresos / data.ticketsTotal : null;
  const kpis: SectionKPI[] = [
    {
      label: "Entró", icon: ArrowDownToLine, value: soles(data.ingresos),
      sinDato: kpiSinDato(data.ingresos), sinDatoHint: `No cobraste nada ${periodo}.`,
      hint: "Ventas del mostrador y pedidos entregados del período.",
      ...variacion(data.dIngresos),
    },
    {
      label: "Salió", icon: ArrowUpFromLine, value: soles(data.egresos),
      sinDato: kpiSinDato(data.egresos), sinDatoHint: `No registraste compras ${periodo}.`,
      hint: "Compras a proveedores registradas en el período. Los gastos sueltos no se cuentan acá.",
      ...variacion(data.dEgresos), deltaPolarity: "inverse",
    },
    {
      label: "Quedó", icon: Wallet, value: soles(data.balance),
      tone: data.balance < 0 ? "warning" : "success",
      hint: "Lo que entró menos lo que salió en el período.",
      sub: data.balance < 0 ? "salió más que entró" : undefined,
    },
    {
      label: "Cobros", icon: Receipt, value: cantidad(data.ticketsTotal),
      sinDato: kpiSinDato(data.ticketsTotal), sinDatoHint: `Sin ventas cobradas ${periodo}.`,
      hint: "Ventas del mostrador más pedidos entregados.",
      sub: ticketProm !== null ? `ticket prom. ${soles(ticketProm)}` : undefined,
    },
    {
      label: "Utilidad", icon: TrendingUp, value: soles(data.utilidadNeta),
      tone: data.utilidadNeta < 0 ? "warning" : "success", sinDato: kpiSinDato(data.ingresos),
      sinDatoHint: `Sin ventas ${periodo}: no hay utilidad que calcular.`,
      hint: "Ventas − costo de lo vendido − compras. El detalle paso a paso está en el gráfico «De lo que vendiste a lo que te queda» (botón Gráficos).",
    },
    {
      label: "Margen", icon: Percent, value: porcentaje(data.margenNeto, 1),
      tone: data.margenNeto >= 15 ? "success" : data.margenNeto >= 5 ? "neutral" : "warning",
      sinDato: !margenLegible(data.margenNeto, data.ingresos),
      sinDatoHint:
        data.ingresos > 0
          ? "Lo que vendiste es muy poco frente a las compras: el % no se puede leer. Mira la utilidad en soles."
          : `Sin ventas ${periodo} para sacar un margen.`,
      hint: "Utilidad sobre lo que vendiste.",
    },
  ];
  return (
    <section
      data-dashboard-section=""
      aria-label="Caja del período"
      className="@container border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 sm:p-6"
    >
      <p className="mb-1.5 text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
        Caja · {periodo}
      </p>
      <CardTitle className="mb-5 text-[length:var(--ts-xl)] font-bold leading-tight tracking-tight text-[var(--text-primary)]">
        Lo que entró y salió
      </CardTitle>
      {/* 3 × 2: seis cifras en una fila no entran enteras a 1280 px. */}
      <div className="grid grid-cols-2 gap-3 @xl:grid-cols-3">
        {kpis.map((k) => (
          <KpiTile key={k.label} kpi={k} />
        ))}
      </div>
    </section>
  );
}
