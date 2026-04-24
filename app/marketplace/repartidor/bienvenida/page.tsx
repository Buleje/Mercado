"use client";

import { Truck, CheckCircle, Clock, Phone, MapPin, Shield } from "@buleje/design-system/icons";
import Link from "next/link";

const steps = [
  {
    n: "01",
    title: "Espera tu primer pedido",
    desc: "Cuando un cliente haga un pedido en tu zona, recibirás una notificación por WhatsApp con los detalles: dirección de recojo, dirección de entrega y productos.",
  },
  {
    n: "02",
    title: "Recoge el pedido",
    desc: "Ve a la bodega indicada y recoge los productos. Verifica que todo coincida con la lista del pedido antes de salir.",
  },
  {
    n: "03",
    title: "Entrega al cliente",
    desc: "Lleva el pedido a la dirección del cliente. Si es pago contra entrega, cobra el monto indicado. Sé amable y puntual.",
  },
  {
    n: "04",
    title: "Recibe tu pago",
    desc: "Tu tarifa de entrega se acumula y se paga semanalmente. Puedes ver tu historial de entregas y ganancias en tu perfil.",
  },
];

const cards = [
  { Icon: Clock, title: "Horario flexible", desc: "Tú decides cuándo trabajar" },
  { Icon: MapPin, title: "Tu zona", desc: "Entregas cerca de ti" },
  { Icon: Shield, title: "Soporte 24/7", desc: "Siempre te ayudamos" },
];

const tips = [
  "Mantén tu teléfono cargado y con datos para recibir pedidos",
  "Verifica los productos antes de salir de la tienda",
  "Trata los productos con cuidado, especialmente los frágiles",
  "Sé puntual y amable — los clientes califican tu servicio",
  "Cualquier problema, contacta a soporte por WhatsApp",
];

export default function BienvenidaRepartidorPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      {/* Hero editorial dark */}
      <section
        className="relative overflow-hidden px-4 pt-20 pb-16 sm:pt-24 sm:pb-20 text-center"
        style={{ background: "#060a0d" }}
      >
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 h-80 w-80 rounded-full bg-white/5 blur-[100px]" />
        </div>
        <div className="relative mx-auto max-w-2xl">
          <span className="inline-flex items-center justify-center h-12 w-12 rounded-lg border border-white/15 bg-white/5 text-white mb-6">
            <Truck className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </span>
          <span className="block text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-white/55 mb-3">
            Onboarding repartidor
          </span>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.02em] text-white leading-[1.05]">
            Bienvenido al equipo
          </h1>
          <p className="mt-4 text-base sm:text-lg text-white/60 max-w-xl mx-auto leading-relaxed">
            Ya eres parte de la red de repartidores de Buleje. Así empiezas.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-3xl px-4 py-16 sm:py-20">
        {/* Steps */}
        <div className="space-y-3">
          {steps.map((s) => (
            <div
              key={s.n}
              className="group rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 hover:border-gray-900 dark:hover:border-gray-500 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.2em] text-gray-400 tabular-nums">
                    Paso {s.n}
                  </span>
                  <h3 className="mt-2 text-lg font-extrabold tracking-tight text-gray-900 dark:text-white">
                    {s.title}
                  </h3>
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                    {s.desc}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Info cards */}
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {cards.map((c) => {
            const CIcon = c.Icon;
            return (
              <div
                key={c.title}
                className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4"
              >
                <div className="h-9 w-9 rounded-lg bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 flex items-center justify-center text-gray-700 dark:text-gray-200 shrink-0">
                  <CIcon className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                </div>
                <div>
                  <p className="text-sm font-extrabold tracking-tight text-gray-900 dark:text-white">{c.title}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{c.desc}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Tips */}
        <div className="mt-8 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40 p-6">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-extrabold tracking-tight text-gray-900 dark:text-white">
            <CheckCircle className="h-4 w-4 text-gray-500 dark:text-gray-400" strokeWidth={1.75} aria-hidden />
            Consejos para ser un buen repartidor
          </h3>
          <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
            {tips.map((tip) => (
              <li key={tip} className="flex items-start gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gray-400" />
                {tip}
              </li>
            ))}
          </ul>
        </div>

        {/* Contact */}
        <div className="mt-10 text-center">
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">¿Tienes dudas? Escríbenos.</p>
          <a
            href="https://wa.me/51999999999?text=Hola%2C%20soy%20repartidor%20nuevo%20y%20tengo%20una%20pregunta"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-gray-900 dark:bg-white px-6 py-3 text-sm font-bold text-white dark:text-gray-900 transition-colors hover:bg-gray-800 dark:hover:bg-gray-100"
          >
            <Phone className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            WhatsApp de Soporte
          </a>
        </div>

        {/* Back */}
        <div className="mt-6 text-center">
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-1 text-xs font-bold text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            ← Volver al marketplace
          </Link>
        </div>
      </div>
    </div>
  );
}
