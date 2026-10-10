"use client";

/**
 * Las cifras de Facturas y boletas en UN panel plegable (`useKpisPlegables`).
 * Antes: cuatro tarjetas siempre abiertas + «Resumen tributario del mes» con
 * boletas/facturas/notas, y un aviso rojo que repetía «Rechazados». Ahora cada
 * cifra sale una vez. Las notas de crédito/débito tienen su pestaña: acá es una
 * sola cuenta, sin repetir el detalle.
 */
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import { fmt, type StatsComprobantes } from "./tipos";

type Tono = "neutral" | "warning" | "danger";

interface Tarjeta {
  rotulo: string;
  valor: string;
  tono?: Tono;
  ayuda?: string;
}

export function useIndicadoresComprobantes(stats: StatsComprobantes, sinDatosAun: boolean) {
  const tarjetas: Tarjeta[] = [
    { rotulo: "Total emitido", valor: fmt(stats.totalEmitted), ayuda: "Suma de lo emitido sin contar los anulados." },
    { rotulo: "IGV acumulado", valor: fmt(stats.totalIGV) },
    { rotulo: "Pendientes SUNAT", valor: String(stats.pending), tono: stats.pending > 0 ? "warning" : "neutral", ayuda: "Las que todavía no volvieron con su constancia." },
    { rotulo: "Rechazados", valor: String(stats.rejected), tono: stats.rejected > 0 ? "danger" : "neutral", ayuda: "Las que SUNAT devolvió: corrígelas y reenvíalas antes de la declaración mensual." },
    { rotulo: "Boletas", valor: String(stats.boletas) },
    { rotulo: "Facturas", valor: String(stats.facturas) },
    { rotulo: "Notas de crédito y débito", valor: String(stats.notas), ayuda: "El detalle está en la pestaña Notas de crédito." },
  ];
  /* Los rechazados ya los dice el aviso rojo de arriba: el titular no los repite. */
  const resumen =
    stats.pending > 0
      ? `${stats.pending} pendiente${stats.pending === 1 ? "" : "s"} · ${fmt(stats.totalEmitted)}`
      : `Emitido ${fmt(stats.totalEmitted)}`;

  return useKpisPlegables({
    claveMemoria: "comprobantes-facturas",
    alto: "md",
    compactoEnMovil: true,
    anchoFijo: true,
    sinDatosAun,
    resumen,
    tarjetas: tarjetas.map(({ rotulo, valor, tono = "neutral", ayuda }) => (
      <div key={rotulo} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
        <div className="mb-1 flex items-center gap-1.5">
          <span className="text-sm font-semibold text-[var(--text-secondary)]">{rotulo}</span>
          {ayuda && <InfoTip what={ayuda} />}
        </div>
        <p
          className={cn(
            "text-lg font-extrabold tabular-nums",
            tono === "warning" ? "text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]"
              : tono === "danger" ? "text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]"
              : "text-[var(--text-primary)]",
          )}
        >
          {valor}
        </p>
      </div>
    )),
  });
}
