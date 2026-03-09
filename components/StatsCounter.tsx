"use client";

import { useEffect, useRef, useState, startTransition } from "react";
import { ShoppingBag, Users, Truck, Star } from "lucide-react";
import { useInView } from "@/hooks/use-in-view";

const stats = [
  {
    icon: ShoppingBag, value: 500, suffix: "+", label: "Productos disponibles",
    iconBg: "bg-emerald-500", iconColor: "text-white",
    accentGradient: "linear-gradient(to bottom, rgba(16,185,129,0.18), rgba(16,185,129,0.04))",
  },
  {
    icon: Users, value: 1200, suffix: "+", label: "Clientes satisfechos",
    iconBg: "bg-amber-500", iconColor: "text-white",
    accentGradient: "linear-gradient(to bottom, rgba(245,158,11,0.18), rgba(245,158,11,0.04))",
  },
  {
    icon: Truck, value: 3500, suffix: "+", label: "Pedidos entregados",
    iconBg: "bg-blue-500", iconColor: "text-white",
    accentGradient: "linear-gradient(to bottom, rgba(59,130,246,0.18), rgba(59,130,246,0.04))",
  },
  {
    icon: Star, value: 4.8, suffix: "/5", label: "Calificación promedio", decimals: 1,
    iconBg: "bg-rose-500", iconColor: "text-white",
    accentGradient: "linear-gradient(to bottom, rgba(244,63,94,0.18), rgba(244,63,94,0.04))",
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
              className={`relative group rounded-2xl sm:rounded-3xl p-6 sm:p-8 text-center bg-white dark:bg-card shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden ${
                started ? "animate-[fadeUp_0.5s_ease-out_both]" : "opacity-0"
              }`}
            >
              {/* Colored gradient accent */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: stat.accentGradient }} />

              {/* Top accent line */}
              <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-12 h-1 rounded-b-full ${stat.iconBg} opacity-60`} />

              <div className="relative z-10">
                <div className={`inline-flex items-center justify-center h-14 w-14 sm:h-16 sm:w-16 rounded-2xl ${stat.iconBg} mb-5 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                  <stat.icon className={`h-7 w-7 sm:h-8 sm:w-8 ${stat.iconColor}`} />
                </div>
                <div className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-foreground mb-2 tabular-nums tracking-tight">
                  <AnimatedNumber target={stat.value} decimals={stat.decimals} started={started} />
                  <span className="text-primary">{stat.suffix}</span>
                </div>
                <p className="text-sm sm:text-base text-muted font-medium">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
