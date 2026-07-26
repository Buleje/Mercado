"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { CreditCard, ArrowLeft, Smartphone, Banknote, Plus } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import Header from "@/components/Header";
import AnnouncementBar from "@/components/AnnouncementBar";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";
import { BalanzaVacia } from "@/components/ui-system/illustrations";

const CartSidebar = dynamic(() => import("@/components/CartSidebar"));
const MobileBottomNav = dynamic(() => import("@/components/MobileBottomNav"));

type PaymentMethod = {
  id: string;
  type: "yape" | "efectivo";
  label: string;
  detail: string;
  isDefault: boolean;
};

// MVP: metodos fijos que soporta el sistema actualmente
const PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: "pay_yape",
    type: "yape",
    label: "Yape",
    detail: "Pago digital al confirmar pedido",
    isDefault: true,
  },
  {
    id: "pay_efectivo",
    type: "efectivo",
    label: "Efectivo",
    detail: "Pagas al recibir tu pedido",
    isDefault: false,
  },
];

function PaymentCard({ method }: { method: PaymentMethod }) {
  const Icon = method.type === "yape" ? Smartphone : Banknote;

  return (
    <div
      className={cn(
        "bg-[var(--surface-raised)] rounded-xl border p-4",
        method.isDefault
          ? "border-primary/30 dark:border-primary/40"
          : "border-[var(--rule-base)]"
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
            method.type === "yape"
              ? "bg-purple-50 dark:bg-purple-900/20"
              : "bg-teal-50 dark:bg-teal-900/20"
          )}
        >
          <Icon
            className={cn(
              "h-5 w-5",
              method.type === "yape"
                ? "text-[var(--accent)]"
                : "text-[var(--accent)]"
            )}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              {method.label}
            </span>
            {method.isDefault && (
              <span className="text-[length:var(--ts-2xs)] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] uppercase tracking-wider">
                Preferido
              </span>
            )}
          </div>
          <p className="text-[length:var(--ts-2xs)] text-muted mt-0.5">{method.detail}</p>
        </div>
        <div className="w-4 h-4 rounded-full border-2 border-primary flex items-center justify-center shrink-0">
          {method.isDefault && (
            <div className="w-2 h-2 rounded-full bg-primary" />
          )}
        </div>
      </div>
    </div>
  );
}

export default function PagosPage() {
  return (
    <div className="min-h-screen bg-[var(--surface-sunken)] dark:bg-background">
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: "https://www.buleje.pe/" },
          { name: "Mi cuenta", url: "https://www.buleje.pe/cuenta" },
          { name: "Metodos de pago", url: "https://www.buleje.pe/cuenta/pagos" },
        ]}
      />

      {/* Hero */}
      <div
        className="pt-32 sm:pt-36 pb-8 border-b border-gray-200 dark:border-[var(--rule-soft)]"
        style={{ background: "#060a0d" }}
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <nav
            aria-label="Migas de pan"
            className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] text-white/35 mb-5"
          >
            <Link href="/" className="hover:text-white/60 transition-colors">
              Inicio
            </Link>
            <span>/</span>
            <Link href="/cuenta" className="hover:text-white/60 transition-colors">
              Mi cuenta
            </Link>
            <span>/</span>
            <span className="text-white/55">Metodos de pago</span>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/cuenta"
              className="p-2 -ml-1 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 transition-colors text-white/70 hover:text-white"
              aria-label="Volver"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
            </Link>
            <div>
              <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-white/40">
                TU CUENTA
              </span>
              <h1 className="text-xl sm:text-2xl font-extrabold text-white leading-tight tracking-[var(--ls-tight)]">
                Metodos de pago
              </h1>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4 pb-28">
        {/* Payment methods */}
        <div className="space-y-3">
          {PAYMENT_METHODS.map((method) => (
            <PaymentCard key={method.id} method={method} />
          ))}
        </div>

        {/* Coming soon */}
        <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] p-5 flex flex-col items-center gap-3 text-center">
          <BalanzaVacia size={60} className="text-gray-200 dark:text-muted/30" />
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Más opciones proximamente
            </p>
            <p className="text-xs text-muted mt-1 max-w-xs mx-auto">
              Estamos trabajando para agregar tarjetas de debito y credito como opcion de pago.
            </p>
          </div>
          <button
            disabled
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed border-[var(--rule-base)] text-sm font-semibold text-muted cursor-not-allowed"
          >
            <Plus className="h-4 w-4" />
            Agregar tarjeta (pronto)
          </button>
        </div>

        {/* Security note */}
        <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] p-4">
          <div className="flex items-start gap-3">
            <CreditCard className="h-4 w-4 text-muted shrink-0 mt-0.5" />
            <p className="text-xs text-muted leading-relaxed">
              Tus datos de pago están protegidos. No almacenamos información de tarjetas. Los pagos digitales se procesan directamente en la app de Yape.
            </p>
          </div>
        </div>
      </main>

      <CartSidebar />
    </div>
  );
}
