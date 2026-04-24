"use client";

/**
 * VenderFAQ — Accordion de preguntas frecuentes seller-facing.
 * Implementación propia con <details>/<summary> nativos (0 deps) para
 * accessibility automática y funcionamiento sin JS.
 */

import { useState } from "react";
import { Plus, Minus } from "@buleje/design-system/icons";
import { cn } from "@buleje/design-system";

const FAQ_ITEMS = [
  {
    q: "¿Cuánto cobra Buleje de comisión?",
    a: "Los primeros 30 días es gratis, sin ninguna comisión. Después tienes dos opciones: Plan Gratis (5% por pedido exitoso, sin cuota fija) o Plan Pro (S/ 29 al mes, sin comisión por pedido). Vos eliges el que te convenga según tu volumen.",
  },
  {
    q: "¿Cuándo recibo la plata de mis ventas?",
    a: "Si el cliente pagó por Yape o Plin al repartidor, la plata la cobraste en el acto. Si pagó con tarjeta online, te transferimos el dinero al día siguiente hábil a la cuenta bancaria que registraste.",
  },
  {
    q: "¿Necesito tener RUC para vender?",
    a: "Sí. Pedimos RUC vigente (persona natural con negocio o persona jurídica). Si todavía no tienes, te mandamos el instructivo SUNAT para sacarlo en 48h sin costo. Una vez que lo tengas, subes la foto y sigues.",
  },
  {
    q: "¿Cómo manejo las entregas? ¿Tengo que contratar repartidores?",
    a: "No. Buleje coordina los repartidores. Vos preparás el pedido, marcás 'listo' en la app, y un motorizado pasa a recogerlo en minutos. Los repartidores son locales, conocen Pucallpa y tienen GPS para que el cliente vea la ruta en vivo.",
  },
  {
    q: "¿Qué productos puedo vender?",
    a: "Abarrotes, bebidas, lácteos, frutas y verduras, productos de limpieza, golosinas, panadería y carnes. No se permiten bebidas alcohólicas sin licencia vigente, medicamentos sin receta, ni productos piratas o de dudosa procedencia.",
  },
  {
    q: "¿Qué pasa si un cliente devuelve algo?",
    a: "Tenemos proceso de devolución simple. El cliente reporta el problema en la app, el repartidor recoge el producto, y tú decides si reembolsas, reemplazas o investigas más. Buleje te acompaña en cada paso y bloquea clientes con patrón de abuso.",
  },
  {
    q: "¿Cuántos productos puedo cargar?",
    a: "Ilimitados. En el Plan Gratis cargás hasta 50 productos activos, en Plan Pro son infinitos. Puedes subir fotos con el celular o pedirnos ayuda para fotografías profesionales (te cobramos solo el costo real, sin márgen).",
  },
  {
    q: "¿Puedo darme de baja si no me gusta?",
    a: "Cuando quieras, sin multas ni trámites raros. Apagás la tienda desde el panel o nos llamás por WhatsApp. La plata pendiente se te transfiere en 48h. Los datos de tus clientes son tuyos, te los exportamos en Excel.",
  },
] as const;

export default function VenderFAQ() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <section className="border-b border-[var(--rule-base)] bg-[var(--surface-raised)] py-16 sm:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <header className="mb-10">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
            Preguntas frecuentes
          </p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-4xl">
            Lo que casi todos nos preguntan
          </h2>
          <p className="mt-3 text-[var(--text-secondary)]">
            Si no está aquí, escríbenos por WhatsApp y te respondemos en minutos.
          </p>
        </header>

        <ul className="space-y-2">
          {FAQ_ITEMS.map((item, idx) => {
            const open = openIdx === idx;
            return (
              <li
                key={item.q}
                className={cn(
                  "overflow-hidden rounded-xl border transition-colors",
                  open
                    ? "border-[var(--rule-strong)] bg-[var(--surface-canvas)]"
                    : "border-[var(--rule-base)] bg-[var(--surface-canvas)]",
                )}
              >
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenIdx(open ? null : idx)}
                  className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left"
                >
                  <span className="flex-1 text-sm font-semibold text-[var(--text-primary)] sm:text-base">
                    {item.q}
                  </span>
                  <span
                    aria-hidden="true"
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--rule-base)] text-[var(--text-secondary)]"
                  >
                    {open ? (
                      <Minus className="h-3 w-3" strokeWidth={2} />
                    ) : (
                      <Plus className="h-3 w-3" strokeWidth={2} />
                    )}
                  </span>
                </button>
                {open && (
                  <div className="px-5 pb-5 text-sm leading-relaxed text-[var(--text-secondary)]">
                    {item.a}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
