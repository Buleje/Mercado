"use client";

import Link from "next/link";
import { ArrowRight } from "@buleje/design-system/icons";
import { useInView } from "@/hooks/use-in-view";
import { getCategoryIcon } from "@/lib/category-icons";

const CATEGORIES = [
  { name: "Abarrotes",        id: "abarrotes",       count: 80,  gradient: "from-[var(--data-success-500)]/10 to-[var(--accent)]/5",  border: "border-emerald-200/60 dark:border-emerald-800/40", hoverBg: "hover:bg-emerald-50 dark:hover:bg-emerald-950/30" },
  { name: "Bebidas",           id: "bebidas",          count: 45,  gradient: "from-sky-500/10 to-[var(--data-success-500)]/5",       border: "border-sky-200/60 dark:border-sky-800/40",     hoverBg: "hover:bg-sky-50 dark:hover:bg-sky-950/30" },
  { name: "Limpieza",          id: "limpieza",         count: 30,  gradient: "from-violet-500/10 to-purple-500/5",  border: "border-violet-200/60 dark:border-violet-800/40", hoverBg: "hover:bg-violet-50 dark:hover:bg-violet-950/30" },
  { name: "Lácteos",           id: "lacteos",          count: 25,  gradient: "from-[var(--data-success-500)]/10 to-indigo-500/5",    border: "border-emerald-200/60 dark:border-emerald-800/40",   hoverBg: "hover:bg-emerald-50 dark:hover:bg-emerald-950/30" },
  { name: "Carnes",            id: "carnes",           count: 20,  gradient: "from-rose-500/10 to-[var(--data-error-500)]/5",       border: "border-rose-200/60 dark:border-rose-800/40",   hoverBg: "hover:bg-rose-50 dark:hover:bg-rose-950/30" },
  { name: "Frutas y Verduras", id: "frutas-verduras",  count: 35,  gradient: "from-lime-500/10 to-green-500/5",     border: "border-lime-200/60 dark:border-lime-800/40",   hoverBg: "hover:bg-lime-50 dark:hover:bg-lime-950/30" },
];

export default function PopularCategories() {
  const [ref, inView] = useInView({ threshold: 0.1 });

  return (
    <section ref={ref} className="py-16 sm:py-24 bg-surface relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60vw] h-[30vw] bg-primary/3 rounded-full blur-[100px] pointer-events-none" aria-hidden="true" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className={`text-center mb-10 sm:mb-14 transition-all duration-[var(--dur-slower)] ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary mb-3 bg-primary/8 rounded-full px-4 py-1.5">
            Categorías
          </span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-[var(--text-primary)]">
            Explora por{" "}
            <span className="text-primary relative">
              categoría
              <svg className="absolute -bottom-2 left-0 w-full h-3 text-primary/30" viewBox="0 0 100 12" preserveAspectRatio="none">
                <path d="M0 8 Q25 0 50 6 Q75 12 100 4" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
              </svg>
            </span>
          </h2>
          <p className="text-muted mt-4 text-sm sm:text-base max-w-lg mx-auto">
            Encuentra rápidamente lo que necesitas para tu hogar
          </p>
        </div>

        {/* Categories grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          {CATEGORIES.map((cat, i) => {
            const Icon = getCategoryIcon(cat.id);
            return (
              <Link
                key={cat.id}
                href={`/tienda?categoria=${cat.id}`}
                className={`group relative flex flex-col items-center gap-3 sm:gap-4 p-5 sm:p-7 rounded-2xl bg-linear-to-b ${cat.gradient} bg-[var(--surface-raised)] border ${cat.border} ${cat.hoverBg} hover:shadow-[var(--shadow-xl)] hover:shadow-primary/8 hover:-translate-y-1.5 active:scale-[0.98] transition-all duration-[var(--dur-base)] cursor-pointer overflow-hidden ${
                  inView ? "animate-[fadeUp_0.5s_ease-out_both]" : "opacity-0"
                }`}
                style={inView ? { animationDelay: `${100 + i * 70}ms` } : undefined}
              >
                {/* Decorative circle */}
                <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full bg-primary/[0.03] group-hover:bg-primary/[0.06] transition-colors duration-[var(--dur-slow)]" aria-hidden="true" />

                <Icon
                  size={64}
                  className="text-[var(--text-secondary)] group-hover:scale-115 group-hover:text-[var(--accent)] transition-all duration-[var(--dur-base)] relative z-10 sm:h-20 sm:w-20"
                />
                <div className="text-center relative z-10">
                  <p className="text-xs sm:text-sm font-bold text-[var(--text-primary)] leading-tight group-hover:text-primary transition-colors duration-[var(--dur-base)]">
                    {cat.name}
                  </p>
                  <p className="text-[length:var(--ts-2xs)] sm:text-xs text-muted mt-1 font-medium">
                    {cat.count}+ productos
                  </p>
                </div>
              </Link>
            );
          })}
        </div>

        {/* CTA */}
        <div className={`text-center mt-10 transition-all duration-[var(--dur-slower)] delay-300 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          <Link
            href="/tienda"
            className="group inline-flex items-center gap-2 text-primary hover:text-primary-dark font-bold text-sm transition-colors"
          >
            Ver todas las categorías
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </section>
  );
}
