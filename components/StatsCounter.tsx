"use client";

import { useEffect, useRef, useState, startTransition } from "react";
import { ShoppingBag, Users, Truck, Star } from "@buleje/design-system/icons";
import { useInView } from "@/hooks/use-in-view";
import { useSettings } from "@/contexts/settings-context";

function parseStatValue(str: string): { value: number; suffix: string; decimals?: number } {
  const match = str.match(/^([\d.]+)\s*(.*)$/);
  if (!match) return { value: 0, suffix: str };
  const num = parseFloat(match[1]);
  const suf = match[2] || "";
  return { value: num, suffix: suf, decimals: match[1].includes(".") ? 1 : 0 };
}

const statMeta = [
  { icon: ShoppingBag, label: "Productos disponibles", accent: "var(--accent)", accentGradient: "linear-gradient(to bottom, rgba(45,106,79,0.12), transparent)" },
  { icon: Users, label: "Clientes satisfechos", accent: "#ff6b5b", accentGradient: "linear-gradient(to bottom, rgba(244,162,97,0.12), transparent)" },
  { icon: Truck, label: "Pedidos entregados", accent: "#60a5fa", accentGradient: "linear-gradient(to bottom, rgba(96,165,250,0.12), transparent)" },
  { icon: Star, label: "Calificación promedio", accent: "#ff8676", accentGradient: "linear-gradient(to bottom, rgba(251,191,36,0.12), transparent)" },
];

function AnimatedNumber({ target, decimals = 0, started }: { target: number; decimals?: number; started: boolean }) {
  const [current, setCurrent] = useState(0);
  const [done, setDone] = useState(false);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!started) return;
    const duration = 2000;
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setCurrent(target * eased);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setDone(true);
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, started]);

  return (
    <span className={done ? "animate-[statPop_0.3s_ease-out]" : ""}>
      {decimals > 0 ? current.toFixed(decimals) : Math.floor(current)}
    </span>
  );
}

export default function StatsCounter() {
  const [ref, inView] = useInView({ threshold: 0.3 });
  const [started, setStarted] = useState(false);
  const { homepage: hp } = useSettings();

  const stats = [
    { ...statMeta[0], ...parseStatValue(hp.statProducts) },
    { ...statMeta[1], ...parseStatValue(hp.statClients) },
    { ...statMeta[2], ...parseStatValue(hp.statOrders) },
    { ...statMeta[3], ...parseStatValue(hp.statRating) },
  ];

  // Don't render if no stats are configured
  const hasAnyStats = hp.statProducts || hp.statClients || hp.statOrders || hp.statRating;

  useEffect(() => {
    if (inView && !started) startTransition(() => setStarted(true));
  }, [inView, started]);

  if (!hasAnyStats) return null;

  return (
    <section className="relative py-16 sm:py-24 overflow-hidden bg-surface" ref={ref}>
      <style>{`
        @keyframes statPop {
          0%   { transform: scale(1); }
          50%  { transform: scale(1.08); }
          100% { transform: scale(1); }
        }
        @keyframes counterGlow {
          0%   { box-shadow: 0 0 0 0 rgba(45,106,79,0.15); }
          50%  { box-shadow: 0 0 30px 4px rgba(45,106,79,0.1); }
          100% { box-shadow: 0 0 0 0 rgba(45,106,79,0.15); }
        }
      `}</style>
      {/* Subtle background pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,var(--color-primary)/0.04,transparent_50%),radial-gradient(circle_at_70%_80%,var(--color-secondary)/0.04,transparent_50%)]" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12 sm:mb-16">
          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[var(--accent-ink)] dark:text-[var(--accent)] mb-3 bg-primary/8 rounded-full px-4 py-1.5">
            Nuestros números
          </span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-[var(--text-primary)]">
            La confianza de nuestros clientes en{" "}
            <span className="text-primary relative">
              números
              <svg className="absolute -bottom-2 left-0 w-full h-3 text-primary/30" viewBox="0 0 100 12" preserveAspectRatio="none">
                <path d="M0 8 Q25 0 50 6 Q75 12 100 4" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
              </svg>
            </span>
          </h2>
          <p className="mt-5 text-muted text-base sm:text-lg max-w-xl mx-auto">
            Cada día más familias confían en nosotros para sus compras del hogar
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {stats.map((stat, i) => (
            <div
              key={stat.label}
              style={started ? { animationDelay: `${i * 120}ms` } : undefined}
              className={`relative group rounded-2xl p-6 sm:p-8 text-center bg-[var(--surface-raised)] border border-gray-100/80 dark:border-[var(--rule-base)] hover:border-primary/25 hover:shadow-[var(--shadow-lg)] hover:-translate-y-0.5 transition-all duration-[var(--dur-base)] overflow-hidden ${
                started ? "animate-[fadeUp_0.5s_ease-out_both]" : "opacity-0"
              }`}
            >
              {/* Hover gradient */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-[var(--dur-slow)]" style={{ background: stat.accentGradient }} />

              <div className="relative z-10">
                <div
                  className="inline-flex items-center justify-center h-12 w-12 rounded-xl mb-5 group-hover:scale-110 transition-transform duration-[var(--dur-base)]"
                  style={{ background: stat.accent + "18", color: stat.accent }}
                >
                  <stat.icon className="h-5.5 w-5.5" />
                </div>
                <div className="text-4xl sm:text-5xl font-extrabold text-[var(--text-primary)] mb-1.5 font-mono tabular-nums tracking-tighter">
                  <AnimatedNumber target={stat.value} decimals={stat.decimals} started={started} />
                  <span style={{ color: stat.accent }}>{stat.suffix}</span>
                </div>
                <p className="text-sm text-muted font-medium">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
