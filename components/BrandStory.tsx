"use client";

import { Heart, Star, Truck, Users } from "lucide-react";
import { useInView } from "@/hooks/use-in-view";

const MILESTONES = [
  {
    year: "2015",
    title: "Nace Bodega San Martín",
    desc: "Abrimos nuestra primera tienda en el Jr. Ucayali con solo 50 productos.",
    icon: Heart,
    color: "bg-red-500",
  },
  {
    year: "2018",
    title: "Más de 500 familias",
    desc: "Nos convertimos en la bodega de confianza del barrio con productos frescos cada día.",
    icon: Users,
    color: "bg-blue-500",
  },
  {
    year: "2021",
    title: "Delivery por WhatsApp",
    desc: "Comenzamos a entregar pedidos a domicilio durante la pandemia.",
    icon: Truck,
    color: "bg-emerald-500",
  },
  {
    year: "2024",
    title: "Tienda online",
    desc: "Lanzamos nuestra plataforma digital para que pidas desde cualquier lugar de Pucallpa.",
    icon: Star,
    color: "bg-amber-500",
  },
];

export default function BrandStory() {
  const [ref, inView] = useInView({ threshold: 0.1 });

  return (
    <section ref={ref} className="py-14 sm:py-20 bg-background overflow-hidden">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className={`text-center mb-12 transition-all duration-700 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          <span className="text-sm font-bold text-primary uppercase tracking-wider">Nuestra historia</span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground mt-2">
            De la esquina del barrio a tu puerta
          </h2>
          <p className="text-sm text-muted mt-2 max-w-lg mx-auto">
            Más de 9 años llevando productos frescos y de calidad a las familias de Pucallpa
          </p>
        </div>

        {/* Timeline */}
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-5 sm:left-1/2 top-0 bottom-0 w-0.5 bg-border sm:-translate-x-px" />

          <div className="space-y-8 sm:space-y-12">
            {MILESTONES.map((m, i) => {
              const Icon = m.icon;
              const isLeft = i % 2 === 0;

              return (
                <div
                  key={m.year}
                  className={`relative flex items-start gap-4 sm:gap-0 transition-all duration-600 ${
                    inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
                  }`}
                  style={{ transitionDelay: inView ? `${i * 150}ms` : "0ms" }}
                >
                  {/* Mobile: icon on left, content on right */}
                  {/* Desktop: alternating sides */}

                  {/* Left content (desktop) */}
                  <div className={`hidden sm:block w-1/2 pr-8 ${isLeft ? "text-right" : ""}`}>
                    {isLeft && (
                      <div>
                        <span className="text-xs font-extrabold text-primary">{m.year}</span>
                        <h3 className="text-base font-bold text-foreground mt-0.5">{m.title}</h3>
                        <p className="text-sm text-muted mt-1">{m.desc}</p>
                      </div>
                    )}
                  </div>

                  {/* Center dot */}
                  <div className={`relative z-10 shrink-0 sm:absolute sm:left-1/2 sm:-translate-x-1/2 ${m.color} text-white rounded-full w-10 h-10 flex items-center justify-center shadow-lg`}>
                    <Icon className="w-4 h-4" />
                  </div>

                  {/* Right content (desktop) / Main content (mobile) */}
                  <div className={`flex-1 sm:w-1/2 sm:pl-8 ${!isLeft ? "" : "sm:opacity-0 sm:pointer-events-none"}`}>
                    {/* Always show on mobile */}
                    <div className="sm:hidden">
                      <span className="text-xs font-extrabold text-primary">{m.year}</span>
                      <h3 className="text-base font-bold text-foreground mt-0.5">{m.title}</h3>
                      <p className="text-sm text-muted mt-1">{m.desc}</p>
                    </div>
                    {/* Desktop right side */}
                    {!isLeft && (
                      <div className="hidden sm:block">
                        <span className="text-xs font-extrabold text-primary">{m.year}</span>
                        <h3 className="text-base font-bold text-foreground mt-0.5">{m.title}</h3>
                        <p className="text-sm text-muted mt-1">{m.desc}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
