"use client";

import { useEffect, useRef, useState, startTransition } from "react";
import { ShoppingBag, Users, Truck, Star } from "lucide-react";
import { useInView } from "@/hooks/use-in-view";

const stats = [
  {
    icon: ShoppingBag, value: 500, suffix: "+", label: "Productos disponibles",
    accent: "#6366f1",
    accentGradient: "linear-gradient(to bottom, rgba(99,102,241,0.12), transparent)",
  },
  {
    icon: Users, value: 1200, suffix: "+", label: "Clientes satisfechos",
    accent: "#f59e0b",
    accentGradient: "linear-gradient(to bottom, rgba(245,158,11,0.12), transparent)",
  },
  {
    icon: Truck, value: 3500, suffix: "+", label: "Pedidos entregados",
    accent: "#3b82f6",
    accentGradient: "linear-gradient(to bottom, rgba(59,130,246,0.12), transparent)",
  },
  {
    icon: Star, value: 4.8, suffix: "/5", label: "Calificación promedio", decimals: 1,
    accent: "#f43f5e",
    accentGradient: "linear-gradient(to bottom, rgba(244,63,94,0.12), transparent)",
  },
];

function AnimatedNumber({ target, decimals = 0, started }: { target: number; decimals?: number; started: boolean }) {
  const [current, setCurrent] = useState(0);
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
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, started]);

  return <>{decimals > 0 ? current.toFixed(decimals) : Math.floor(current)}</>;
}

export default function StatsCounter() {
  const [ref, inView] = useInView({ threshold: 0.3 });
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (inView && !started) startTransition(() => setStarted(true));
  }, [inView, started]);

  return (
    <section className="relative py-16 sm:py-24 overflow-hidden bg-surface" ref={ref}>
      {/* Subtle background pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,var(--color-primary)/0.04,transparent_50%),radial-gradient(circle_at_70%_80%,var(--color-secondary)/0.04,transparent_50%)]" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12 sm:mb-16">
          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary mb-3 bg-primary/8 rounded-full px-4 py-1.5">
            Nuestros números
          </span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-foreground">
            La confianza de Pucallpa en{" "}
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
              className={`relative group rounded-2xl p-6 sm:p-8 text-center bg-white dark:bg-card border border-gray-100/80 dark:border-card-border hover:border-primary/25 hover:shadow-[0_8px_32px_rgba(99,102,241,0.08)] hover:-translate-y-0.5 transition-all duration-300 overflow-hidden ${
                started ? "animate-[fadeUp_0.5s_ease-out_both]" : "opacity-0"
              }`}
            >
              {/* Hover gradient */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ background: stat.accentGradient }} />

              <div className="relative z-10">
                <div
                  className="inline-flex items-center justify-center h-12 w-12 rounded-xl mb-5 group-hover:scale-110 transition-transform duration-300"
                  style={{ background: stat.accent + "18", color: stat.accent }}
                >
                  <stat.icon className="h-5.5 w-5.5" />
                </div>
                <div className="text-4xl sm:text-5xl font-black text-foreground mb-1.5 tabular-nums tracking-tighter">
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
