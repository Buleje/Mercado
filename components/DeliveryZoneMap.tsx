"use client";

import { Truck, CheckCircle2, MapPin, Clock } from "@buleje/design-system/icons";
import { useInView } from "@/hooks/use-in-view";

const ZONES = [
  { name: "Centro", time: "20-30 min", free: true,  price: "Gratis", color: "bg-[var(--data-success-500)]", ring: "ring-[var(--data-success-500)]/20", circleColor: "rgba(45,106,79,0.25)" },
  { name: "San Fernando",       time: "30-40 min", free: true,  price: "Gratis", color: "bg-emerald-400", ring: "ring-emerald-400/20", circleColor: "rgba(52,211,153,0.20)" },
  { name: "Manantay",           time: "30-45 min", free: false, price: "S/3",    color: "bg-[var(--data-warning-500)]",   ring: "ring-[var(--data-warning-500)]/20",   circleColor: "rgba(245,158,11,0.18)" },
  { name: "Yarinacocha",        time: "40-60 min", free: false, price: "S/3",    color: "bg-orange-500",  ring: "ring-orange-500/20",  circleColor: "rgba(249,115,22,0.15)" },
  { name: "Campo Verde",        time: "50-70 min", free: false, price: "S/5",    color: "bg-[var(--data-error-500)]",     ring: "ring-[var(--data-error-500)]/20",     circleColor: "rgba(239,68,68,0.12)" },
];

export default function DeliveryZoneMap() {
  const [ref, inView] = useInView({ threshold: 0.1 });

  return (
    <section ref={ref} className="py-16 sm:py-24 bg-surface">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className={`text-center mb-12 sm:mb-16 transition-all duration-[var(--dur-slower)] ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[var(--accent-ink)] dark:text-[var(--accent)] mb-3 bg-primary/8 rounded-full px-4 py-1.5">
            <Truck className="w-3.5 h-3.5" />
            Delivery
          </span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-[var(--text-primary)]">
            Zonas de{" "}
            <span className="text-primary relative">
              entrega
              <svg className="absolute -bottom-2 left-0 w-full h-3 text-primary/30" viewBox="0 0 100 12" preserveAspectRatio="none">
                <path d="M0 8 Q25 0 50 6 Q75 12 100 4" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
              </svg>
            </span>
          </h2>
          <p className="mt-5 text-muted text-base sm:text-lg max-w-xl mx-auto">
            Cobertura de delivery y alrededores
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Zone cards */}
          <div className="space-y-3">
            {ZONES.map((zone, i) => (
              <div
                key={zone.name}
                className={`group flex items-center gap-4 bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl px-5 py-4 hover:shadow-[var(--shadow-lg)] hover:-translate-y-0.5 transition-all duration-[var(--dur-slow)] ${
                  inView ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-6"
                }`}
                style={{ transitionDelay: inView ? `${i * 80}ms` : "0ms" }}
              >
                <div className={`w-4 h-4 rounded-full ${zone.color} shrink-0 ring-4 ${zone.ring}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[var(--text-primary)]">{zone.name}</p>
                  <p className="flex items-center gap-1 text-xs text-muted mt-0.5">
                    <Clock className="w-3 h-3" />
                    {zone.time}
                  </p>
                </div>
                {zone.free ? (
                  <span className="flex items-center gap-1.5 text-xs font-bold text-white bg-[var(--data-success-500)] px-3 py-1.5 rounded-full shadow-[var(--shadow-sm)]">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Gratis
                  </span>
                ) : (
                  <span className="text-sm font-bold text-[var(--text-primary)] bg-gray-100 dark:bg-surface px-3 py-1.5 rounded-full">{zone.price}</span>
                )}
              </div>
            ))}

            {/* CTA */}
            <div className="mt-4 p-4 bg-primary/5 dark:bg-primary/10 rounded-2xl border border-primary/10">
              <p className="text-sm text-[var(--text-primary)] font-semibold">
                🚚 <strong className="text-primary">Delivery gratis</strong> en compras mayores a S/50 para Centro y San Fernando
              </p>
            </div>
          </div>

          {/* Visual map */}
          <div className={`relative rounded-3xl p-8 overflow-hidden transition-all duration-[var(--dur-slower)] ${inView ? "opacity-100 scale-100" : "opacity-0 scale-95"}`} style={{ background: "linear-gradient(135deg, rgba(45,106,79,0.05), rgba(45,106,79,0.08), rgba(52,211,153,0.05))" }}>
            {/* Decorative dots */}
            <div className="absolute top-4 right-4 w-16 h-16 opacity-10" style={{ backgroundImage: "radial-gradient(circle, var(--color-primary) 1px, transparent 1px)", backgroundSize: "8px 8px" }} />
            <div className="absolute bottom-4 left-4 w-16 h-16 opacity-10" style={{ backgroundImage: "radial-gradient(circle, var(--color-primary) 1px, transparent 1px)", backgroundSize: "8px 8px" }} />

            <div className="relative aspect-square max-w-72 mx-auto">
              {[...ZONES].reverse().map((zone, i) => {
                const size = 100 - i * 15;
                return (
                  <div
                    key={zone.name}
                    className="absolute rounded-full border-2 transition-all duration-[var(--dur-slower)]"
                    style={{
                      width: `${size}%`,
                      height: `${size}%`,
                      top: `${(100 - size) / 2}%`,
                      left: `${(100 - size) / 2}%`,
                      borderColor: zone.circleColor,
                      backgroundColor: zone.circleColor,
                    }}
                  />
                );
              })}
              {/* Center pin */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center">
                <div className="bg-primary text-white rounded-full p-3 shadow-[var(--shadow-xl)] shadow-primary/30 ring-4 ring-primary/20">
                  <MapPin className="w-6 h-6" />
                </div>
                <span className="text-xs font-bold text-primary mt-2 whitespace-nowrap bg-[var(--surface-raised)] px-2 py-0.5 rounded-full shadow-[var(--shadow-sm)]">Buleje</span>
              </div>
            </div>

            {/* Legend with prices */}
            <div className="flex flex-wrap justify-center gap-4 mt-6">
              {ZONES.map((z) => (
                <div key={z.name} className="flex items-center gap-1.5">
                  <div className={`w-2.5 h-2.5 rounded-full ${z.color}`} />
                  <span className="text-xs font-medium text-muted">
                    {z.name} ({z.price})
                  </span>
                </div>
              ))}
            </div>

            {/* Phone CTA */}
            <p className="text-center text-xs text-muted mt-4">
              No estas en la zona? Llamanos al{" "}
              <a href="tel:+51929340532" className="font-bold text-primary hover:underline">
                929 340 532
              </a>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
