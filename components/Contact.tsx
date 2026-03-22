"use client";

import { useMemo } from "react";
import { MapPin, Phone, Clock, MessageCircle } from "lucide-react";
import { useInView } from "@/hooks/use-in-view";
import { useSettings } from "@/contexts/settings-context";

const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function useStoreStatus() {
  const { deliveryConfig } = useSettings();

  return useMemo(() => {
    const now = new Date();
    const dayName = DAY_NAMES[now.getDay()];
    const todayConfig = deliveryConfig.hours.find(h => h.day === dayName);

    if (!todayConfig || !todayConfig.enabled) {
      return { status: "closed" as const, label: "Cerrado hoy", hoursText: "Cerrado" };
    }

    const [openH, openM] = todayConfig.open.split(":").map(Number);
    const [closeH, closeM] = todayConfig.close.split(":").map(Number);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const openMin = openH * 60 + openM;
    const closeMin = closeH * 60 + closeM;

    const formatTime = (t: string) => {
      const [h, m] = t.split(":").map(Number);
      const suffix = h >= 12 ? "pm" : "am";
      const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
      return `${h12}:${m.toString().padStart(2, "0")}${suffix}`;
    };

    const hoursText = `${formatTime(todayConfig.open)} - ${formatTime(todayConfig.close)}`;

    if (nowMin < openMin) {
      return { status: "closed" as const, label: `Abre a las ${formatTime(todayConfig.open)}`, hoursText };
    }
    if (nowMin >= closeMin) {
      return { status: "closed" as const, label: "Cerrado", hoursText };
    }
    if (closeMin - nowMin <= 30) {
      return { status: "closing" as const, label: `Cierra en ${closeMin - nowMin}min`, hoursText };
    }
    return { status: "open" as const, label: "Abierto ahora", hoursText };
  }, [deliveryConfig.hours]);
}

function buildScheduleText(hours: { day: string; open: string; close: string; enabled: boolean }[]) {
  const enabled = hours.filter(h => h.enabled);
  if (enabled.length === 0) return "Cerrado";
  const first = enabled[0];
  const allSame = enabled.every(h => h.open === first.open && h.close === first.close);
  const formatTime = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    const suffix = h >= 12 ? "pm" : "am";
    const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${h12}:${m.toString().padStart(2, "0")}${suffix}`;
  };
  if (allSame) {
    const days = enabled.map(h => h.day.slice(0, 3));
    return `${days[0]} - ${days[days.length - 1]}: ${formatTime(first.open)} - ${formatTime(first.close)}`;
  }
  return enabled.map(h => `${h.day.slice(0, 3)}: ${formatTime(h.open)}-${formatTime(h.close)}`).join(", ");
}

export default function Contact() {
  const [ref, inView] = useInView({ threshold: 0.1 });
  const { deliveryConfig } = useSettings();
  const storeStatus = useStoreStatus();

  const contactInfo = [
    {
      icon: MapPin,
      label: "Dirección",
      value: "Jr. Ucayali 450, Pucallpa, Ucayali",
    },
    {
      icon: Phone,
      label: "Teléfono",
      value: "916 409 675",
      href: "tel:+51916409675",
    },
    {
      icon: Clock,
      label: "Horario",
      value: buildScheduleText(deliveryConfig.hours),
      badge: storeStatus,
    },
    {
      icon: MessageCircle,
      label: "WhatsApp",
      value: "Escríbenos al WhatsApp",
      href: "https://wa.me/51916409675?text=Hola%2C%20necesito%20información",
    },
  ];

  return (
    <section id="contacto" className="py-20 sm:py-28 bg-surface" ref={ref}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary mb-3 bg-primary/8 rounded-full px-4 py-1.5">
            Contacto
          </span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-foreground">
            Delivery de Abarrotes en{" "}
            <span className="text-primary relative">
              Pucallpa
              <svg className="absolute -bottom-2 left-0 w-full h-3 text-primary/30" viewBox="0 0 100 12" preserveAspectRatio="none">
                <path d="M0 8 Q25 0 50 6 Q75 12 100 4" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
              </svg>
            </span>
          </h2>
          <p className="mt-4 text-lg text-muted max-w-2xl mx-auto">
            Haz tu pedido online o escríbenos por WhatsApp. Entrega rápida y segura. Pago con Yape o efectivo.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* Contact Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {contactInfo.map((item, i) => (
              <div
                key={item.label}
                style={inView ? { animationDelay: `${i * 100}ms` } : undefined}
                className={inView ? "animate-[fadeUp_0.4s_ease-out_both]" : "opacity-0"}
              >
                {item.href ? (
                  <a
                    href={item.href}
                    target={item.href.startsWith("http") ? "_blank" : undefined}
                    rel={item.href.startsWith("http") ? "noopener noreferrer" : undefined}
                    className="block bg-white dark:bg-card rounded-xl p-6 shadow-sm hover:shadow-lg hover:border-primary/20 transition-all duration-300 group"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                        <item.icon className="h-5 w-5" />
                      </div>
                      <span className="text-sm font-semibold text-muted">
                        {item.label}
                      </span>
                    </div>
                    <p className="font-semibold text-foreground group-hover:text-primary transition-colors">
                      {item.value}
                    </p>
                  </a>
                ) : (
                  <div className="bg-white dark:bg-card rounded-xl p-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <item.icon className="h-5 w-5" />
                      </div>
                      <span className="text-sm font-semibold text-muted">
                        {item.label}
                      </span>
                    </div>
                    <p className="font-semibold text-foreground">{item.value}</p>
                    {"badge" in item && item.badge && (
                      <span className={`inline-flex items-center gap-1 mt-2 text-[11px] font-bold px-2.5 py-1 rounded-full ${
                        item.badge.status === "open"
                          ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                          : item.badge.status === "closing"
                          ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 animate-pulse"
                          : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${
                          item.badge.status === "open" ? "bg-emerald-500" : item.badge.status === "closing" ? "bg-amber-500" : "bg-red-500"
                        }`} />
                        {item.badge.label}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* WhatsApp CTA Card */}
          <div
            className={`rounded-2xl p-8 sm:p-10 text-white shadow-xl ${
              inView ? "animate-[fadeUp_0.5s_ease-out_0.3s_both]" : "opacity-0"
            }`}
            style={{ background: "linear-gradient(135deg, #312e81, #245c43)" }}
          >
            <h3 className="text-2xl sm:text-3xl font-extrabold mb-4">
              ¿Listo para pedir?
            </h3>
            <p className="text-white/80 text-lg mb-8 leading-relaxed">
              Agrega productos a tu carrito y envía tu pedido directo por
              WhatsApp. ¡Es así de fácil!
            </p>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-sm font-bold shrink-0">
                  1
                </span>
                <p className="text-white/90">Elige tus productos desde nuestro catálogo</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-sm font-bold shrink-0">
                  2
                </span>
                <p className="text-white/90">Agrega al carrito la cantidad que necesites</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-sm font-bold shrink-0">
                  3
                </span>
                <p className="text-white/90">Envía tu pedido por WhatsApp y lo llevamos a tu puerta</p>
              </div>
            </div>

            <a
              href="#productos"
              className="inline-flex items-center justify-center gap-2 mt-8 rounded-xl bg-white px-8 py-4 text-base font-bold text-primary shadow-lg hover:bg-gray-50 active:scale-[0.98] transition-all duration-200"
            >
              🛒 Empezar a Comprar
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
