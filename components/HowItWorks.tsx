"use client";

import Link from "next/link";
import { ShoppingCart, CreditCard, Truck, ArrowRight } from "lucide-react";
import { useInView } from "@/hooks/use-in-view";

const STEPS = [
  {
    num: 1,
    icon: ShoppingCart,
    title: "Elige tus productos",
    desc: "Explora nuestro catálogo con más de 500 productos y agrega al carrito lo que necesites.",
    color: "#3b82f6",
  },
  {
    num: 2,
    icon: CreditCard,
    title: "Paga fácil",
    desc: "Paga con Yape o en efectivo contra entrega. Sin complicaciones ni tarjetas.",
    color: "#f59e0b",
  },
  {
    num: 3,
    icon: Truck,
    title: "Recibe en tu puerta",
    desc: "Te llevamos tu pedido a domicilio en Pucallpa en menos de 30 minutos.",
    color: "#3b82f6",
  },
];

export default function HowItWorks() {
  const [ref, inView] = useInView({ threshold: 0.1 });

  return (
    <section ref={ref} className="py-20 sm:py-28 bg-background relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60vw] h-[30vw] bg-primary/3 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className={`text-center mb-16 transition-all duration-700 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary mb-3 bg-primary/8 rounded-full px-4 py-1.5">
            Así de fácil
          </span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-foreground">
            ¿Cómo{" "}
            <span className="text-primary relative">
              funciona
              <svg className="absolute -bottom-2 left-0 w-full h-3 text-primary/30" viewBox="0 0 100 12" preserveAspectRatio="none">
                <path d="M0 8 Q25 0 50 6 Q75 12 100 4" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
              </svg>
            </span>
            ?
          </h2>
          <p className="mt-5 text-base sm:text-lg text-muted max-w-2xl mx-auto">
            Comprar en Bodega San Martín es rápido, seguro y sin complicaciones.
          </p>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-6 relative">
          {/* Connecting line on desktop */}
          <div className="hidden md:block absolute top-16 left-[20%] right-[20%] h-0.5 bg-linear-to-r from-indigo-200 via-amber-200 to-blue-200 dark:from-indigo-900 dark:via-amber-900 dark:to-blue-900" />

          {STEPS.map((step, i) => (
            <div
              key={step.num}
              className={`relative flex flex-col items-center text-center transition-all duration-700 ${
                inView ? "animate-[fadeUp_0.5s_ease-out_both]" : "opacity-0"
              }`}
              style={inView ? { animationDelay: `${i * 150}ms` } : undefined}
            >
              {/* Number circle */}
              <div
                className="relative flex items-center justify-center h-20 w-20 sm:h-24 sm:w-24 rounded-3xl mb-6 shadow-lg"
                style={{ background: step.color + "15" }}
              >
                <step.icon className="h-9 w-9 sm:h-10 sm:w-10" style={{ color: step.color }} />
                <span
                  className="absolute -top-2 -right-2 flex items-center justify-center h-8 w-8 rounded-full text-sm font-black text-white shadow-md"
                  style={{ background: step.color }}
                >
                  {step.num}
                </span>
              </div>

              <h3 className="text-lg sm:text-xl font-bold text-foreground mb-2">{step.title}</h3>
              <p className="text-sm text-muted leading-relaxed max-w-xs">{step.desc}</p>

              {/* Arrow between steps (mobile) */}
              {i < STEPS.length - 1 && (
                <div className="md:hidden flex justify-center my-4">
                  <ArrowRight className="h-5 w-5 text-muted/40 rotate-90" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className={`text-center mt-14 transition-all duration-700 delay-300 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          <Link
            href="/tienda"
            className="group inline-flex items-center gap-2.5 bg-primary hover:bg-primary-dark text-white font-bold text-sm rounded-xl px-7 py-3.5 shadow-lg shadow-primary/20 hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5"
          >
            Empezar a comprar
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </section>
  );
}
