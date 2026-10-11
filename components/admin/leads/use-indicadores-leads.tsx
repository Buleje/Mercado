"use client";

/**
 * Las cifras de Interesados con el patrón del panel (`useKpisPlegables`): el
 * botón va en la fila del título y, plegado, lleva el titular adentro.
 * Las seis cifras son las del servidor (`/api/admin/leads/funnel`, 90 días):
 * acá sólo se ordenan y se ponen en castellano. «Por canal» y «Por tipo de
 * negocio» eran dos cajas de media pantalla con un título cada una.
 */
import type { ComponentType, ReactNode } from "react";
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

const Cifra = ({ valor, extra }: { valor: string; extra?: string }) => (
  <>
    <p className="truncate text-lg font-extrabold tabular-nums text-[var(--text-primary)]">{valor}</p>
    {extra && <p className="truncate text-sm text-[var(--text-secondary)]">{extra}</p>}
  </>
);

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
        <Tarjeta key="total" icono={UserPlus} rotulo="En 90 días">
          <Cifra valor={String(s.total)} extra={s.newestLeadAt ? `El último, el ${llegoEl(s.newestLeadAt)}` : undefined} />
        </Tarjeta>,
        <Tarjeta key="7" icono={Activity} rotulo="Últimos 7 días">
          <Cifra valor={String(s.last7d)} />
        </Tarjeta>,
        <Tarjeta key="30" icono={TrendingUp} rotulo="Últimos 30 días">
          <Cifra valor={String(s.last30d)} />
        </Tarjeta>,
        <Tarjeta key="avanzaron" icono={CheckCircle} rotulo="Avanzaron" ayuda="De los interesados de los últimos 90 días, cuántos ya vieron la demo, se registraron o pagan.">
          <Cifra valor={`${s.conversionRate} %`} />
        </Tarjeta>,
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
