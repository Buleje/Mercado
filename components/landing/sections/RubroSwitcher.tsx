"use client";

/**
 * RubroSwitcher — "el sistema que habla el idioma de tu rubro".
 *
 * Concepto único de /negocios: Buleje no es un POS genérico — el mismo panel
 * se RELABELA y reordena según el rubro (motor de verticales, ADR-100). Acá lo
 * demostramos en vivo: elegís un rubro y el panel de la derecha cambia su
 * título, sus módulos destacados y su vocabulario ("Productos" → "Carta",
 * "Cliente" → "Paciente"). Datos derivados de lib/verticals/registry.ts.
 *
 * Client component (interactivo). Tokens del DS, sin hex hardcodeados.
 */

import { useState } from "react";
import {
  Store,
  UtensilsCrossed,
  Pill,
  Wrench,
  Croissant,
  TreePine,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

type Rubro = {
  id: string;
  icon: typeof Store;
  label: string;
  panelTitle: string;
  tagline: string;
  modules: string[];
  vocab: { from: string; to: string }[];
  vocabNote?: string;
};

const RUBROS: Rubro[] = [
  {
    id: "bodega",
    icon: Store,
    label: "Bodega / Minimarket",
    panelTitle: "Mi Bodega",
    tagline: "Venta diaria, fiados del barrio y delivery — el corazón de Buleje.",
    modules: ["Caja del día", "Inventario", "Fiados", "Marketplace", "Pedidos"],
    vocab: [],
    vocabNote: "Todo se llama como en tu bodega de siempre. Sin tecnicismos raros.",
  },
  {
    id: "restaurante",
    icon: UtensilsCrossed,
    label: "Restaurante / Pollería",
    panelTitle: "Mi Restaurante",
    tagline: "Tus platos, listos para pedir, cocinar y repartir.",
    modules: ["Carta", "Comandas", "Cocina (KDS)", "Mesas", "Delivery"],
    vocab: [
      { from: "Productos", to: "Carta" },
      { from: "Inventario", to: "Stock cocina" },
    ],
  },
  {
    id: "farmacia",
    icon: Pill,
    label: "Farmacia / Botica",
    panelTitle: "Mi Farmacia",
    tagline: "Control estricto de vencimientos y lotes, paciente por paciente.",
    modules: ["Vencimientos", "Lotes", "Recetas médicas", "Caja", "Auditoría"],
    vocab: [
      { from: "Cliente", to: "Paciente" },
      { from: "Producto", to: "Medicamento" },
    ],
  },
  {
    id: "ferreteria",
    icon: Wrench,
    label: "Ferretería",
    panelTitle: "Mi Ferretería",
    tagline: "Catálogo enorme, cotizaciones al toque y fiado al maestro de obra.",
    modules: ["Catálogo", "Cotizaciones", "Fiados", "Compras", "Guías"],
    vocab: [],
    vocabNote: "Miles de SKUs ordenados por rubro. Cada cosa, por su nombre de ferretería.",
  },
  {
    id: "panaderia",
    icon: Croissant,
    label: "Panadería / Pastelería",
    panelTitle: "Mi Panadería",
    tagline: "Recetas, producción por lote y venta directa sin perder la cuenta.",
    modules: ["Recetas", "Producción por lote", "Caja", "Merma horneo", "Pedidos"],
    vocab: [{ from: "Producto", to: "Producto horneado" }],
  },
  {
    id: "madereria",
    icon: TreePine,
    label: "Maderería / Construcción",
    panelTitle: "Mi Maderería",
    tagline: "Cotizaciones B2B, guías de remisión y cubicaje, todo en regla.",
    modules: ["Cotizaciones B2B", "Guías de remisión", "Cubicaje", "Contratos", "Compras"],
    vocab: [
      { from: "Producto", to: "Pieza" },
      { from: "Ventas", to: "Ventas B2B" },
    ],
  },
];

export default function RubroSwitcher() {
  const [active, setActive] = useState(1); // restaurante: muestra el morph al toque
  const r = RUBROS[active];
  const Icon = r.icon;

  return (
    <div className="grid lg:grid-cols-[minmax(0,300px)_1fr] gap-5 lg:gap-10 items-start">
      <style>{`@keyframes rubroIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}`}</style>

      {/* ── Selector de rubros (tabs) ── */}
      <div
        role="tablist"
        aria-label="Elige tu rubro"
        className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 -mx-4 px-4 lg:mx-0 lg:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {RUBROS.map((item, i) => {
          const ItemIcon = item.icon;
          const selected = i === active;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActive(i)}
              className={cn(
                "group flex shrink-0 items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left transition-all lg:shrink",
                selected
                  ? "border-[var(--accent)] bg-[var(--accent-soft)]/40 shadow-[var(--shadow-sm)]"
                  : "border-[var(--rule-soft)] bg-[var(--surface-raised)] hover:border-[var(--accent)]/40",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors",
                  selected
                    ? "bg-[var(--accent)] text-white"
                    : "bg-[var(--accent-soft)] text-[var(--accent)] group-hover:bg-[var(--accent)] group-hover:text-white",
                )}
              >
                <ItemIcon className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <span
                className={cn(
                  "text-sm font-extrabold tracking-[-0.01em] leading-tight whitespace-nowrap lg:whitespace-normal",
                  selected ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]",
                )}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Preview: mini-panel que se relabela según el rubro ── */}
      <div
        key={r.id}
        style={{ animation: "rubroIn .4s cubic-bezier(.22,1,.36,1)" }}
        className="relative overflow-hidden rounded-3xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-lg)]"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-20 h-60 w-60 rounded-full bg-[var(--accent)]/10 blur-3xl"
        />

        {/* Top bar del panel */}
        <div className="relative flex items-center gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-4">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent)] text-white shadow-[var(--shadow-sm)]">
            <Icon className="h-6 w-6" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              Tu panel Buleje
            </p>
            <p className="text-lg font-extrabold tracking-[-0.01em] text-[var(--text-primary)] leading-tight">
              {r.panelTitle}
            </p>
          </div>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[var(--data-success-500)]/15 px-2.5 py-1">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--data-success-500)]" />
            <span className="text-[length:var(--ts-2xs)] font-extrabold text-[var(--data-success-600,#059669)]">
              En línea
            </span>
          </span>
        </div>

        <div className="relative p-5 sm:p-6">
          {/* Módulos destacados (como un sidebar) */}
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-3">
            Módulos destacados para tu rubro
          </p>
          <div className="flex flex-wrap gap-2">
            {r.modules.map((m, i) => (
              <span
                key={m}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[length:var(--ts-xs)] font-extrabold transition-colors",
                  i === 0
                    ? "bg-[var(--accent)] text-white"
                    : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    i === 0 ? "bg-white" : "bg-[var(--accent)]",
                  )}
                />
                {m}
              </span>
            ))}
          </div>

          {/* Vocabulario que se adapta — el "habla tu idioma" */}
          <div className="mt-6 rounded-2xl border border-dashed border-[var(--accent)]/35 bg-[var(--accent-soft)]/25 p-4">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-3">
              Habla el idioma de tu negocio
            </p>
            {r.vocab.length > 0 ? (
              <ul className="flex flex-wrap gap-2.5">
                {r.vocab.map((v) => (
                  <li
                    key={v.from}
                    className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-raised)] border border-[var(--rule-soft)] px-3 py-1.5"
                  >
                    <span className="text-[length:var(--ts-xs)] font-semibold text-[var(--text-tertiary)] line-through">
                      {v.from}
                    </span>
                    <span aria-hidden className="text-[var(--accent)] font-black">
                      →
                    </span>
                    <span className="text-[length:var(--ts-xs)] font-extrabold text-[var(--text-primary)]">
                      {v.to}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--text-secondary)] leading-snug">
                {r.vocabNote}
              </p>
            )}
          </div>

          {/* Tagline del rubro */}
          <p className="mt-5 text-base font-medium text-[var(--text-secondary)] leading-relaxed">
            {r.tagline}
          </p>
        </div>
      </div>
    </div>
  );
}
