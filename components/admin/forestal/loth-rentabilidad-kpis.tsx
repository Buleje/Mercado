"use client";

/**
 * Los cinco indicadores de «Rentabilidad y rendimiento», plegables y
 * recordados (`ctp-kpis-v2:loth-rentabilidad`). Plegado, el botón dice el
 * margen y el rendimiento en una línea. Cada tarjeta dice contra qué se
 * compara en su segunda línea, con su ⓘ.
 */

import type { ReactNode } from "react";
import { Calculator, Coins, Gauge, TrendingDown, TrendingUp, Wallet } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatCurrency } from "@/lib/format";
import CtpKpi from "./CtpKpi";
import { useKpisPlegables } from "./kpis-plegables";
import type { Analytics } from "./loth-rentabilidad-datos";

const soles = (n: number) => formatCurrency(n);

type Tono = "success" | "warning" | "error";
const RELLENO: Record<Tono, string> = {
  success: "bg-[var(--data-success-500)]",
  warning: "bg-[var(--data-warning-500)]",
  error: "bg-[var(--data-error-500)]",
};

/** Margen ≥25 % verde, ≥0 ámbar, <0 rojo. */
const tonoDelMargen = (pct: number): Tono => (pct >= 25 ? "success" : pct >= 0 ? "warning" : "error");
/** Rendimiento de trozado: verde sobre el 60 % esperado, ámbar por debajo. */
const tonoDelRendimiento = (pct: number): Tono => (pct >= 60 ? "success" : "warning");

/**
 * La segunda línea de la tarjeta, con su ⓘ y, si se pide, la barra de referencia.
 * El ámbar va en texto `-ink` y no en el número: el `emphasis="warning"` del
 * StatCard pinta el valor a 2,03:1 en claro (axe 29-09).
 */
function Linea({ children, titulo, what, affects, example, alerta = false, barra }: {
  children: ReactNode; titulo: string; what: string; affects: string; example: string;
  alerta?: boolean;
  /** Barra de 0 a 100 bajo la línea, con el color del tono. */
  barra?: { pct: number; tono: Tono };
}) {
  return (
    <span className="block">
      <span className="inline-flex flex-wrap items-center gap-x-1">
        <span className={alerta ? "font-semibold text-[var(--data-warning-ink)]" : undefined}>{children}</span>
        <InfoTip title={titulo} what={what} affects={affects} example={example} side="bottom" />
      </span>
      {barra && (
        <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]" aria-hidden>
          <span className={`block h-full rounded-full ${RELLENO[barra.tono]}`} style={{ width: `${Math.min(100, Math.max(0, barra.pct))}%` }} />
        </span>
      )}
    </span>
  );
}

export function useKpisRentabilidad(d: Analytics | null, cargando: boolean, error: string | null) {
  const c = d?.costeo ?? null;
  const rend = d?.aprovechamiento.rendimientoGlobalPct ?? null;
  const margenPct = c?.margenPctTotal ?? null;
  const resumen = !d
    ? cargando
      ? "Calculando…"
      : "Sin datos"
    : `margen ${c ? `${soles(c.margenTotal)} · ${margenPct}%` : "—"} · rendimiento ${rend}%`;

  const tarjetas = !d
    ? Array.from({ length: 5 }, (_, i) => <span key={i} />)
    : [
        <CtpKpi
          key="margen"
          label="Margen del aprovechamiento"
          value={c ? soles(c.margenTotal) : "—"}
          icon={c && c.margenTotal < 0 ? TrendingDown : TrendingUp}
          emphasis={!c ? "neutral" : tonoDelMargen(c.margenPctTotal) === "success" ? "success" : tonoDelMargen(c.margenPctTotal) === "error" ? "error" : "neutral"}
          subValue={
            <Linea
              alerta={!!c && tonoDelMargen(c.margenPctTotal) === "warning"}
              barra={c ? { pct: Math.max(0, c.margenPctTotal), tono: tonoDelMargen(c.margenPctTotal) } : undefined}
              titulo="Margen del aprovechamiento"
              what="Ingreso menos costo de lo que ya se movilizó, con los precios y costos del plan."
              affects="Es UNA sola cifra para toda la vista: la tabla por especie suma esto."
              example="Ingreso S/ 1 242 y costo S/ 780: margen S/ 462 (37 %)."
            >
              {c ? `${margenPct}% sobre el ingreso` : "carga precios y costos para verlo"}
            </Linea>
          }
        />,
        <CtpKpi
          key="ingreso"
          label="Ingreso (movilizado)"
          value={c ? soles(c.ingresoTotal) : "—"}
          icon={Wallet}
          emphasis="neutral"
          subValue={
            <Linea
              titulo="Ingreso"
              what="Precio de venta del plan × m³ que salieron con guía."
              affects="No cuenta lo talado ni lo trozado: sólo lo movilizado."
              example="El precio es el estimado del plan; el sistema aún no registra el de cada venta."
            >
              ventas estimadas
            </Linea>
          }
        />,
        <CtpKpi
          key="costo"
          label="Costo total"
          value={c ? soles(c.costoTotal) : "—"}
          icon={Calculator}
          emphasis="neutral"
          subValue={
            <Linea
              titulo="Costo total"
              what="Derecho VEN + extracción + transformación + flete, por m³ movilizado."
              affects="No incluye el pago por derecho de aprovechamiento de área (0.01 % UIT × ha), que es fijo del plan."
              example="Costo de S/ 282 por m³ sobre 2.76 m³: S/ 780."
            >
              {c ? `operativo ${soles(c.costoOperativoM3)}/m³` : "sin costeo"}
            </Linea>
          }
        />,
        <CtpKpi
          key="valor"
          label="Valor movilizado"
          value={formatCurrency(d.balance?.valorTotal ?? 0)}
          icon={Coins}
          emphasis="neutral"
          subValue={
            <Linea
              titulo="Valor movilizado"
              what="Lo que vale, al precio del plan, la madera que ya salió con guía."
              affects="Sobre este valor se calcula el derecho de aprovechamiento a pagar."
              example="Derecho VEN × movilizado + el pago fijo por área."
            >
              derecho a pagar {formatCurrency(d.balance?.pagoDerechoTotal ?? 0)}
            </Linea>
          }
        />,
        <CtpKpi
          key="rend"
          label="Rendimiento de trozado"
          value={`${rend}%`}
          icon={Gauge}
          emphasis={rend != null && tonoDelRendimiento(rend) === "success" ? "success" : "neutral"}
          subValue={
            <Linea
              alerta={rend != null && tonoDelRendimiento(rend) === "warning"}
              barra={rend != null ? { pct: rend, tono: tonoDelRendimiento(rend) } : undefined}
              titulo="Rendimiento de trozado"
              what="Cuánto del árbol tumbado llegó a troza."
              affects="Por debajo del 60 % que se espera, se pierde madera entre la tala y el trozado."
              example="Talaste 5.0 m³ y trozaste 4.9 m³: rinde 97.7 %."
            >
              {rend != null && rend >= 60 ? "sobre el 60 % esperado" : "bajo el 60 % esperado"}
            </Linea>
          }
        />,
      ];

  return useKpisPlegables({ claveMemoria: "loth-rentabilidad", tarjetas, resumen, sinDatosAun: !d && (cargando || error != null), alto: "sm" });
}
