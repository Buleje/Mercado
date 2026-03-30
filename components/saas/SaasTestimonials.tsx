"use client";

import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
type AvatarColor = "teal" | "blue" | "amber";

interface CaseStudy {
  name: string;
  business: string;
  city: string;
  before: string;
  after: string;
  metric: string;
  metricLabel: string;
  quote: string;
  since: string;
  color: AvatarColor;
}

// ─── Data ─────────────────────────────────────────────────────────────────────
const CASES: CaseStudy[] = [
  {
    name: "María López",
    business: "Bodega La Esquina",
    city: "Pucallpa",
    before: "Perdía S/ 300/mes en fiados no cobrados",
    after: "Cobra 95% a tiempo con semáforo de crédito",
    metric: "+95%",
    metricLabel: "cobros recuperados",
    quote:
      "Antes usaba un cuaderno y perdía plata cada mes. Ahora el sistema me dice a quién fiar y a quién no.",
    since: "Enero 2026",
    color: "teal",
  },
  {
    name: "Carlos Ríos",
    business: "Minimarket Don Carlos",
    city: "Yarinacocha",
    before: "Se enteraba del stock agotado cuando el cliente preguntaba",
    after: "Recibe alerta 3 días antes de que se agote",
    metric: "-70%",
    metricLabel: "quiebres de stock",
    quote:
      "Lo mejor es que el sistema me avisa antes. Ya no pierdo ventas porque ahora siempre tengo lo que el cliente necesita.",
    since: "Febrero 2026",
    color: "blue",
  },
  {
    name: "Rosa Huamán",
    business: "Bodega Rosita",
    city: "Callería",
    before: "No podía atender WhatsApp y mostrador al mismo tiempo",
    after: "El bot toma pedidos mientras ella vende en tienda",
    metric: "+40%",
    metricLabel: "pedidos por WhatsApp",
    quote:
      "Mis clientes hacen pedidos por WhatsApp sin que yo esté pendiente. El bot responde, confirma y hasta cobra.",
    since: "Enero 2026",
    color: "amber",
  },
  {
    name: "Pedro Sánchez",
    business: "Abarrotes El Progreso",
    city: "Manantay",
    before: "Registrar compras a mano tomaba 30 minutos",
    after: "Toma foto de la factura y listo en 2 minutos",
    metric: "-90%",
    metricLabel: "tiempo de registro",
    quote:
      "Funciona sin internet. En Pucallpa a veces se va la señal y yo sigo vendiendo normal. Cuando vuelve, se sincroniza solo.",
    since: "Marzo 2026",
    color: "amber",
  },
];

// ─── Color palettes ───────────────────────────────────────────────────────────
const COLOR: Record<
  AvatarColor,
  { bg: string; border: string; text: string; metricText: string }
> = {
  teal: {
    bg: "#0f766e",
    border: "linear-gradient(135deg, #0f766e, #14b8a6)",
    text: "rgba(20,184,166,0.15)",
    metricText: "#0d9488",
  },
  blue: {
    bg: "#1d4ed8",
    border: "linear-gradient(135deg, #1d4ed8, #3b82f6)",
    text: "rgba(59,130,246,0.15)",
    metricText: "#2563eb",
  },
  amber: {
    bg: "#b45309",
    border: "linear-gradient(135deg, #b45309, #f59e0b)",
    text: "rgba(245,158,11,0.15)",
    metricText: "#d97706",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

// ─── AnimatedCounter ──────────────────────────────────────────────────────────
function AnimatedCounter({
  value,
  active,
  color,
}: {
  value: string;
  active: boolean;
  color: string;
}) {
  const shouldReduce = useReducedMotion();
  return (
    <motion.span
      key={active ? "active" : "idle"}
      initial={shouldReduce ? false : { opacity: 0, scale: 0.7 }}
      animate={active ? { opacity: 1, scale: 1 } : { opacity: 0.3, scale: 0.9 }}
      transition={{ duration: 0.45, ease: [0.175, 0.885, 0.32, 1.275] }}
      style={{
        fontSize: "clamp(2.2rem, 5vw, 3rem)",
        fontWeight: 900,
        letterSpacing: "-0.04em",
        color,
        display: "inline-block",
        lineHeight: 1,
      }}
    >
      {value}
    </motion.span>
  );
}

// ─── TestimonialCard ──────────────────────────────────────────────────────────
function TestimonialCard({
  item,
  active,
}: {
  item: CaseStudy;
  active: boolean;
}) {
  const palette = COLOR[item.color];

  return (
    <div
      className="w-full rounded-2xl border bg-white dark:bg-gray-900 shadow-lg overflow-hidden"
      style={{ borderColor: "rgba(45,106,79,0.18)" }}
    >
      <div className="p-6 sm:p-8 grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
        {/* Columna izquierda */}
        <div className="flex flex-col gap-5">
          {/* Autor */}
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div
              className="shrink-0 rounded-full p-[3px]"
              style={{ background: palette.border }}
              aria-hidden="true"
            >
              <div
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center text-white font-bold text-xl select-none"
                style={{ background: palette.bg }}
              >
                {getInitials(item.name)}
              </div>
            </div>
            <div>
              <p
                className="font-bold text-gray-900 dark:text-[#f0f4f1]"
                style={{ fontSize: "clamp(1rem, 2vw, 1.15rem)" }}
              >
                {item.name}
              </p>
              <p className="text-sm text-gray-500 dark:text-[rgba(240,244,241,0.55)]">
                {item.business} · {item.city}
              </p>
              {/* Estrellas */}
              <div className="flex gap-0.5 mt-1" aria-label="5 de 5 estrellas">
                {Array.from({ length: 5 }).map((_, i) => (
                  <svg
                    key={i}
                    aria-hidden="true"
                    className="w-4 h-4"
                    viewBox="0 0 20 20"
                    fill="#f59e0b"
                  >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
            </div>
          </div>

          {/* Cards Antes / Después */}
          <div className="grid grid-cols-2 gap-3">
            <div
              className="rounded-xl p-3 border"
              style={{
                background: "rgba(239,68,68,0.07)",
                borderColor: "rgba(239,68,68,0.2)",
              }}
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: "rgba(239,68,68,0.15)" }}
                  aria-hidden="true"
                >
                  <X className="w-3 h-3 text-red-500" strokeWidth={3} />
                </div>
                <span
                  className="text-xs font-bold uppercase tracking-widest text-red-500"
                  style={{ letterSpacing: "0.08em" }}
                >
                  Antes
                </span>
              </div>
              <p className="text-xs text-gray-700 dark:text-[rgba(240,244,241,0.75)] leading-snug">
                {item.before}
              </p>
            </div>
            <div
              className="rounded-xl p-3 border"
              style={{
                background: "rgba(34,197,94,0.07)",
                borderColor: "rgba(34,197,94,0.2)",
              }}
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: "rgba(34,197,94,0.15)" }}
                  aria-hidden="true"
                >
                  <Check className="w-3 h-3 text-green-500" strokeWidth={3} />
                </div>
                <span
                  className="text-xs font-bold uppercase tracking-widest text-green-600 dark:text-green-400"
                  style={{ letterSpacing: "0.08em" }}
                >
                  Después
                </span>
              </div>
              <p className="text-xs text-gray-700 dark:text-[rgba(240,244,241,0.75)] leading-snug">
                {item.after}
              </p>
            </div>
          </div>

          {/* Métrica destacada */}
          <div className="flex items-end gap-3">
            <AnimatedCounter
              value={item.metric}
              active={active}
              color={palette.metricText}
            />
            <span className="text-sm text-gray-500 dark:text-[rgba(240,244,241,0.55)] mb-1 leading-tight">
              {item.metricLabel}
            </span>
          </div>
        </div>

        {/* Columna derecha */}
        <div className="flex flex-col justify-between gap-4 relative">
          {/* Comilla decorativa */}
          <span
            aria-hidden="true"
            className="absolute -top-2 -right-2 select-none pointer-events-none font-serif leading-none"
            style={{
              fontSize: "8rem",
              lineHeight: 1,
              color: palette.text,
              fontWeight: 900,
            }}
          >
            &rdquo;
          </span>

          {/* Quote */}
          <blockquote className="relative z-10 flex-1">
            <p
              className="text-gray-700 dark:text-[rgba(240,244,241,0.85)] leading-relaxed"
              style={{ fontSize: "clamp(0.95rem, 1.5vw, 1.05rem)" }}
            >
              &ldquo;{item.quote}&rdquo;
            </p>
          </blockquote>

          {/* Desde */}
          <p
            className="text-xs text-gray-400 dark:text-[rgba(240,244,241,0.4)] border-t pt-3 relative z-10"
            style={{ borderColor: "rgba(45,106,79,0.12)" }}
          >
            Usa Buleje desde:{" "}
            <span className="font-semibold text-gray-600 dark:text-[rgba(240,244,241,0.6)]">
              {item.since}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SaasTestimonials() {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const shouldReduce = useReducedMotion();
  const autoplayRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPausedRef = useRef(false);

  // Drag state
  const dragStartX = useRef(0);
  const isDragging = useRef(false);

  const total = CASES.length;

  const go = useCallback(
    (next: number, dir: 1 | -1) => {
      setDirection(dir);
      setIndex(((next % total) + total) % total);
    },
    [total]
  );

  const prev = useCallback(() => go(index - 1, -1), [index, go]);
  const next = useCallback(() => go(index + 1, 1), [index, go]);

  // Autoplay
  useEffect(() => {
    function start() {
      autoplayRef.current = setInterval(() => {
        if (!isPausedRef.current) {
          setDirection(1);
          setIndex((i) => (i + 1) % total);
        }
      }, 6000);
    }
    start();
    return () => {
      if (autoplayRef.current) clearInterval(autoplayRef.current);
    };
  }, [total]);

  const pauseAutoplay = () => {
    isPausedRef.current = true;
  };
  const resumeAutoplay = () => {
    isPausedRef.current = false;
  };

  // Pointer drag (swipe mobile)
  const onPointerDown = (e: React.PointerEvent) => {
    dragStartX.current = e.clientX;
    isDragging.current = true;
    pauseAutoplay();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const delta = e.clientX - dragStartX.current;
    if (Math.abs(delta) > 48) {
      isDragging.current = false;
      if (delta < 0) next();
      else prev();
    }
  };
  const onPointerUp = () => {
    isDragging.current = false;
    resumeAutoplay();
  };

  const slideVariants = {
    enter: (d: number) => ({
      x: shouldReduce ? 0 : d > 0 ? "60%" : "-60%",
      opacity: 0,
    }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({
      x: shouldReduce ? 0 : d > 0 ? "-60%" : "60%",
      opacity: 0,
    }),
  };

  return (
    <section
      id="testimonios"
      className="py-20 md:py-28 bg-gray-50 dark:bg-[#0f1a14] relative overflow-hidden"
    >
      {/* Fondo decorativo */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 110%, rgba(15,118,110,0.09) 0%, transparent 70%)",
        }}
      />

      <div className="max-w-4xl mx-auto px-5 sm:px-8 lg:px-12 relative">
        {/* Encabezado */}
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2
            className="font-extrabold text-gray-900 dark:text-[#f0f4f1]"
            style={{
              fontSize: "clamp(1.5rem, 3vw, 2.2rem)",
              letterSpacing: "-0.02em",
            }}
          >
            Historias reales de bodegueros como tú
          </h2>
          <p className="text-gray-500 dark:text-[rgba(240,244,241,0.6)] mt-3 text-base sm:text-lg">
            Resultados medibles, no promesas
          </p>
        </motion.div>

        {/* Carrusel */}
        <div
          className="relative select-none"
          onMouseEnter={pauseAutoplay}
          onMouseLeave={resumeAutoplay}
        >
          {/* Track */}
          <div
            className="overflow-hidden rounded-2xl cursor-grab active:cursor-grabbing"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            style={{ minHeight: 320 }}
          >
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={index}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.38, ease: [0.4, 0, 0.2, 1] }}
              >
                <TestimonialCard item={CASES[index]} active />
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Flechas */}
          <button
            onClick={prev}
            aria-label="Testimonio anterior"
            className="absolute -left-4 sm:-left-6 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full flex items-center justify-center bg-white dark:bg-[#121f17] border shadow-md transition-all duration-200 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f766e]"
            style={{ borderColor: "rgba(45,106,79,0.2)" }}
          >
            <ChevronLeft className="w-5 h-5 text-gray-700 dark:text-[#f0f4f1]" />
          </button>
          <button
            onClick={next}
            aria-label="Testimonio siguiente"
            className="absolute -right-4 sm:-right-6 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full flex items-center justify-center bg-white dark:bg-[#121f17] border shadow-md transition-all duration-200 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f766e]"
            style={{ borderColor: "rgba(45,106,79,0.2)" }}
          >
            <ChevronRight className="w-5 h-5 text-gray-700 dark:text-[#f0f4f1]" />
          </button>
        </div>

        {/* Dots */}
        <div
          className="flex items-center justify-center gap-2 mt-6"
          role="tablist"
          aria-label="Testimonios"
        >
          {CASES.map((_, i) => (
            <button
              key={i}
              role="tab"
              aria-selected={i === index}
              aria-label={`Ir al testimonio ${i + 1}`}
              onClick={() => go(i, i > index ? 1 : -1)}
              className="transition-all duration-300 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f766e]"
              style={{
                width: i === index ? 24 : 8,
                height: 8,
                background:
                  i === index
                    ? "#0f766e"
                    : "rgba(15,118,110,0.28)",
              }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
