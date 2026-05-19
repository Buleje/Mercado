"use client";

import { ShieldCheck, CreditCard, Smartphone, Banknote, QrCode } from "@buleje/design-system/icons";
import { useInView } from "@/hooks/use-in-view";

const METHODS = [
  {
    name: "Yape",
    desc: "Pago instantáneo",
    icon: Smartphone,
    iconBg: "bg-purple-500",
    accentGradient: "linear-gradient(to bottom, rgba(168,85,247,0.12), rgba(168,85,247,0.03))",
  },
  {
    name: "Plin",
    desc: "Transferencia rápida",
    icon: QrCode,
    iconBg: "bg-[var(--accent)]",
    accentGradient: "linear-gradient(to bottom, rgba(20,184,166,0.12), rgba(20,184,166,0.03))",
  },
  {
    name: "Efectivo",
    desc: "Contra entrega",
    icon: Banknote,
    iconBg: "bg-[var(--data-success-500)]",
    accentGradient: "linear-gradient(to bottom, rgba(16,185,129,0.12), rgba(16,185,129,0.03))",
  },
  {
    name: "Tarjeta",
    desc: "Visa / Mastercard",
    icon: CreditCard,
    iconBg: "bg-[var(--data-success-500)]",
    accentGradient: "linear-gradient(to bottom, rgba(59,130,246,0.12), rgba(59,130,246,0.03))",
  },
];

export default function PaymentMethods() {
  const [ref, inView] = useInView({ threshold: 0.15 });

  return (
    <section ref={ref} className="py-16 sm:py-24 bg-white dark:bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className={`text-center mb-12 sm:mb-16 transition-all duration-[var(--dur-slower)] ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary mb-3 bg-primary/8 rounded-full px-4 py-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            Pagos seguros
          </span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-[var(--text-primary)]">
            Métodos de{" "}
            <span className="text-primary relative">
              pago
              <svg className="absolute -bottom-2 left-0 w-full h-3 text-primary/30" viewBox="0 0 100 12" preserveAspectRatio="none">
                <path d="M0 8 Q25 0 50 6 Q75 12 100 4" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
              </svg>
            </span>
          </h2>
          <p className="mt-5 text-muted text-base sm:text-lg max-w-xl mx-auto">
            Paga como prefieras — siempre seguro y sin complicaciones
          </p>
        </div>

        {/* Payment methods grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {METHODS.map((method, i) => (
            <div
              key={method.name}
              className={`group relative flex flex-col items-center text-center bg-[var(--surface-raised)] rounded-2xl sm:rounded-3xl p-6 sm:p-8 hover:shadow-[var(--shadow-xl)] hover:-translate-y-1 transition-all duration-[var(--dur-slow)] overflow-hidden shadow-[var(--shadow-sm)] ${
                inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
              }`}
              style={{ transitionDelay: inView ? `${i * 100}ms` : "0ms" }}
            >
              {/* Hover gradient */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-[var(--dur-base)]" style={{ background: method.accentGradient }} />

              {/* Top accent */}
              <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-10 h-1 rounded-b-full ${method.iconBg} opacity-60`} />

              <div className="relative z-10">
                <div className={`${method.iconBg} rounded-2xl p-4 mb-5 shadow-[var(--shadow-lg)] group-hover:scale-110 transition-transform duration-[var(--dur-base)]`}>
                  <method.icon className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
                </div>
                <h3 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">{method.name}</h3>
                <p className="text-xs sm:text-sm text-muted mt-1">{method.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Trust note */}
        <p className={`text-center text-sm text-muted mt-8 transition-all duration-[var(--dur-slower)] delay-300 ${inView ? "opacity-100" : "opacity-0"}`}>
          <span className="inline-flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 text-[var(--data-success-700)] dark:text-emerald-400 font-semibold px-4 py-2 rounded-full">
            <ShieldCheck className="w-4 h-4" />
            Tus datos están protegidos. No almacenamos información de pago.
          </span>
        </p>
      </div>
    </section>
  );
}
