"use client";

import Link from "next/link";
import { Truck, BadgePercent, ShieldCheck, Leaf, ArrowRight } from "lucide-react";
import { useInView } from "@/hooks/use-in-view";

const benefits = [
  {
    icon: Truck,
    title: "Delivery Rápido",
    description: "Entrega a domicilio en toda la zona urbana de Pucallpa. Recibe tus abarrotes, bebidas y productos en tu puerta.",
    accent: "#3b82f6",
    accentGradient: "linear-gradient(to bottom, rgba(59,130,246,0.10), transparent)",
  },
  {
    icon: BadgePercent,
    title: "Pago con Yape o Efectivo",
    description: "Paga fácil con Yape o en efectivo contra entrega. Compra online sin complicaciones.",
    accent: "#f59e0b",
    accentGradient: "linear-gradient(to bottom, rgba(245,158,11,0.10), transparent)",
  },
  {
    icon: ShieldCheck,
    title: "Calidad Garantizada",
    description: "Productos seleccionados y verificados: abarrotes, golosinas, carne, pollo y más para tu familia.",
    accent: "#6366f1",
    accentGradient: "linear-gradient(to bottom, rgba(99,102,241,0.10), transparent)",
  },
  {
    icon: Leaf,
    title: "Productos Frescos",
    description: "Carne, pollo, frutas y verduras frescas todos los días. Víveres de calidad directo a tu hogar.",
    accent: "#8b5cf6",
    accentGradient: "linear-gradient(to bottom, rgba(139,92,246,0.10), transparent)",
  },
];

export default function Benefits() {
  const [ref, inView] = useInView({ threshold: 0.1 });

  return (
    <section id="beneficios" className="py-20 sm:py-28 bg-surface" ref={ref}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary mb-3 bg-primary/8 rounded-full px-4 py-1.5">
            Nuestras ventajas
          </span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-foreground">
            ¿Por qué{" "}
            <span className="text-primary relative">
              elegirnos
              <svg className="absolute -bottom-2 left-0 w-full h-3 text-primary/30" viewBox="0 0 100 12" preserveAspectRatio="none">
                <path d="M0 8 Q25 0 50 6 Q75 12 100 4" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
              </svg>
            </span>
            ?
          </h2>
          <p className="mt-5 text-base sm:text-lg text-muted max-w-2xl mx-auto">
            Tu tienda virtual de productos de consumo en Pucallpa con delivery rápido y pago fácil.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
          {benefits.map((benefit, i) => (
            <div
              key={benefit.title}
              style={inView ? { animationDelay: `${i * 100}ms` } : undefined}
              className={`group relative bg-white dark:bg-card rounded-2xl p-7 sm:p-8 text-center border border-gray-100/80 dark:border-card-border hover:border-primary/25 hover:shadow-[0_8px_32px_rgba(99,102,241,0.07)] hover:-translate-y-0.5 transition-all duration-300 overflow-hidden ${
                inView ? "animate-[fadeUp_0.5s_ease-out_both]" : "opacity-0"
              }`}
            >
              {/* Hover gradient */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ background: benefit.accentGradient }} />

              <div className="relative z-10">
                <div
                  className="inline-flex items-center justify-center h-13 w-13 rounded-xl mb-5 group-hover:scale-110 transition-transform duration-300"
                  style={{ background: benefit.accent + "18", color: benefit.accent }}
                >
                  <benefit.icon className="h-6 w-6" />
                </div>
                <h3 className="text-base font-bold text-foreground mb-2">
                  {benefit.title}
                </h3>
                <p className="text-sm text-muted leading-relaxed">
                  {benefit.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className={`text-center mt-12 transition-all duration-700 delay-300 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          <Link
            href="/tienda"
            className="group inline-flex items-center gap-2.5 text-primary hover:text-primary-dark font-bold text-base transition-colors"
          >
            Empieza a comprar ahora
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </section>
  );
}
