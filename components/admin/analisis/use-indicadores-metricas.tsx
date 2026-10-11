"use client";

/**
 * Indicadores de Análisis › Métricas: las seis cifras de `/api/analytics/kpis-v2`
 * en el panel plegable del patrón (`useKpisPlegables`), UNA vez para las cuatro
 * secciones. Arranca cerrado: en Métricas lo central son los gráficos.
 *
 * Antes había una tira por sección. La de Resumen leía bien; las de Ventas,
 * Productos y Clientes hacían `Number(d.ingresosHoy)` sobre un objeto
 * (`{ valor, cambio }`) y pedían claves que el endpoint no manda
 * (`ordersToday`, `peakHour`, `skuCount`, `lowStockCount`, `totalClientes`,
 * `retentionRate`): salían en 0 o «--» con datos cargados.
 */

import { useEffect, useState, type ReactNode } from "react";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { formatCurrency } from "@/lib/format";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";

/** Lo que manda `/api/analytics/kpis-v2` (app/api/analytics/kpis-v2/route.ts:195). */
interface KpisV2 {
  ingresosHoy?: { valor: number; cambio: number };
  ticketPromedio?: { valor: number; cambio: number };
  margenOperativo?: { valor: number; estado: "verde" | "amarillo" | "rojo" };
  clientesActivos?: { valor: number; cambio: number };
  fiadoPendiente?: { valor: number; totalClientes: number; vencidos: number };
  rotacionInventario?: { valor: number; subtexto: string };
}

interface Tarjeta {
  rotulo: string;
  valor: string;
  /** La línea chica de abajo: contra qué se compara o de dónde sale. */
  nota?: string;
  /** `+` / `−` cuando la cifra trae su cambio. */
  cambio?: number;
  ayuda?: ReactNode;
}

const soles = (n: number) => formatCurrency(n, { decimals: 0 });

function tarjetasDe(k: KpisV2): Tarjeta[] {
  return [
    { rotulo: "Ventas de hoy", valor: soles(k.ingresosHoy?.valor ?? 0), cambio: k.ingresosHoy?.cambio, nota: "vs. el mismo día de la semana pasada" },
    { rotulo: "Ticket promedio", valor: formatCurrency(k.ticketPromedio?.valor ?? 0), cambio: k.ticketPromedio?.cambio, nota: "30 días, vs. los 30 anteriores" },
    { rotulo: "Margen", valor: `${(k.margenOperativo?.valor ?? 0).toFixed(1)} %`, nota: "30 días", ayuda: "Lo vendido menos su costo, sobre lo vendido. Un producto sin costo cargado cuenta como si costara 0." },
    { rotulo: "Clientes", valor: String(k.clientesActivos?.valor ?? 0), cambio: k.clientesActivos?.cambio, nota: "con celular, 30 días" },
    { rotulo: "Fiado por cobrar", valor: soles(k.fiadoPendiente?.valor ?? 0), nota: `${k.fiadoPendiente?.totalClientes ?? 0} cuentas · ${k.fiadoPendiente?.vencidos ?? 0} vencidas` },
    { rotulo: "Rotación del stock", valor: `${(k.rotacionInventario?.valor ?? 0).toFixed(1)} veces`, nota: "al año, al ritmo de 30 días", ayuda: k.rotacionInventario?.subtexto || "Cuántas veces al año vendes lo que tienes en el almacén, al costo." },
  ];
}

export function useIndicadoresMetricas(vuelta: number) {
  const [kpis, setKpis] = useState<KpisV2 | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    fetch("/api/analytics/kpis-v2", { credentials: "include", signal: ac.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: KpisV2) => setKpis(d))
      .catch((err) => {
        if ((err as Error).name === "AbortError") return;
        logger.warn("[Métricas] indicadores no cargaron", { error: String(err).slice(0, 120) });
        setKpis((prev) => prev ?? {});
      });
    return () => ac.abort();
  }, [vuelta]);

  const tarjetas = tarjetasDe(kpis ?? {});
  return useKpisPlegables({
    claveMemoria: "analisis-metricas",
    alto: "md",
    compactoEnMovil: true,
    sinDatosAun: kpis === null,
    resumen: `Hoy ${tarjetas[0].valor}`,
    tarjetas: tarjetas.map((t) => (
      <div key={t.rotulo} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
        <div className="mb-1 flex items-center gap-1.5">
          <span className="text-sm font-semibold text-[var(--text-secondary)]">{t.rotulo}</span>
          {t.ayuda && <InfoTip what={t.ayuda} />}
        </div>
        <p className="text-lg font-extrabold tabular-nums text-[var(--text-primary)]">{t.valor}</p>
        <p className="text-xs text-[var(--text-tertiary)]">
          {t.cambio != null && t.cambio !== 0 && (
            <span className={cn("mr-1 font-bold", t.cambio > 0 ? "text-[var(--data-success-ink)]" : "text-[var(--data-error-ink)]")}>
              {t.cambio > 0 ? "+" : "−"}{Math.abs(t.cambio).toFixed(0)} %
            </span>
          )}
          {t.nota}
        </p>
      </div>
    )),
  });
}
