"use client";

import { useEffect, useRef } from "react";
import { Search, ShoppingBag, Truck, Smile } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  icon: React.ElementType;
  title: string;
  desc: string;
  kicker: string;
  accent?: string;
}

const STEPS: Step[] = [
  {
    icon: Search,
    title: "Buscá lo que necesitás",
    desc: "Entrá al marketplace y encontrá bodegas cerca. Filtrá por zona, categoría o simplemente busca el producto.",
    kicker: "Descubrí",
  },
  {
    icon: ShoppingBag,
    title: "Armá tu pedido",
    desc: "Agregá productos de varias tiendas al mismo carrito. Aplicá cupones si tenés. Pagás al recibir o con Yape.",
    kicker: "Seleccioná",
  },
  {
    icon: Truck,
    title: "Nosotros te lo llevamos",
    desc: "El repartidor retira en cada tienda y te lo trae. Seguí el pedido en vivo desde tu celular.",
    kicker: "Entregamos",
  },
  {
    icon: Smile,
    title: "Recibí y listo",
    desc: "Disfrutá tus productos. Puntuá al repartidor y a las tiendas. Sumás puntos para tu próxima compra.",
    kicker: "Disfrutá",
  },
];

export default function ScrollyHowItWorks() {
  const sectionRef = useRef<HTMLElement>(null);
  const stepsRef = useRef<HTMLDivElement[]>([]);
  const pictureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) return;

    let cleanup: (() => void) | undefined;

    import("gsap").then(({ gsap }) => {
      import("gsap/ScrollTrigger").then(({ ScrollTrigger }) => {
        gsap.registerPlugin(ScrollTrigger);

        const section = sectionRef.current;
        if (!section) return;

        const steps = stepsRef.current.filter(Boolean);
        const picture = pictureRef.current;

        // Animar entrada de cada step
        const entryTriggers = steps.map((el) =>
          gsap.fromTo(
            el,
            { opacity: 0.25, x: -24 },
            {
              opacity: 1,
              x: 0,
              duration: 0.5,
              ease: "power2.out",
              scrollTrigger: {
                trigger: el,
                start: "top 75%",
                end: "top 40%",
                scrub: 0.5,
              },
            },
          ),
        );

        // Pin la "foto" lateral (desktop) + cambiar gradiente según step activo
        let pinTrigger: ScrollTrigger | null = null;
        if (picture && window.innerWidth >= 1024) {
          pinTrigger = ScrollTrigger.create({
            trigger: section,
            start: "top top+=80",
            end: "bottom bottom",
            pin: picture,
            pinSpacing: false,
          });
        }

        // Cambiar numero + título + kicker al pasar cada step
        const activeTriggers = steps.map((el, idx) =>
          ScrollTrigger.create({
            trigger: el,
            start: "top center",
            end: "bottom center",
            onEnter: () => setActive(idx),
            onEnterBack: () => setActive(idx),
          }),
        );

        function setActive(idx: number) {
          if (!picture) return;
          const num = picture.querySelector("[data-num]") as HTMLElement | null;
          const kicker = picture.querySelector("[data-kicker]") as HTMLElement | null;
          const title = picture.querySelector("[data-title]") as HTMLElement | null;
          if (num) {
            gsap.fromTo(
              num,
              { y: 20, opacity: 0 },
              { y: 0, opacity: 1, duration: 0.5, ease: "power2.out" },
            );
            num.textContent = String(idx + 1).padStart(2, "0");
          }
          if (kicker) kicker.textContent = STEPS[idx].kicker;
          if (title) title.textContent = STEPS[idx].title;
        }

        cleanup = () => {
          entryTriggers.forEach((t) => t.scrollTrigger?.kill());
          activeTriggers.forEach((t) => t.kill());
          pinTrigger?.kill();
        };
      });
    });

    return () => {
      cleanup?.();
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      aria-labelledby="como-funciona-title"
      className="relative py-20 sm:py-24 bg-white dark:bg-gray-950"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-bold uppercase tracking-wide">
            Así de simple
          </span>
          <h2
            id="como-funciona-title"
            className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 dark:text-white"
          >
            ¿Cómo funciona?
          </h2>
          <p className="mt-3 text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
            4 pasos y tu pedido está en la puerta de tu casa.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20">
          {/* Steps (col izquierda) */}
          <div className="space-y-24 lg:space-y-48">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.title}
                  ref={(el) => {
                    if (el) stepsRef.current[i] = el;
                  }}
                  className="max-w-md"
                >
                  <div
                    className={cn(
                      "inline-flex items-center justify-center h-12 w-12 rounded-2xl",
                      "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800",
                      step.accent,
                    )}
                  >
                    <Icon className="h-6 w-6" />
                  </div>
                  <p className="mt-4 text-xs font-bold text-gray-400 uppercase tracking-wide">
                    Paso {i + 1} de {STEPS.length}
                  </p>
                  <h3 className="mt-1 text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white leading-tight">
                    {step.title}
                  </h3>
                  <p className="mt-3 text-gray-500 dark:text-gray-400 leading-relaxed">
                    {step.desc}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Picture fija editorial (col derecha, pin en desktop) */}
          <div className="hidden lg:block relative">
            <div
              ref={pictureRef}
              className="h-[60vh] flex items-center justify-center"
            >
              <div className="relative w-full max-w-md aspect-[4/5] rounded-2xl overflow-hidden bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-10 flex flex-col">
                {/* Grid sutil */}
                <div
                  aria-hidden="true"
                  className="absolute inset-0 opacity-[0.035] dark:opacity-[0.06] pointer-events-none"
                  style={{
                    backgroundImage:
                      "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
                    backgroundSize: "32px 32px",
                  }}
                />

                <div className="relative flex items-start justify-between">
                  <span
                    data-kicker
                    className="text-[11px] font-bold uppercase tracking-[0.25em] text-gray-500 dark:text-gray-400"
                  >
                    {STEPS[0].kicker}
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400 tabular-nums">
                    de 04
                  </span>
                </div>

                <div className="relative flex-1 flex items-center justify-center">
                  <span
                    data-num
                    className="font-extrabold text-gray-900 dark:text-white leading-none tabular-nums tracking-tighter"
                    style={{ fontSize: "280px" }}
                  >
                    {String(1).padStart(2, "0")}
                  </span>
                </div>

                <div className="relative pt-6 border-t border-gray-200 dark:border-gray-800">
                  <p
                    data-title
                    className="text-lg font-extrabold tracking-tight text-gray-900 dark:text-white"
                  >
                    {STEPS[0].title}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
