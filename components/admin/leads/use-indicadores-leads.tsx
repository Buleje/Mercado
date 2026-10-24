"use client";

/**
 * Las cifras de Interesados con el patrón del panel (`useKpisPlegables`): el
 * botón va en la fila del título y, plegado, lleva el titular adentro.
 * Las seis cifras son las del servidor (`/api/admin/leads/funnel`, 90 días):
 * acá sólo se ordenan y se ponen en castellano. «Por canal» y «Por tipo de
 * negocio» eran dos cajas de media pantalla con un título cada una.
 */
import type { ComponentType, ReactNode } from "react";
import { StatCard } from "@buleje/design-system";
import { CheckCircle, Megaphone, Store, TrendingUp, UserPlus, Activity } from "@buleje/design-system/icons";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { llegoEl, rotuloCanal, rotuloTipo, type FunnelStats } from "./tipos";

type Icono = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

function Tarjeta({ icono: I, rotulo, ayuda, children }: { icono: Icono; rotulo: string; ayuda?: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
      <div className="mb-1 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
          <I className="h-4 w-4" aria-hidden />
        </span>
        <span className="text-sm font-semibold text-[var(--text-secondary)]">{rotulo}</span>
        {ayuda && <InfoTip what={ayuda} />}
      </div>
      {children}
    </div>
  );
}

/** Las 3 más altas de un reparto, «Anuncio de Facebook 4 · Recomendado 2». */
function Reparto({ cuentas, rotulo }: { cuentas: Record<string, number>; rotulo: (k: string) => string }) {
  const filas = Object.entries(cuentas).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (filas.length === 0) return <p className="text-sm text-[var(--text-secondary)]">Sin datos todavía</p>;
  return (
    <ul className="space-y-0.5 text-sm">
      {filas.map(([k, n]) => (
        <li key={k} className="flex justify-between gap-2">
          <span className="truncate text-[var(--text-primary)]">{rotulo(k)}</span>
          <span className="font-semibold tabular-nums text-[var(--text-primary)]">{n}</span>
        </li>
      ))}
    </ul>
  );
}

const VACIO: FunnelStats = { total: 0, last7d: 0, last30d: 0, conversionRate: 0, bySource: {}, byBusinessType: {}, byCity: {}, byStatus: {} };

export function useIndicadoresLeads(stats: FunnelStats | null, cargando: boolean) {
  /* Sin cifras todavía, el panel pinta esqueletos (`sinDatosAun`): las tarjetas en cero no se ven. */
  const s = stats ?? VACIO;
  const tarjetas = [
        <StatCard key="total" density="compact" icon={UserPlus} label="En 90 días" value={String(s.total)} subValue={s.newestLeadAt ? `El último, el ${llegoEl(s.newestLeadAt)}` : undefined} />,
        <StatCard key="7" density="compact" icon={Activity} label="Últimos 7 días" value={String(s.last7d)} />,
        <StatCard key="30" density="compact" icon={TrendingUp} label="Últimos 30 días" value={String(s.last30d)} />,
        <StatCard
          key="avanzaron"
          density="compact"
          icon={CheckCircle}
          label="Avanzaron"
          value={`${s.conversionRate} %`}
          info={<InfoTip what="De los interesados de los últimos 90 días, cuántos ya vieron la demo, se registraron o pagan." />}
        />,
        <Tarjeta key="canal" icono={Megaphone} rotulo="Por dónde llegan">
          <Reparto cuentas={s.bySource} rotulo={rotuloCanal} />
        </Tarjeta>,
        <Tarjeta key="tipo" icono={Store} rotulo="Qué negocios son">
          <Reparto cuentas={s.byBusinessType} rotulo={rotuloTipo} />
        </Tarjeta>,
      ];

  return useKpisPlegables({
    claveMemoria: "clientes-interesados",
    alto: "md",
    compactoEnMovil: true,
    sinDatosAun: cargando && !stats,
    resumen: `${s.total} en 90 días · ${s.conversionRate} %`,
    tarjetas,
  });
}
