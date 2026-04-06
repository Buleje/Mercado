"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Crown, Building2, Globe, Check, ChevronDown } from "lucide-react";
import { PLANS } from "@/lib/plans";

// ─── Animation variants ───────────────────────────────────────────────────────
const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: [0.175, 0.885, 0.32, 1.275] },
};

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.08 } },
};

// ─── Plan card definitions ────────────────────────────────────────────────────
interface CardDef {
  id: "free" | "pro" | "business" | "enterprise";
  icon: React.ElementType;
  iconColor: string;
  priceMonthly: number | null;
  priceYearly: number | null; // per-month equivalent
  priceSuffix?: string;
  priceLabel?: string;
  features: string[];
  cta: string;
  ctaHref: string;
  ctaVariant: "outline" | "filled";
  popular?: boolean;
}

const CARD_DEFS: CardDef[] = [
  {
    id: "free",
    icon: Zap,
    iconColor: "#6b7280",
    priceMonthly: 0,
    priceYearly: 0,
    priceSuffix: "/mes",
    priceLabel: "Gratis para siempre",
    features: [
      "50 productos",
      "2 usuarios",
      "200 pedidos/mes",
      "POS básico",
      "Inventario",
    ],
    cta: "Empezar gratis",
    ctaHref: "/registro",
    ctaVariant: "outline",
  },
  {
    id: "pro",
    icon: Crown,
    iconColor: "#00B4A6",
    priceMonthly: PLANS.pro.priceMonthly,
    priceYearly: Math.round(PLANS.pro.priceYearly / 12),
    priceSuffix: "/mes",
    features: [
      "500 productos",
      "10 usuarios",
      "2 000 pedidos/mes",
      "Analytics avanzado",
      "Dominio propio",
      "WhatsApp bot",
    ],
    cta: "Elegir Pro",
    ctaHref: "/registro?plan=pro",
    ctaVariant: "filled",
    popular: true,
  },
  {
    id: "business",
    icon: Building2,
    iconColor: "#8b5cf6",
    priceMonthly: PLANS.business.priceMonthly,
    priceYearly: Math.round(PLANS.business.priceYearly / 12),
    priceSuffix: "/mes",
    features: [
      "Todo ilimitado",
      "5 tiendas",
      "API access",
      "Multi-store",
      "Soporte prioritario",
    ],
    cta: "Elegir Business",
    ctaHref: "/registro?plan=business",
    ctaVariant: "filled",
  },
  {
    id: "enterprise",
    icon: Globe,
    iconColor: "#f59e0b",
    priceMonthly: null,
    priceYearly: null,
    priceLabel: "Personalizado",
    features: [
      "Todo incluido",
      "White label",
      "SLA garantizado",
      "Soporte dedicado",
      "Onboarding guiado",
    ],
    cta: "Contactar ventas",
    ctaHref: "https://wa.me/51999999999?text=Hola%2C+quiero+info+sobre+Enterprise",
    ctaVariant: "outline",
  },
];

// ─── Animated price number (fade-scale al cambiar) ────────────────────────────
function AnimatedPrice({ value, suffix }: { value: string; suffix?: string }) {
  return (
    <div className="flex items-end gap-1">
      <AnimatePresence mode="wait">
        <motion.span
          key={value}
          initial={{ opacity: 0, scale: 0.85, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 1.1, y: -6 }}
          transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
          className="font-extrabold text-gray-900 dark:text-[#f0f4f1]"
          style={{ fontSize: "clamp(1.8rem, 2.5vw, 2.2rem)", lineHeight: 1 }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
      {suffix && (
        <span className="text-gray-500 dark:text-[rgba(240,244,241,0.5)] text-sm mb-1">
          {suffix}
        </span>
      )}
    </div>
  );
}

// ─── Pill switch toggle ───────────────────────────────────────────────────────
function PillSwitch({
  isAnnual,
  onToggle,
}: {
  isAnnual: boolean;
  onToggle: (val: boolean) => void;
}) {
  return (
    <div
      className="inline-flex items-center gap-0 mt-6 rounded-full p-1 relative"
      style={{
        background: "linear-gradient(135deg, #f0fdf4 0%, #ccfbf1 100%)",
        boxShadow: "inset 0 1px 3px rgba(15,118,110,0.12)",
      }}
    >
      {/* Track indicator (sliding pill) */}
      <div className="relative flex">
        <button
          onClick={() => onToggle(false)}
          className="relative z-10 px-5 py-2 rounded-full text-sm font-semibold transition-colors duration-200 min-h-[44px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B4A6]"
          style={{
            color: !isAnnual ? "#fff" : "#6b7280",
          }}
        >
          {!isAnnual && (
            <motion.span
              layoutId="pill-bg"
              className="absolute inset-0 rounded-full"
              style={{
                background: "linear-gradient(135deg, #00B4A6 0%, #33C4B8 50%, #2dd4bf 100%)",
                boxShadow: "0 2px 12px rgba(15,118,110,0.35)",
              }}
              transition={{ type: "spring", stiffness: 400, damping: 35 }}
            />
          )}
          <span className="relative">Mensual</span>
        </button>

        <button
          onClick={() => onToggle(true)}
          className="relative z-10 px-5 py-2 rounded-full text-sm font-semibold transition-colors duration-200 min-h-[44px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B4A6] flex items-center gap-2"
          style={{
            color: isAnnual ? "#fff" : "#6b7280",
          }}
        >
          {isAnnual && (
            <motion.span
              layoutId="pill-bg"
              className="absolute inset-0 rounded-full"
              style={{
                background: "linear-gradient(135deg, #00B4A6 0%, #33C4B8 50%, #2dd4bf 100%)",
                boxShadow: "0 2px 12px rgba(15,118,110,0.35)",
              }}
              transition={{ type: "spring", stiffness: 400, damping: 35 }}
            />
          )}
          <span className="relative">Anual</span>
          <span
            className="relative text-xs font-bold px-2 py-0.5 rounded-full"
            style={{
              background: isAnnual ? "rgba(255,255,255,0.22)" : "rgba(15,118,110,0.12)",
              color: isAnnual ? "#fff" : "#00B4A6",
            }}
          >
            Ahorra 20%
          </span>
        </button>
      </div>
    </div>
  );
}

// ─── Plan prices lookup (for payback calculation) ────────────────────────────
const PLAN_PRICES: Record<string, number> = {
  Free: 0,
  Pro: PLANS.pro.priceMonthly ?? 0,
  Business: PLANS.business.priceMonthly ?? 0,
};

// ─── Animated counter hook ────────────────────────────────────────────────────
function useAnimatedNumber(target: number, duration = 400) {
  const [displayed, setDisplayed] = useState(target);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(target);

  useEffect(() => {
    const from = fromRef.current;
    const to = target;
    if (from === to) return;

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    startRef.current = null;

    const step = (timestamp: number) => {
      if (startRef.current === null) startRef.current = timestamp;
      const elapsed = timestamp - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(from + (to - from) * eased);
      setDisplayed(current);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = to;
      }
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);

  return displayed;
}

// ─── ROI result card ──────────────────────────────────────────────────────────
function RoiCard({
  label,
  value,
  unit,
  sub,
  highlight,
}: {
  label: string;
  value: number;
  unit: string;
  sub?: string;
  highlight?: boolean;
}) {
  const animated = useAnimatedNumber(value);

  return (
    <div
      className="flex flex-col rounded-2xl p-5 flex-1 min-w-0"
      style={{
        background: highlight
          ? "linear-gradient(135deg, rgba(15,118,110,0.18) 0%, rgba(13,148,136,0.12) 100%)"
          : "rgba(15,118,110,0.07)",
        border: highlight
          ? "1.5px solid rgba(15,118,110,0.45)"
          : "1px solid rgba(15,118,110,0.18)",
        boxShadow: highlight ? "0 4px 24px -6px rgba(15,118,110,0.25)" : "none",
      }}
    >
      <p
        className="text-xs font-semibold uppercase tracking-widest mb-2"
        style={{ color: "rgba(15,118,110,0.85)", letterSpacing: "0.08em" }}
      >
        {label}
      </p>
      <p
        className="font-extrabold text-gray-900 dark:text-[#f0f4f1] leading-none"
        style={{ fontSize: "clamp(1.6rem, 3vw, 2rem)" }}
      >
        {unit === "S/" ? `S/ ${animated.toLocaleString("es-PE")}` : `${animated} ${unit}`}
      </p>
      {sub && (
        <p className="text-xs text-gray-500 dark:text-[rgba(240,244,241,0.5)] mt-1.5 leading-snug">
          {sub}
        </p>
      )}
    </div>
  );
}

// ─── ROI Calculator section ───────────────────────────────────────────────────
function RoiCalculator({
  onRecommendedPlan,
}: {
  onRecommendedPlan: (plan: "free" | "pro" | "business") => void;
}) {
  const [ventas, setVentas] = useState(20000);
  const [clientesFiado, setClientesFiado] = useState(10);

  const roi = useMemo(() => {
    const ahorroCobros = clientesFiado * 15;
    const recuperaStock = Math.round(ventas * 0.03);
    const totalAhorro = ahorroCobros + recuperaStock;

    let planRecomendado: "free" | "pro" | "business";
    let planLabel: string;
    if (ventas < 15000) {
      planRecomendado = "free";
      planLabel = "Free";
    } else if (ventas < 50000) {
      planRecomendado = "pro";
      planLabel = "Pro";
    } else {
      planRecomendado = "business";
      planLabel = "Business";
    }

    const precioPlan = PLAN_PRICES[planLabel] ?? 0;
    const diasPayback =
      precioPlan === 0 || totalAhorro === 0
        ? 0
        : Math.ceil((precioPlan / totalAhorro) * 30);

    return { ahorroCobros, recuperaStock, planRecomendado, planLabel, diasPayback };
  }, [ventas, clientesFiado]);

  // Notifica al padre cada vez que cambia el plan recomendado
  useEffect(() => {
    onRecommendedPlan(roi.planRecomendado);
  }, [roi.planRecomendado, onRecommendedPlan]);

  const animatedDias = useAnimatedNumber(roi.diasPayback);

  return (
    <motion.div
      className="mb-14"
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, ease: [0.175, 0.885, 0.32, 1.275] }}
    >
      {/* Contenedor principal */}
      <div
        className="rounded-3xl p-6 sm:p-8"
        style={{
          background: "rgba(15,118,110,0.05)",
          border: "1px solid rgba(15,118,110,0.18)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
      >
        {/* Encabezado de la calculadora */}
        <div className="mb-7">
          <h3
            className="font-extrabold text-gray-900 dark:text-[#f0f4f1] mb-1"
            style={{ fontSize: "clamp(1.2rem, 2.5vw, 1.6rem)", letterSpacing: "-0.02em" }}
          >
            Calcula cuánto ahorrarías
          </h3>
          <p className="text-sm text-gray-500 dark:text-[rgba(240,244,241,0.55)]">
            Mueve los controles y ve tu ahorro estimado
          </p>
        </div>

        {/* Sliders */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-7 mb-8">
          {/* Slider ventas */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label
                htmlFor="slider-ventas"
                className="text-sm font-semibold text-gray-700 dark:text-[rgba(240,244,241,0.8)]"
              >
                ¿Cuánto vendes al mes?
              </label>
              <span
                className="text-sm font-bold px-2.5 py-0.5 rounded-full"
                style={{
                  background: "rgba(15,118,110,0.12)",
                  color: "#00B4A6",
                }}
              >
                S/ {ventas.toLocaleString("es-PE")}
              </span>
            </div>
            <div className="relative">
              <input
                id="slider-ventas"
                type="range"
                min={5000}
                max={100000}
                step={1000}
                value={ventas}
                onChange={(e) => setVentas(Number(e.target.value))}
                className="roi-slider w-full h-2 rounded-full appearance-none cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#00B4A6]"
                style={{
                  background: `linear-gradient(to right, #00B4A6 ${((ventas - 5000) / 95000) * 100}%, rgba(15,118,110,0.18) ${((ventas - 5000) / 95000) * 100}%)`,
                  // thumb styles via global CSS
                }}
                aria-label="Ventas mensuales en soles"
              />
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-xs text-gray-400 dark:text-[rgba(240,244,241,0.35)]">S/ 5,000</span>
              <span className="text-xs text-gray-400 dark:text-[rgba(240,244,241,0.35)]">S/ 100,000</span>
            </div>
          </div>

          {/* Slider clientes fiado */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label
                htmlFor="slider-fiado"
                className="text-sm font-semibold text-gray-700 dark:text-[rgba(240,244,241,0.8)]"
              >
                ¿Cuántos clientes compran fiado?
              </label>
              <span
                className="text-sm font-bold px-2.5 py-0.5 rounded-full"
                style={{
                  background: "rgba(15,118,110,0.12)",
                  color: "#00B4A6",
                }}
              >
                {clientesFiado} {clientesFiado === 1 ? "cliente" : "clientes"}
              </span>
            </div>
            <div className="relative">
              <input
                id="slider-fiado"
                type="range"
                min={0}
                max={50}
                step={1}
                value={clientesFiado}
                onChange={(e) => setClientesFiado(Number(e.target.value))}
                className="roi-slider w-full h-2 rounded-full appearance-none cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#00B4A6]"
                style={{
                  background: `linear-gradient(to right, #00B4A6 ${(clientesFiado / 50) * 100}%, rgba(15,118,110,0.18) ${(clientesFiado / 50) * 100}%)`,
                }}
                aria-label="Número de clientes que compran fiado"
              />
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-xs text-gray-400 dark:text-[rgba(240,244,241,0.35)]">0</span>
              <span className="text-xs text-gray-400 dark:text-[rgba(240,244,241,0.35)]">50 clientes</span>
            </div>
          </div>
        </div>

        {/* Cards de resultado */}
        <div className="flex flex-col sm:flex-row gap-3">
          <RoiCard
            label="Ahorras en cobros"
            value={roi.ahorroCobros}
            unit="S/"
            sub="S/ 15 promedio de pérdida por fiado sin control"
          />
          <RoiCard
            label="Recuperas en stock"
            value={roi.recuperaStock}
            unit="S/"
            sub="3% de pérdida por stock vencido o agotado"
          />
          <div
            className="flex flex-col rounded-2xl p-5 flex-1 min-w-0"
            style={{
              background:
                "linear-gradient(135deg, rgba(15,118,110,0.22) 0%, rgba(13,148,136,0.15) 100%)",
              border: "1.5px solid rgba(15,118,110,0.5)",
              boxShadow: "0 4px 24px -6px rgba(15,118,110,0.3)",
            }}
          >
            <p
              className="text-xs font-semibold uppercase tracking-widest mb-2"
              style={{ color: "rgba(15,118,110,0.9)", letterSpacing: "0.08em" }}
            >
              Plan recomendado
            </p>
            <p
              className="font-extrabold text-gray-900 dark:text-[#f0f4f1] leading-none"
              style={{ fontSize: "clamp(1.6rem, 3vw, 2rem)" }}
            >
              {roi.planLabel}
            </p>
            <p className="text-xs text-gray-500 dark:text-[rgba(240,244,241,0.5)] mt-1.5 leading-snug">
              {roi.planLabel === "Free"
                ? "Sin costo — empieza hoy mismo"
                : roi.diasPayback === 0
                ? "Se paga solo con el ahorro"
                : (
                  <>
                    Se paga solo en{" "}
                    <span className="font-bold text-[#00B4A6]">
                      {animatedDias} días
                    </span>
                  </>
                )}
            </p>
          </div>
        </div>
      </div>

      {/* Separador visual hacia planes */}
      <div className="relative flex items-center justify-center mt-10 mb-0">
        <div
          className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px"
          style={{ background: "rgba(15,118,110,0.18)" }}
          aria-hidden="true"
        />
        <span
          className="relative px-5 py-1.5 text-sm font-bold rounded-full z-10"
          style={{
            background: "rgba(15,118,110,0.1)",
            color: "#00B4A6",
            border: "1px solid rgba(15,118,110,0.25)",
          }}
        >
          Elige tu plan
        </span>
      </div>
      <div className="flex justify-center mt-3" aria-hidden="true">
        <motion.div
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        >
          <ChevronDown className="w-5 h-5" style={{ color: "rgba(15,118,110,0.55)" }} />
        </motion.div>
      </div>
    </motion.div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function SaasPricing() {
  const [isAnnual, setIsAnnual] = useState(false);
  const [recommendedPlan, setRecommendedPlan] = useState<"free" | "pro" | "business">("pro");

  const getPrice = (card: CardDef): string => {
    if (card.priceMonthly === null) return "Personalizado";
    if (card.priceMonthly === 0) return "S/ 0";
    const price = isAnnual ? card.priceYearly : card.priceMonthly;
    return `S/ ${price}`;
  };

  return (
    <section
      id="planes"
      className="py-20 md:py-28 bg-white dark:bg-[#0a0f0d] relative overflow-hidden"
    >
      {/* Fondo decorativo */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(15,118,110,0.08) 0%, transparent 70%)",
        }}
      />

      <div className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-12 relative">
        {/* Encabezado */}
        <motion.div
          className="text-center mb-10 flex flex-col items-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2
            className="font-extrabold text-gray-900 dark:text-[#f0f4f1] mb-3"
            style={{ fontSize: "clamp(1.5rem, 3vw, 2.2rem)", letterSpacing: "-0.02em" }}
          >
            Planes simples, sin sorpresas
          </h2>
          <p className="text-gray-500 dark:text-[rgba(240,244,241,0.6)] text-base sm:text-lg">
            Empieza gratis. Crece cuando lo necesites.
          </p>

          {/* Toggle mensual / anual — pill switch moderno */}
          <PillSwitch isAnnual={isAnnual} onToggle={setIsAnnual} />
        </motion.div>

        {/* Calculadora de ROI */}
        <RoiCalculator onRecommendedPlan={setRecommendedPlan} />

        {/* Grid de cards */}
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-10"
          variants={staggerContainer}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true }}
        >
          {CARD_DEFS.map((card) => {
            const Icon = card.icon;
            const isPro = card.popular;
            const isRecommended = card.id === recommendedPlan;
            // Cards que no son la recomendada se atenúan ligeramente
            const isDimmed =
              recommendedPlan !== "pro" && !isRecommended && card.id !== "enterprise";

            return (
              <motion.div
                key={card.id}
                variants={fadeUp}
                animate={
                  isRecommended && card.id !== "pro"
                    ? {
                        boxShadow: [
                          "0 0 0 1.5px rgba(15,118,110,0.35)",
                          "0 0 0 3px rgba(15,118,110,0.55)",
                          "0 0 0 1.5px rgba(15,118,110,0.35)",
                        ],
                      }
                    : undefined
                }
                transition={
                  isRecommended && card.id !== "pro"
                    ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" }
                    : { duration: 0.2, ease: [0.4, 0, 0.2, 1] }
                }
                whileHover={
                  isPro
                    ? { y: -4, boxShadow: "0 24px 64px -8px rgba(15,118,110,0.35), 0 0 0 1px rgba(15,118,110,0.4)" }
                    : { y: -4, boxShadow: "0 12px 32px -8px rgba(0,0,0,0.12)" }
                }
                style={{
                  opacity: isDimmed ? 0.7 : 1,
                  transition: "opacity 0.3s ease",
                  ...(isPro
                    ? {
                        border: "1.5px solid transparent",
                        backgroundClip: "padding-box",
                        backgroundImage: "none",
                        boxShadow:
                          "0 20px 60px -10px rgba(15,118,110,0.2), 0 0 40px rgba(15,118,110,0.2), 0 0 0 1.5px rgba(15,118,110,0.35)",
                      }
                    : undefined),
                }}
                className={`relative flex flex-col rounded-2xl p-6 border ${
                  isPro
                    ? "scale-[1.02] bg-white dark:bg-[#0f1a14]"
                    : "border-gray-200 dark:border-[rgba(45,106,79,0.18)] bg-white dark:bg-[#121f17]"
                }`}
              >
                {/* Borde gradiente Pro — capa decorativa */}
                {isPro && (
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 rounded-2xl pointer-events-none"
                    style={{
                      padding: "1.5px",
                      background: "linear-gradient(135deg, #00B4A6, #2dd4bf, #33C4B8)",
                      WebkitMask:
                        "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                      WebkitMaskComposite: "xor",
                      maskComposite: "exclude",
                    }}
                  />
                )}

                {/* Badge Popular animado */}
                {isPro && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <motion.span
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.3, type: "spring", stiffness: 300, damping: 20 }}
                      className="relative inline-flex items-center text-white text-xs font-bold px-3 py-1 rounded-full overflow-hidden shadow-lg"
                      style={{
                        background: "linear-gradient(90deg, #00B4A6, #2dd4bf, #00B4A6)",
                        backgroundSize: "200% 100%",
                      }}
                    >
                      {/* Shimmer interno del badge */}
                      <motion.span
                        aria-hidden="true"
                        className="absolute inset-0"
                        style={{
                          background:
                            "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.28) 50%, transparent 100%)",
                        }}
                        animate={{ x: ["-100%", "200%"] }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                          repeatDelay: 1.5,
                          ease: "easeInOut",
                        }}
                      />
                      <span className="relative">Popular</span>
                    </motion.span>
                  </div>
                )}

                {/* Icono + nombre */}
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: `${card.iconColor}18` }}
                  >
                    <Icon
                      className="w-5 h-5"
                      style={{ color: card.iconColor }}
                      aria-hidden="true"
                    />
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 dark:text-[#f0f4f1]">
                      {PLANS[card.id].name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-[rgba(240,244,241,0.5)] leading-tight">
                      {PLANS[card.id].description}
                    </p>
                  </div>
                </div>

                {/* Precio */}
                <div className="mb-5">
                  {card.priceMonthly === null ? (
                    <p
                      className="font-extrabold text-gray-900 dark:text-[#f0f4f1]"
                      style={{ fontSize: "clamp(1.5rem, 2.5vw, 2rem)" }}
                    >
                      Personalizado
                    </p>
                  ) : (
                    <AnimatedPrice value={getPrice(card)} suffix={card.priceSuffix} />
                  )}
                  {card.priceLabel && (
                    <p className="text-xs text-gray-400 dark:text-[rgba(240,244,241,0.4)] mt-1">
                      {card.priceLabel}
                    </p>
                  )}
                  {card.priceMonthly !== null &&
                    card.priceMonthly > 0 &&
                    isAnnual && (
                      <p className="text-xs text-[#00B4A6] font-medium mt-1">
                        Facturado anualmente
                      </p>
                    )}
                </div>

                {/* Features */}
                <ul className="space-y-2.5 mb-6 flex-1">
                  {card.features.map((feat) => (
                    <li key={feat} className="flex items-center gap-2 text-sm">
                      <Check
                        className="w-4 h-4 text-[#00B4A6] shrink-0"
                        aria-hidden="true"
                      />
                      <span className="text-gray-600 dark:text-[rgba(240,244,241,0.75)]">
                        {feat}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <a
                  href={card.ctaHref}
                  target={card.id === "enterprise" ? "_blank" : undefined}
                  rel={card.id === "enterprise" ? "noopener noreferrer" : undefined}
                  className={`block w-full text-center py-3 px-4 rounded-xl font-bold text-sm transition-all duration-200 min-h-[44px] flex items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B4A6] ${
                    card.ctaVariant === "filled"
                      ? "text-white hover:opacity-90"
                      : "border-2 border-gray-300 dark:border-[rgba(45,106,79,0.3)] text-gray-700 dark:text-[rgba(240,244,241,0.8)] hover:border-[#00B4A6] dark:hover:border-[#00B4A6] hover:text-[#00B4A6]"
                  }`}
                  style={
                    card.ctaVariant === "filled"
                      ? {
                          background:
                            "linear-gradient(135deg, #00B4A6 0%, #33C4B8 100%)",
                          boxShadow: "0 4px 16px -4px rgba(15,118,110,0.4)",
                        }
                      : undefined
                  }
                >
                  {card.cta}
                </a>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
