"use client";

import { useState, useEffect, startTransition } from "react";
import { Zap, TrendingUp, Users, Star } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useInView } from "@/hooks/use-in-view";

interface Stat {
  icon: typeof Zap;
  value: string;
  label: string;
  color: string;
}

const STATS: Stat[] = [
  { icon: Users, value: "2,500+", label: "Familias confían en nosotros", color: "text-[var(--data-success-600)]" },
  { icon: TrendingUp, value: "15,000+", label: "Pedidos entregados", color: "text-[var(--data-success-600)]" },
  { icon: Star, value: "4.8", label: "Calificación promedio", color: "text-[var(--data-warning-500)]" },
  { icon: Zap, value: "30 min", label: "Tiempo de entrega promedio", color: "text-primary" },
];

export default function StoreStats() {
  const [ref, inView] = useInView({ threshold: 0.3 });
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    if (inView && !animated) {
      startTransition(() => setAnimated(true));
    }
  }, [inView, animated]);

  return (
    <section
      ref={ref}
      className="py-6 sm:py-8 bg-surface dark:bg-background"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {STATS.map((stat, i) => {
            const Icon = stat.icon;
            return (
              <div
                key={i}
                className={cn(
                  "flex items-center gap-3 bg-white dark:bg-card rounded-xl p-4 border border-gray-100 dark:border-card-border shadow-sm",
                  animated
                    ? "animate-[fadeUp_0.5s_ease-out_both]"
                    : "opacity-0"
                )}
                style={animated ? { animationDelay: `${i * 100}ms` } : undefined}
              >
                <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center bg-gray-50 dark:bg-surface shrink-0")}>
                  <Icon className={cn("h-5 w-5", stat.color)} />
                </div>
                <div>
                  <p className="text-lg sm:text-xl font-extrabold text-foreground leading-none">
                    {stat.value}
                  </p>
                  <p className="text-[length:var(--ts-2xs)] sm:text-xs text-muted leading-tight mt-0.5">
                    {stat.label}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
