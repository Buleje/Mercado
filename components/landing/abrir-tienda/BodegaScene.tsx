"use client";

/**
 * BodegaScene — Ilustración del trust block para `/abrir-tienda`.
 *
 * Reemplaza el card "Garantías Buleje" que era 4 líneas de texto. Ahora es
 * una bodega estilizada: toldo con franjas accent, vitrina con estantes y
 * productos abstractos, contador con tablet mostrando el dashboard en vivo,
 * cartel "ABIERTA · ONLINE", QR de Yape y 4 píldoras de garantía flotando
 * alrededor (S/ 0 comisión, 5 min setup, Yape · Plin, 24/7).
 *
 * Coherente con el lenguaje del PhoneMockup del home: glow accent multicapa,
 * pulso suave, ticker de eventos en vivo, todo en DOM + framer-motion para
 * mantenerse responsive y temable con tokens del DS.
 */

import { useEffect, useState } from "react";
import { motion as m, useReducedMotion } from "framer-motion";
import { Store, Smartphone, ShoppingBag, QrCode } from "@buleje/design-system/icons";

const EVENTS = [
  "Nuevo pedido · S/ 18.50",
  "Yape confirmado",
  "Repartidor en camino",
  "Cupón canjeado · -10%",
  "Producto agregado al carrito",
];

const TRUST_PILLS = [
  { value: "S/ 0",       label: "comisión" },
  { value: "5 min",      label: "setup" },
  { value: "Yape · Plin", label: "cobras como ya cobras" },
  { value: "24/7",       label: "soporte humano" },
];

const SHELF_PRODUCTS = [
  // Row 1
  ["#fbbf24", "#f97316", "#ef4444", "#a855f7"],
  // Row 2
  ["#0ea5e9", "#22c55e", "#84cc16", "#f59e0b"],
  // Row 3 (just 2 + a price tag visual)
  ["#06b6d4", "#84cc16"],
];

export default function BodegaScene() {
  const reducedMotion = useReducedMotion() ?? false;
  const [eventIdx, setEventIdx] = useState(0);
  const [sales, setSales] = useState(2840);
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    if (reducedMotion) return;
    const id = setInterval(() => {
      setEventIdx((i) => (i + 1) % EVENTS.length);
      setSales((s) => s + Math.floor(8 + Math.random() * 22));
      setPulse((p) => p + 1);
    }, 3400);
    return () => clearInterval(id);
  }, [reducedMotion]);

  return (
    <div
      aria-hidden
      className="relative w-full max-w-[560px] mx-auto h-[540px] sm:h-[580px] lg:h-[620px] [perspective:1400px]"
    >
      {/* Glow accent multicapa (igual lenguaje que PhoneMockup) */}
      <div className="absolute inset-x-2 top-8 bottom-4 rounded-[3rem] bg-linear-to-br from-[var(--accent)]/[0.22] via-amber-400/[0.10] to-transparent blur-3xl" />
      <div className="absolute inset-x-10 top-16 bottom-12 rounded-[2.5rem] bg-linear-to-tr from-[var(--accent)]/[0.18] to-transparent blur-2xl" />

      {/* Pulse de evento entrante */}
      {!reducedMotion && (
        <m.div
          key={pulse}
          initial={{ scale: 0.94, opacity: 0.55 }}
          animate={{ scale: 1.12, opacity: 0 }}
          transition={{ duration: 1.6, ease: "easeOut" }}
          className="absolute inset-x-6 top-12 bottom-8 rounded-[2.5rem] border-2 border-[var(--accent)]/25 pointer-events-none"
        />
      )}

      {/* ── Frame de la bodega ────────────────────────────────────────── */}
      <m.div
        initial={reducedMotion ? false : { y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="absolute inset-x-0 top-6 bottom-0 rounded-[2rem] overflow-hidden bg-[var(--surface-raised)] border border-[var(--rule-base)] shadow-[var(--shadow-xl)]"
      >
        {/* Toldo / awning con franjas teal */}
        <div className="relative h-12 flex">
          <div className="flex-1 bg-[var(--surface-raised)]" />
          <div className="flex-1 bg-[var(--accent)]" />
          <div className="flex-1 bg-[var(--surface-raised)]" />
          <div className="flex-1 bg-[var(--accent)]" />
          <div className="flex-1 bg-[var(--surface-raised)]" />
          <div className="flex-1 bg-[var(--accent)]" />
          <div className="flex-1 bg-[var(--surface-raised)]" />
          {/* Borde inferior del toldo en zig-zag */}
          <svg
            aria-hidden
            viewBox="0 0 100 6"
            preserveAspectRatio="none"
            className="absolute bottom-0 left-0 right-0 h-2 w-full text-[var(--surface-raised)]"
          >
            <polygon points="0,6 5,0 10,6 15,0 20,6 25,0 30,6 35,0 40,6 45,0 50,6 55,0 60,6 65,0 70,6 75,0 80,6 85,0 90,6 95,0 100,6" fill="currentColor" />
          </svg>
        </div>

        {/* Cartel "BULEJE BODEGA" + ABIERTA */}
        <div className="px-5 pt-3 pb-4 flex items-center justify-between gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)]">
          <div className="inline-flex items-center gap-2.5 min-w-0">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <Store className="h-4 w-4" strokeWidth={2.5} />
            </span>
            <div className="min-w-0">
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] leading-none">
                Bodega
              </p>
              <p className="text-sm font-extrabold tracking-tight text-[var(--text-primary)] leading-tight truncate">
                Don Lucho · Pucallpa
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 bg-[var(--data-success-50,var(--accent-soft))] text-[var(--data-success-700,var(--accent))] text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider shrink-0">
            <span aria-hidden className="relative inline-flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--data-success-500,var(--accent))] opacity-60 animate-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--data-success-600,var(--accent))]" />
            </span>
            Abierta · Online
          </span>
        </div>

        {/* Vitrina con estantes de productos */}
        <div className="px-5 pt-5 pb-4 bg-linear-to-b from-[var(--surface-raised)] to-[var(--surface-sunken)]/40">
          <div className="space-y-2.5">
            {SHELF_PRODUCTS.map((row, ri) => (
              <div key={ri} className="relative">
                {/* Estante */}
                <div
                  aria-hidden
                  className="absolute -bottom-1 left-0 right-0 h-[3px] rounded-full bg-[var(--rule-base)]"
                />
                <div className="flex items-end gap-2 h-12">
                  {row.map((color, pi) => (
                    <m.span
                      key={pi}
                      initial={reducedMotion ? false : { y: 4, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.2 + ri * 0.08 + pi * 0.04, duration: 0.45 }}
                      className="flex-1 rounded-md min-w-[34px]"
                      style={{
                        background: color,
                        height: ri === 2 ? `${28 + pi * 4}px` : `${30 + pi * 2}px`,
                        boxShadow: "inset 0 -3px 0 rgba(0,0,0,0.10), 0 1px 0 rgba(255,255,255,0.4)",
                      }}
                    />
                  ))}
                  {/* Etiqueta de precio en última fila */}
                  {ri === 2 && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--data-warning-500)] text-[var(--data-warning-50)] text-[length:var(--ts-2xs)] font-extrabold shadow-sm shrink-0">
                      -15%
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Contador con tablet — dashboard en vivo */}
        <div className="mt-2 mx-4 mb-4 rounded-2xl bg-[var(--text-primary)] text-[var(--surface-canvas)] p-4 shadow-[var(--shadow-lg)]">
          <div className="flex items-start justify-between gap-2 mb-2.5">
            <div className="inline-flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 backdrop-blur">
                <Smartphone className="h-3.5 w-3.5" strokeWidth={2.25} />
              </span>
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-white/60 leading-none">
                Panel Buleje
              </p>
            </div>
            <p className="text-[length:var(--ts-2xs)] font-bold text-white/50 tabular-nums">
              Hoy · 14:32
            </p>
          </div>
          <div className="flex items-baseline gap-3">
            <p className="text-3xl font-extrabold tracking-[-0.03em] tabular-nums leading-none">
              S/ <m.span
                key={sales}
                initial={reducedMotion ? false : { y: -4, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.4 }}
              >
                {sales.toLocaleString("es-PE")}
              </m.span>
            </p>
            <p className="text-[length:var(--ts-2xs)] font-bold text-white/60 leading-none">vendidos hoy</p>
          </div>
          {/* Mini stream de evento entrante */}
          <m.div
            key={eventIdx}
            initial={reducedMotion ? false : { x: -8, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-[var(--accent)] text-white px-3 py-1.5 text-[length:var(--ts-2xs)] font-extrabold"
          >
            <ShoppingBag className="h-3 w-3" strokeWidth={2.5} />
            {EVENTS[eventIdx]}
          </m.div>
        </div>
      </m.div>

      {/* ── QR card flotando (Yape) ───────────────────────────────────── */}
      <m.div
        initial={reducedMotion ? false : { x: 14, y: 8, opacity: 0 }}
        animate={{ x: 0, y: 0, opacity: 1 }}
        transition={{ delay: 0.45, duration: 0.5 }}
        className="absolute -right-2 sm:-right-6 top-32 sm:top-36 rounded-2xl bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] shadow-[var(--shadow-xl)] p-3 w-28 sm:w-32 rotate-[6deg]"
      >
        <div className="aspect-square rounded-lg bg-[var(--surface-canvas)] flex items-center justify-center">
          <QrCode className="h-12 w-12 sm:h-14 sm:w-14 text-[var(--text-primary)]" strokeWidth={1.5} />
        </div>
        <p className="mt-2 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] text-center">
          Yape · Plin
        </p>
      </m.div>

      {/* ── Trust pills flotando alrededor del frame ──────────────────── */}
      {TRUST_PILLS.map((p, i) => {
        // Posiciones alrededor de la escena
        const positions = [
          "left-0 sm:-left-4 top-44 sm:top-52 -rotate-[3deg]",   // S/ 0
          "left-2 sm:-left-2 bottom-20 sm:bottom-28 -rotate-[2deg]", // 5 min
          "right-4 sm:right-2 bottom-32 sm:bottom-40 rotate-[3deg]",  // Yape·Plin
          "right-0 sm:-right-4 bottom-6 sm:bottom-10 rotate-[2deg]",   // 24/7
        ];
        return (
          <m.div
            key={p.label}
            initial={reducedMotion ? false : { y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.55 + i * 0.12, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className={`absolute ${positions[i]} z-10 inline-flex items-center gap-2 px-3 py-2 rounded-2xl bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] shadow-[var(--shadow-lg)]`}
          >
            <span className="text-base sm:text-lg font-extrabold tabular-nums tracking-tight text-[var(--accent)] leading-none whitespace-nowrap">
              {p.value}
            </span>
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-secondary)] leading-tight max-w-[10ch]">
              {p.label}
            </span>
          </m.div>
        );
      })}
    </div>
  );
}
