"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import {
  BookOpen, AlertTriangle, DollarSign, Clock,
  Smartphone, Bell, Shield, Calculator,
  ArrowLeftRight, UserPlus, Package, Rocket,
} from "@buleje/design-system/icons";
import type { LucideIcon } from "lucide-react";

// ---------------------------------------------------------------------------
// Datos
// ---------------------------------------------------------------------------

interface PanelItem { Icon: LucideIcon; text: string }

const beforeItems: PanelItem[] = [
  { Icon: BookOpen,      text: "Anotas ventas en un cuaderno que se pierde" },
  { Icon: AlertTriangle, text: "No sabes qué producto se agotó hasta que el cliente pregunta" },
  { Icon: DollarSign,    text: "Fías sin control y pierdes S/ 200+ al mes" },
  { Icon: Clock,         text: 'Cierras caja "de memoria" y nunca cuadra' },
];

const afterItems: PanelItem[] = [
  { Icon: Smartphone, text: "Todo digital desde tu celular, respaldado en la nube" },
  { Icon: Bell,       text: "Alerta automática antes de que se agote" },
  { Icon: Shield,     text: "Semáforo verde/rojo para fiar con control" },
  { Icon: Calculator, text: "Cierre de caja automático, siempre cuadra" },
];

const steps = [
  { num: 1, Icon: UserPlus, label: "Regístrate gratis",    sub: "2 min" },
  { num: 2, Icon: Package,  label: "Carga tu inventario",  sub: "foto o Excel" },
  { num: 3, Icon: Rocket,   label: "Empieza a vender",     sub: "POS + WhatsApp" },
];

// ---------------------------------------------------------------------------
// Variantes Framer Motion (eslint: any requerido por Framer custom variants)
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AV = any;

const vLeft: AV = {
  hidden: { opacity: 0, x: -12 },
  visible: (i: number) => ({ opacity: 1, x: 0, transition: { delay: i * 0.09, duration: 0.38, ease: [0.175, 0.885, 0.32, 1.275] } }),
};
const vRight: AV = {
  hidden: { opacity: 0, x: 12 },
  visible: (i: number) => ({ opacity: 1, x: 0, transition: { delay: i * 0.09, duration: 0.38, ease: [0.175, 0.885, 0.32, 1.275] } }),
};
const vHead: AV = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.175, 0.885, 0.32, 1.275] } },
};

// ---------------------------------------------------------------------------
// Sub-componente: lista de items de panel
// ---------------------------------------------------------------------------

function PanelList({
  items, side, className,
}: {
  items: PanelItem[];
  side: "before" | "after";
  className?: string;
}) {
  const isBefore = side === "before";
  const iconBg  = isBefore ? "bg-red-200 dark:bg-red-800/60"    : "bg-teal-200 dark:bg-teal-800/60";
  const iconCol = isBefore ? "text-red-600 dark:text-red-400"   : "text-teal-700 dark:text-teal-300";
  const textCol = isBefore
    ? "text-red-800 dark:text-red-300"
    : "text-teal-900 dark:text-teal-200 font-medium";
  const variant  = isBefore ? vLeft : vRight;

  return (
    <ul className={`flex flex-col gap-3 px-4 sm:px-5 py-4 ${className ?? ""}`}>
      {items.map(({ Icon, text }, i) => (
        <motion.li key={i} custom={i} variants={variant} initial="hidden" whileInView="visible" viewport={{ once: true }}
          className="flex items-start gap-3">
          <span className={`mt-0.5 flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${iconBg}`}>
            <Icon className={`w-3.5 h-3.5 ${iconCol}`} aria-hidden="true" />
          </span>
          <p className={`leading-snug ${textCol}`} style={{ fontSize: "clamp(0.78rem, 1.3vw, 0.88rem)", ...(isBefore ? { fontFamily: "Georgia, serif", opacity: 0.88 } : {}) }}>
            {text}
          </p>
        </motion.li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function SaasHowItWorks() {
  const [sliderPos, setSliderPos]   = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const calcPos = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setSliderPos(Math.min(98, Math.max(2, ((clientX - r.left) / r.width) * 100)));
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setIsDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    calcPos(e.clientX);
  }, [calcPos]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (isDragging) calcPos(e.clientX);
  }, [isDragging, calcPos]);

  const onPointerUp = useCallback(() => setIsDragging(false), []);

  // Animación hint al montar
  useEffect(() => {
    const t1 = setTimeout(() => setSliderPos(62), 700);
    const t2 = setTimeout(() => setSliderPos(50), 1200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const panelHeader = (label: string, isBefore: boolean) => (
    <div className={`px-4 sm:px-6 py-3 border-b ${
      isBefore
        ? "bg-red-100/70 dark:bg-red-900/40 border-red-200 dark:border-red-800/50"
        : "bg-teal-100/70 dark:bg-teal-900/40 border-teal-200 dark:border-teal-800/50"
    }`}>
      <span className={`font-black text-sm sm:text-base ${isBefore ? "text-red-700 dark:text-red-400" : "text-teal-700 dark:text-teal-300"}`}>
        {label}
      </span>
    </div>
  );

  return (
    <section id="como-funciona" className="py-20 md:py-28 bg-gray-50 dark:bg-[#0f1a14]">
      <div className="max-w-4xl mx-auto px-5 sm:px-8 lg:px-12">

        {/* Encabezado */}
        <motion.div className="text-center mb-10" variants={vHead} initial="hidden" whileInView="visible" viewport={{ once: true }}>
          <h2 className="font-extrabold text-gray-900 dark:text-[#f0f4f1] mb-2"
            style={{ fontSize: "clamp(1.5rem, 3vw, 2.2rem)", letterSpacing: "-0.02em" }}>
            La diferencia es clara
          </h2>
          <p className="text-gray-500 dark:text-[rgba(240,244,241,0.6)] text-base sm:text-lg">
            Arrastra para ver cómo cambia tu negocio
          </p>
        </motion.div>

        {/* ---- SLIDER (sm+) ---- */}
        <motion.div className="hidden sm:block" initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.15 }}>
          <div ref={containerRef}
            className="relative rounded-2xl overflow-hidden border border-gray-200 dark:border-[rgba(45,106,79,0.2)] select-none"
            style={{ height: "clamp(260px, 36vw, 320px)", cursor: isDragging ? "grabbing" : "grab" }}
            onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
            aria-label="Comparativa antes y después">

            {/* Panel izquierdo */}
            <div className="absolute inset-0 flex flex-col bg-red-50 dark:bg-red-950/30"
              style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }} aria-hidden="true">
              {panelHeader("Sin sistema", true)}
              <PanelList items={beforeItems} side="before" />
            </div>

            {/* Panel derecho */}
            <div className="absolute inset-0 flex flex-col bg-teal-50 dark:bg-teal-950/30"
              style={{ clipPath: `inset(0 0 0 ${sliderPos}%)` }} aria-hidden="true">
              {panelHeader("Con Buleje", false)}
              <PanelList items={afterItems} side="after" />
            </div>

            {/* Handle */}
            <div className="absolute top-0 bottom-0 z-10 flex items-center justify-center"
              style={{ left: `${sliderPos}%`, transform: "translateX(-50%)", cursor: isDragging ? "grabbing" : "grab" }}
              onPointerDown={onPointerDown}
              role="slider" aria-valuenow={Math.round(sliderPos)} aria-valuemin={2} aria-valuemax={98}
              aria-label="Mover comparativa" tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft")  setSliderPos(p => Math.max(2, p - 5));
                if (e.key === "ArrowRight") setSliderPos(p => Math.min(98, p + 5));
              }}>
              <div className="absolute inset-y-0 w-[2px] bg-white dark:bg-[#f0f4f1] shadow-lg" />
              <div className="relative z-20 w-10 h-10 rounded-full bg-white dark:bg-[#121f17] border-2 border-teal-500 dark:border-teal-400 flex items-center justify-center"
                style={{ boxShadow: "0 4px 16px rgba(15,118,110,0.35)" }}>
                <ArrowLeftRight className="w-4 h-4 text-teal-600 dark:text-teal-300" aria-hidden="true" />
              </div>
            </div>
          </div>
          <p className="text-center text-xs text-gray-400 dark:text-[rgba(240,244,241,0.4)] mt-2">
            Arrastra el handle para comparar
          </p>
        </motion.div>

        {/* ---- VERSIÓN MÓVIL (paneles apilados) ---- */}
        <div className="sm:hidden space-y-4">
          {[
            { label: "Sin sistema",   items: beforeItems, side: "before" as const, border: "border-red-200 dark:border-red-800/50",   bg: "bg-red-50 dark:bg-red-950/30" },
            { label: "Con Buleje", items: afterItems,  side: "after"  as const, border: "border-teal-200 dark:border-teal-800/50", bg: "bg-teal-50 dark:bg-teal-950/30" },
          ].map(({ label, items, side, border, bg }, idx) => (
            <motion.div key={side} className={`rounded-2xl overflow-hidden border ${border} ${bg}`}
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.4, delay: idx * 0.1 }}>
              {panelHeader(label, side === "before")}
              <PanelList items={items} side={side} />
            </motion.div>
          ))}
        </div>

        {/* ---- 3 PASOS COMPACTOS ---- */}
        <motion.div className="mt-12" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.2 }}>
          <div className="relative flex items-start justify-between gap-2">
            <div className="hidden sm:block absolute top-5 left-[calc(16.5%+1rem)] right-[calc(16.5%+1rem)] h-[2px] pointer-events-none"
              style={{ background: "linear-gradient(90deg, rgba(45,106,79,0.15), rgba(15,118,110,0.4), rgba(45,106,79,0.15))" }}
              aria-hidden="true" />
            {steps.map(({ num, Icon, label, sub }, i) => (
              <motion.div key={num} custom={i} variants={vLeft} initial="hidden" whileInView="visible"
                viewport={{ once: true }} className="relative flex flex-col items-center text-center flex-1">
                <div className="w-10 h-10 rounded-full flex items-center justify-center mb-2 z-10"
                  style={{ background: "linear-gradient(135deg,#00B4A6,#009690)", boxShadow: "0 4px 14px -2px rgba(15,118,110,0.4)" }}>
                  <Icon className="w-4 h-4 text-white" aria-hidden="true" />
                </div>
                <span className="text-xs font-bold text-gray-900 dark:text-[#f0f4f1] leading-tight">{label}</span>
                <span className="text-[0.7rem] text-gray-400 dark:text-[rgba(240,244,241,0.45)] mt-0.5">{sub}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>

      </div>
    </section>
  );
}
