"use client";

import { useMemo } from "react";
import { Calendar, TrendingUp, Gift, Sun, Snowflake, Heart } from "@buleje/design-system/icons";

type Season = {
  id: string;
  label: string;
  date: string;
  daysAway: number;
  icon: typeof Calendar;
  accent: string;
  topCategories: string[];
  tips: string[];
  productsToStock: string[];
};

const SEASONS_2026: Array<Omit<Season, "daysAway">> = [
  {
    id: "madre",
    label: "Día de la Madre",
    date: "2026-05-10",
    icon: Heart,
    accent: "#db2777",
    topCategories: ["Chocolates", "Bebidas", "Snacks", "Galletas"],
    tips: [
      "Los chocolates Sublime se duplican 1 semana antes",
      "Stockea bebidas para reuniones familiares (gaseosa 2L+)",
      "Promociona kits 'Detalle para mamá' (chocolate + galleta + flor)",
    ],
    productsToStock: ["Sublime", "Donofrio", "Inca Kola 2L", "Rosas (si vendes flores)"],
  },
  {
    id: "padre",
    label: "Día del Padre",
    date: "2026-06-21",
    icon: Gift,
    accent: "#0891b2",
    topCategories: ["Cervezas", "Snacks salados", "Carnes embutidos"],
    tips: [
      "Cerveza sube 80% el sábado anterior",
      "Chicharrón y embutidos para parrilla familiar",
      "Combo cerveza+canchita en oferta",
    ],
    productsToStock: ["Pilsen", "Cusqueña", "Maní", "Canchita", "Salchichas"],
  },
  {
    id: "san-juan",
    label: "Fiesta de San Juan (Pucallpa)",
    date: "2026-06-24",
    icon: Sun,
    accent: "#ff6b5b",
    topCategories: ["Hojas de bijao", "Arroz", "Bebidas", "Embutidos"],
    tips: [
      "Pico altísimo en hojas de bijao para juane (pedidos 3 días antes)",
      "Arroz, gallina y huevos suben 60%",
      "Cerveza y chicha morada para celebración familiar",
    ],
    productsToStock: ["Hojas de bijao", "Arroz Costeño 5kg", "Aceitunas", "Huevos", "Cerveza"],
  },
  {
    id: "patrias",
    label: "Fiestas Patrias",
    date: "2026-07-28",
    icon: Sun,
    accent: "#dc2626",
    topCategories: ["Cervezas", "Snacks", "Carnes", "Pisco"],
    tips: [
      "Pico de cervezas 3 días antes — duplica stock",
      "Combos parrilla (carne + pan + bebida) ganan tracción",
      "Pisco y bebidas para chilcanos en oferta",
    ],
    productsToStock: ["Cusqueña", "Pilsen", "Pisco", "Pan", "Carbón"],
  },
  {
    id: "navidad",
    label: "Navidad",
    date: "2026-12-25",
    icon: Snowflake,
    accent: "#0891b2",
    topCategories: ["Panetón", "Chocolate caliente", "Champagne", "Pavo"],
    tips: [
      "Panetón D'onofrio sube 5x desde la 1era semana de diciembre",
      "Chocolate Donofrio + leche para chocolatada empresarial",
      "Combo cena navideña (panetón + chocolate + sidra)",
    ],
    productsToStock: ["Panetón", "Chocolate Donofrio", "Sidra", "Champagne"],
  },
  {
    id: "ano-nuevo",
    label: "Año Nuevo",
    date: "2026-12-31",
    icon: Calendar,
    accent: "#a855f7",
    topCategories: ["Champagne", "Uvas", "Lentejas", "Bebidas"],
    tips: [
      "Champagne y sidra suben 4x el 30-31",
      "Uvas para los 12 deseos — pedido fijo familiar",
      "Lentejas para abundancia (tradición)",
    ],
    productsToStock: ["Sidra", "Champagne", "Uvas", "Lentejas"],
  },
];

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr).getTime();
  return Math.ceil((target - Date.now()) / 86_400_000);
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("es-PE", { day: "numeric", month: "long" });
}

export default function TabEstrategias() {
  const seasons = useMemo<Season[]>(() => {
    return SEASONS_2026
      .map((s) => ({ ...s, daysAway: daysUntil(s.date) }))
      .filter((s) => s.daysAway >= -3)
      .sort((a, b) => a.daysAway - b.daysAway);
  }, []);

  const next = seasons[0];

  return (
    <div className="space-y-5">
      <div>
        <p className="text-base font-extrabold text-[var(--text-primary)]">Calendario comercial</p>
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
          Próximas fechas con pico de demanda en Pucallpa
        </p>
      </div>

      {/* Próxima fecha — destacada */}
      {next && (
        <section
          className="rounded-2xl border-2 p-5 sm:p-6"
          style={{
            borderColor: `color-mix(in oklab, ${next.accent} 30%, transparent)`,
            backgroundColor: `color-mix(in oklab, ${next.accent} 6%, white)`,
          }}
        >
          <div className="flex items-start gap-4">
            <span
              className="inline-flex h-12 w-12 items-center justify-center rounded-xl shrink-0"
              style={{ backgroundColor: next.accent, color: "white" }}
            >
              <next.icon className="h-6 w-6" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <p className="text-lg sm:text-xl font-extrabold text-[var(--text-primary)] leading-tight">
                  {next.label}
                </p>
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: next.accent }}>
                  {next.daysAway < 0
                    ? `Hace ${Math.abs(next.daysAway)} días`
                    : next.daysAway === 0
                      ? "HOY"
                      : `En ${next.daysAway} días · ${fmtDate(next.date)}`}
                </p>
              </div>
              <p className="text-sm font-medium text-[var(--text-secondary)] mt-1">
                Top categorías:{" "}
                <span className="font-bold text-[var(--text-primary)]">
                  {next.topCategories.join(" · ")}
                </span>
              </p>
            </div>
          </div>

          {/* Tips */}
          <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl bg-white dark:bg-[var(--color-card)] border border-[var(--rule-soft)] p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2 flex items-center gap-1.5">
                <TrendingUp className="h-3 w-3" />
                Estrategia de venta
              </p>
              <ul className="space-y-2">
                {next.tips.map((tip, i) => (
                  <li key={i} className="text-sm font-medium text-[var(--text-primary)] flex gap-2">
                    <span className="text-[var(--text-tertiary)] shrink-0">·</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl bg-white dark:bg-[var(--color-card)] border border-[var(--rule-soft)] p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2 flex items-center gap-1.5">
                <Calendar className="h-3 w-3" />
                Productos a stockear
              </p>
              <div className="flex flex-wrap gap-1.5">
                {next.productsToStock.map((p) => (
                  <span
                    key={p}
                    className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-bold"
                    style={{
                      backgroundColor: `color-mix(in oklab, ${next.accent} 12%, white)`,
                      color: next.accent,
                    }}
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Resto del calendario */}
      {seasons.length > 1 && (
        <section>
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-3">
            Próximas {seasons.length - 1} fechas
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {seasons.slice(1).map((s) => (
              <article
                key={s.id}
                className="rounded-xl border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] p-4"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
                      style={{
                        backgroundColor: `color-mix(in oklab, ${s.accent} 12%, white)`,
                        color: s.accent,
                      }}
                    >
                      <s.icon className="h-4 w-4" />
                    </span>
                    <p className="text-sm font-extrabold text-[var(--text-primary)] leading-tight">
                      {s.label}
                    </p>
                  </div>
                  <p className="text-xs font-bold uppercase tracking-wider tabular-nums text-[var(--text-tertiary)] shrink-0">
                    {s.daysAway} d
                  </p>
                </div>
                <p className="text-xs font-medium text-[var(--text-secondary)] line-clamp-2">
                  {s.tips[0]}
                </p>
                <p className="text-xs font-medium text-[var(--text-tertiary)] mt-2">
                  {fmtDate(s.date)}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
