"use client";

import { useInView } from "@/hooks/use-in-view";
import { Award, Heart, Users, Calendar } from "@buleje/design-system/icons";
import Image from "next/image";

const stats = [
  { icon: Calendar, value: "15+", label: "Años de experiencia" },
  { icon: Users, value: "5,000+", label: "Familias atendidas" },
  { icon: Heart, value: "100%", label: "Productos frescos" },
  { icon: Award, value: "#1", label: "Bodega del barrio" },
];

export default function About() {
  const [ref, isInView] = useInView<HTMLElement>();

  return (
    <section id="nosotros" className="py-24 bg-white dark:bg-background" ref={ref}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left Content */}
          <div
            className={isInView ? "animate-[fadeUp_0.6s_ease-out_both]" : "opacity-0"}
          >
            <span className="inline-block rounded-full bg-primary/10 px-4 py-1.5 text-sm font-semibold text-primary mb-6">
              Nuestra Historia
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[var(--text-primary)] leading-tight mb-6">
              Tu tienda virtual de
              <br />
              <span className="text-primary">abarrotes a tu puerta</span>
            </h2>
            <p className="text-lg text-[var(--text-primary)]/70 leading-relaxed mb-6">
              Desde 2011, Buleje ha sido el corazón del barrio.
              Comenzamos como un pequeño negocio familiar con la visión de
              ofrecer productos de primera calidad a precios accesibles, con delivery rápido
              y pago fácil por Yape o efectivo.
            </p>
            <p className="text-lg text-[var(--text-primary)]/70 leading-relaxed mb-4">
              Hoy somos una tienda de consumo masivo con entrega a domicilio.
              Vendemos abarrotes, bebidas, golosinas, carne, pollo, productos de limpieza
              y artículos para el hogar. Seleccionamos cuidadosamente cada producto
              para que tú y tu familia disfruten siempre lo mejor. Compra desde casa,
              pedidos online las 24 horas.
            </p>
            <p className="text-lg text-[var(--text-primary)]/70 leading-relaxed mb-8">
              Nuestro compromiso: si recibes un producto en mal estado, te lo cambiamos
              o devolvemos tu dinero. Trabajamos con proveedores locales de Ucayali
              para garantizar frescura y los mejores precios de la zona.
            </p>

            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2 bg-muted rounded-full px-5 py-2.5">
                <div className="h-2 w-2 rounded-full bg-primary" />
                <span className="text-sm font-medium text-[var(--text-primary)]">
                  Delivery a domicilio
                </span>
              </div>
              <div className="flex items-center gap-2 bg-muted rounded-full px-5 py-2.5">
                <div className="h-2 w-2 rounded-full bg-secondary" />
                <span className="text-sm font-medium text-[var(--text-primary)]">
                  Pago con Yape
                </span>
              </div>
              <div className="flex items-center gap-2 bg-muted rounded-full px-5 py-2.5">
                <div className="h-2 w-2 rounded-full bg-primary-light" />
                <span className="text-sm font-medium text-[var(--text-primary)]">
                  Productos Frescos
                </span>
              </div>
            </div>
          </div>

          {/* Right - Image Placeholder + Stats */}
          <div
            className={isInView ? "animate-[fadeUp_0.6s_ease-out_0.2s_both]" : "opacity-0"}
          >
            {/* Store Photo */}
            <div className="relative mb-10">
              <div className="aspect-4/3 rounded-3xl overflow-hidden shadow-[var(--shadow-xl)]">
                <Image
                  src="https://images.unsplash.com/photo-1488459716781-31db52582fe9?w=800&h=600&fit=crop&q=80"
                  alt="Interior de Buleje con productos frescos y abarrotes"
                  width={800}
                  height={600}
                  loading="lazy"
                  unoptimized
                  className="w-full h-full object-cover"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                />
                <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(27,67,50,0.35), transparent)" }} />
              </div>
              {/* Floating Badge */}
              <div
                className={`absolute -bottom-5 -right-5 bg-secondary text-white rounded-2xl p-4 shadow-[var(--shadow-xl)] ${isInView ? "animate-[scaleIn_0.5s_ease-out_0.6s_both]" : "opacity-0"}`}
              >
                <p className="text-3xl font-bold">15+</p>
                <p className="text-xs font-medium opacity-90">años</p>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4">
              {stats.map((stat, i) => (
                <div
                  key={stat.label}
                  style={isInView ? { animationDelay: `${0.4 + i * 0.1}s` } : undefined}
                  className={`rounded-2xl bg-muted p-5 text-center hover:shadow-[var(--shadow-md)] transition-shadow ${isInView ? "animate-[fadeUp_0.5s_ease-out_both]" : "opacity-0"}`}
                >
                  <stat.icon className="h-6 w-6 text-primary mx-auto mb-2" />
                  <p className="text-2xl font-bold text-[var(--text-primary)]">
                    {stat.value}
                  </p>
                  <p className="text-xs text-[var(--text-primary)]/60 mt-1">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
