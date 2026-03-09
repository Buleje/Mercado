"use client";

import { Truck, BadgePercent, ShieldCheck, Leaf } from "lucide-react";
import { useInView } from "@/hooks/use-in-view";

const benefits = [
  {
    icon: Truck,
    title: "Delivery Rápido",
    description: "Entrega a domicilio en toda la zona urbana de Pucallpa. Recibe tus abarrotes, bebidas y productos en tu puerta.",
    iconBg: "bg-blue-500",
    accentGradient: "linear-gradient(to bottom, rgba(59,130,246,0.13), rgba(59,130,246,0.03))",
  },
  {
    icon: BadgePercent,
    title: "Pago con Yape o Efectivo",
    description: "Paga fácil con Yape o en efectivo contra entrega. Compra online sin complicaciones.",
    iconBg: "bg-amber-500",
    accentGradient: "linear-gradient(to bottom, rgba(245,158,11,0.13), rgba(245,158,11,0.03))",
  },
  {
    icon: ShieldCheck,
    title: "Calidad Garantizada",
    description: "Productos seleccionados y verificados: abarrotes, golosinas, carne, pollo y más para tu familia.",
    iconBg: "bg-emerald-500",
    accentGradient: "linear-gradient(to bottom, rgba(16,185,129,0.13), rgba(16,185,129,0.03))",
  },
  {
    icon: Leaf,
    title: "Productos Frescos",
    description: "Carne, pollo, frutas y verduras frescas todos los días. Víveres de calidad directo a tu hogar.",
    iconBg: "bg-teal-500",
    accentGradient: "linear-gradient(to bottom, rgba(20,184,166,0.13), rgba(20,184,166,0.03))",
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
              className={`group relative bg-white dark:bg-card rounded-2xl sm:rounded-3xl p-7 sm:p-8 text-center shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden ${
                inView ? "animate-[fadeUp_0.5s_ease-out_both]" : "opacity-0"
              }`}
            >
              {/* Hover gradient */}
              <div className="absolute inset-0 dark:opacity-50 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: benefit.accentGradient }} />

              {/* Top accent */}
              <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-10 h-1 rounded-b-full ${benefit.iconBg} opacity-60`} />

              <div className="relative z-10">
                <div
                  className={`inline-flex items-center justify-center h-14 w-14 sm:h-16 sm:w-16 rounded-2xl ${benefit.iconBg} shadow-lg mb-5 group-hover:scale-110 transition-transform duration-300`}
                >
                  <benefit.icon className="h-7 w-7 sm:h-8 sm:w-8 text-white" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">
                  {benefit.title}
                </h3>
                <p className="text-sm text-muted leading-relaxed">
                  {benefit.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
