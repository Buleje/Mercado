"use client";

import { Truck, CheckCircle, Clock, Phone, MapPin, Shield } from "lucide-react";
import Link from "next/link";

export default function BienvenidaRepartidorPage() {
  return (
    <div className="min-h-screen bg-linear-to-b from-gray-50 to-white">
      {/* Hero */}
      <div className="bg-primary px-4 pb-12 pt-16 text-center text-white">
        <div className="mx-auto max-w-2xl">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-white/20">
            <Truck className="h-10 w-10" />
          </div>
          <h1 className="mb-2 text-3xl font-bold">¡Bienvenido al equipo! 🎉</h1>
          <p className="text-lg text-white/90">
            Ya eres parte de la red de repartidores de Buleje. Aquí te explicamos cómo empezar.
          </p>
        </div>
      </div>

      {/* Steps */}
      <div className="mx-auto -mt-6 max-w-2xl px-4 pb-16">
        <div className="space-y-4">
          {/* Step 1 */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold">
                1
              </div>
              <div>
                <h3 className="mb-1 text-lg font-semibold text-gray-900">Espera tu primer pedido</h3>
                <p className="text-gray-600">
                  Cuando un cliente haga un pedido en tu zona, recibirás una notificación por WhatsApp 
                  con los detalles: dirección de recojo, dirección de entrega y productos.
                </p>
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold">
                2
              </div>
              <div>
                <h3 className="mb-1 text-lg font-semibold text-gray-900">Recoge el pedido</h3>
                <p className="text-gray-600">
                  Ve a la bodega indicada y recoge los productos. Verifica que todo coincida con la lista 
                  del pedido antes de salir.
                </p>
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold">
                3
              </div>
              <div>
                <h3 className="mb-1 text-lg font-semibold text-gray-900">Entrega al cliente</h3>
                <p className="text-gray-600">
                  Lleva el pedido a la dirección del cliente. Si es pago contra entrega, cobra el monto 
                  indicado. ¡Sé amable y puntual!
                </p>
              </div>
            </div>
          </div>

          {/* Step 4 */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold">
                4
              </div>
              <div>
                <h3 className="mb-1 text-lg font-semibold text-gray-900">Recibe tu pago</h3>
                <p className="text-gray-600">
                  Tu tarifa de entrega se acumula y se paga semanalmente. Puedes ver tu historial 
                  de entregas y ganancias en tu perfil.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Info Cards */}
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-4">
            <Clock className="h-6 w-6 shrink-0 text-emerald-600" />
            <div>
              <p className="text-sm font-medium text-emerald-900">Horario flexible</p>
              <p className="text-xs text-emerald-700">Tú decides cuándo trabajar</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-amber-50 p-4">
            <MapPin className="h-6 w-6 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-medium text-amber-900">Tu zona</p>
              <p className="text-xs text-amber-700">Entregas cerca de ti</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-4">
            <Shield className="h-6 w-6 shrink-0 text-emerald-600" />
            <div>
              <p className="text-sm font-medium text-emerald-900">Soporte 24/7</p>
              <p className="text-xs text-emerald-700">Siempre te ayudamos</p>
            </div>
          </div>
        </div>

        {/* Tips */}
        <div className="mt-8 rounded-2xl border border-primary/20 bg-primary/5 p-6">
          <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900">
            <CheckCircle className="h-5 w-5 text-primary" />
            Consejos para ser un buen repartidor
          </h3>
          <ul className="space-y-2 text-gray-700">
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              Mantén tu teléfono cargado y con datos para recibir pedidos
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              Verifica los productos antes de salir de la tienda
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              Trata los productos con cuidado, especialmente los frágiles
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              Sé puntual y amable — los clientes califican tu servicio
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              Cualquier problema, contacta a soporte por WhatsApp
            </li>
          </ul>
        </div>

        {/* Contact */}
        <div className="mt-8 text-center">
          <p className="mb-3 text-gray-600">¿Tienes dudas? Escríbenos:</p>
          <a
            href="https://wa.me/51999999999?text=Hola%2C%20soy%20repartidor%20nuevo%20y%20tengo%20una%20pregunta"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-green-600 px-6 py-3 font-medium text-white transition hover:bg-green-700"
          >
            <Phone className="h-5 w-5" />
            WhatsApp de Soporte
          </a>
        </div>

        {/* Back */}
        <div className="mt-6 text-center">
          <Link href="/marketplace" className="text-sm text-primary hover:underline">
            ← Volver al marketplace
          </Link>
        </div>
      </div>
    </div>
  );
}
