"use client";

import { useState } from "react";
import {
  QuickViewModal,
  OrderTrackingTimeline,
  LoyaltyTierCard,
  OrderConfirmationCard,
} from "@/components/customer/journey";

// Mock QR (placeholder transparente editorial)
const MOCK_QR_SVG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="#0a0a0a">
      <rect x="0" y="0" width="30" height="30"/>
      <rect x="90" y="0" width="30" height="30"/>
      <rect x="0" y="90" width="30" height="30"/>
      <g>
        ${Array.from({ length: 12 * 12 }).map((_, i) => {
          const x = (i % 12) * 10;
          const y = Math.floor(i / 12) * 10;
          if ((x < 30 && y < 30) || (x >= 90 && y < 30) || (x < 30 && y >= 90)) return "";
          const show = (i * 17 + 5) % 7 > 3;
          return show ? `<rect x="${x}" y="${y}" width="10" height="10"/>` : "";
        }).join("")}
      </g>
    </svg>`,
  );

export default function CustomerJourneyDemoPage() {
  const [quickViewOpen, setQuickViewOpen] = useState(false);
  const [favOn, setFavOn] = useState(false);

  return (
    <main className="min-h-screen bg-[var(--surface-canvas)] text-[var(--text-primary)]">
      {/* Hero */}
      <section
        className="py-16 sm:py-20 border-b border-[var(--rule-base)]"
        style={{ background: "var(--brand-ink)" }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-white/55 mb-4">
            Ola 5 · Customer journey primitives
          </p>
          <h1 className="text-fs-display text-white leading-[1.02]">
            De entrar a comprar <span className="text-white/45">en &lt;60 segundos</span>
          </h1>
          <p className="mt-5 text-base sm:text-lg text-white/60 max-w-2xl">
            Quick view modal, Yape QR con captura auto-validada, tracking visual
            post-pago con ETA, fidelidad gamificada Bronce/Plata/Oro, confirmación editorial.
          </p>
        </div>
      </section>

      {/* QuickViewModal */}
      <section className="py-12 border-b border-[var(--rule-base)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-3">
            01 · QuickViewModal
          </p>
          <h2 className="text-fs-h2 mb-3">Preview de producto sin salir del grid</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-2xl">
            Tap el botón abajo para ver el modal. Radix Dialog + ESC close + focus trap +
            scarcity real (solo si stock ≤5).
          </p>
          <button
            onClick={() => setQuickViewOpen(true)}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] px-5 py-3 text-sm font-bold hover:opacity-90 transition-opacity"
          >
            Abrir QuickView (demo)
          </button>

          <QuickViewModal
            open={quickViewOpen}
            onOpenChange={setQuickViewOpen}
            product={{
              id: "demo-1",
              name: "Arroz Extra Costeño · Bolsa 5kg",
              price: 28.9,
              originalPrice: 32.5,
              image: "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600",
              category: "Abarrotes",
              unit: "5kg",
              description: "Arroz grano extra, cosecha del norte. Perfecto para el día a día. Rinde 20 porciones.",
              stock: 4,
              badges: [{ label: "Oferta", variant: "accent" }],
            }}
            onAddToCart={async (qty) => {
              console.log("Add to cart", qty);
              await new Promise((r) => setTimeout(r, 400));
            }}
            onFavoriteToggle={() => setFavOn(!favOn)}
            isFavorite={favOn}
            onShare={() => console.log("share")}
            storeName="Bodega San Martín"
          />
        </div>
      </section>

      {/* Order tracking timeline */}
      <section className="py-12 border-b border-[var(--rule-base)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-3">
            02 · OrderTrackingTimeline
          </p>
          <h2 className="text-fs-h2 mb-6">Tracking visual post-pago</h2>
          <div className="grid lg:grid-cols-2 gap-5">
            <OrderTrackingTimeline
              orderId="BUL-1234"
              currentStatus="en_camino"
              etaMinutes={18}
              driverName="Carlos Medina"
              driverPhone="916409675"
              events={[
                { status: "confirmado", at: "14:05" },
                { status: "preparando", at: "14:08" },
                { status: "despachado", at: "14:22" },
              ]}
            />
            <OrderTrackingTimeline
              orderId="BUL-5678"
              currentStatus="entregado"
              events={[
                { status: "confirmado", at: "12:01" },
                { status: "preparando", at: "12:05" },
                { status: "despachado", at: "12:20" },
                { status: "en_camino", at: "12:22" },
                { status: "entregado", at: "12:41" },
              ]}
            />
          </div>
        </div>
      </section>

      {/* Loyalty */}
      <section className="py-12 border-b border-[var(--rule-base)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-3">
            03 · LoyaltyTierCard
          </p>
          <h2 className="text-fs-h2 mb-6">Fidelidad gamificada</h2>
          <div className="grid lg:grid-cols-2 gap-5">
            <LoyaltyTierCard customerName="Brandon" currentPoints={418} totalSpent={4180} />
            <LoyaltyTierCard currentPoints={1680} totalSpent={16800} />
          </div>
        </div>
      </section>

      {/* Order confirmation */}
      <section className="py-12 border-b border-[var(--rule-base)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-3">
            04 · OrderConfirmationCard
          </p>
          <h2 className="text-fs-h2 mb-6">Confirmación post-pago</h2>
          <OrderConfirmationCard
            orderId="BUL-1234"
            totalAmount={47.5}
            etaMinutes={25}
            address="Jr. Ucayali 450, Pucallpa"
            itemsCount={7}
            paymentMethod="yape"
            referralCode="BRANDON10"
          />
        </div>
      </section>

      {/* Info sobre Yape (no demo completa porque requiere backend) */}
      <section className="py-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-3">
            05 · YapeQRCheckout
          </p>
          <h2 className="text-fs-h2 mb-3">Yape QR embebido + captura auto-validada</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-2xl">
            QR grande, número copiable, monto exacto. Sube captura → backend valida con vision LLM.
            Estados: idle → uploading → validating → success/error.
            Requiere endpoint <code className="px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] font-mono text-xs">/api/payments/yape/verify</code> en producción.
          </p>
          <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 text-center">
            <p className="text-sm text-[var(--text-tertiary)]">
              Demo funcional disponible tras integración backend con vision LLM.
              Archivo: <code className="px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] font-mono text-xs">components/customer/journey/YapeQRCheckout.tsx</code>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
