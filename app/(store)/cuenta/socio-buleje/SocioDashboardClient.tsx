"use client";

/**
 * SocioDashboardClient — Orquestador del panel del socio.
 */

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  SectionTitle,
  BodyText,
  CardTitle,
  PrimaryButton,
  LoadingState,
  Caption,
  InfoAlert,
} from "@buleje/design-system";
import { ChevronDown } from "@buleje/design-system/icons";
import { SocioCorona } from "@/components/ui-system/illustrations";
import { SocioDashboardHero } from "@/components/customer/socio-buleje/SocioDashboardHero";
import { SocioKPIs } from "@/components/customer/socio-buleje/SocioKPIs";
import { SocioTierCard } from "@/components/customer/socio-buleje/SocioTierBadge";
import { SocioUsoBeneficios } from "@/components/customer/socio-buleje/SocioUsoBeneficios";
import { SocioOfertasExclusivas } from "@/components/customer/socio-buleje/SocioOfertasExclusivas";
import { SocioHistorial } from "@/components/customer/socio-buleje/SocioHistorial";
import { CancelarMembresiaModal } from "@/components/customer/socio-buleje/CancelarMembresiaModal";
import { useSocioBuleje } from "@/contexts/socio-buleje-context";
import { useCustomer } from "@/contexts/customer-context";
import Breadcrumbs from "@/components/ui-system/Breadcrumbs";
import RelatedFeatures from "@/components/ui-system/RelatedFeatures";
import { relatedFor } from "@/lib/navigation/feature-registry";

const MarketplaceNavbar = dynamic(
  () => import("@/components/marketplace/MarketplaceNavbar"),
  { ssr: true },
);

export function SocioDashboardClient() {
  const { isSocio, isLoading, status, totalSaved } = useSocioBuleje();
  const { customer } = useCustomer();
  const [showDangerZone, setShowDangerZone] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const customerName = customer?.name ?? "Socio";

  if (isLoading) {
    return (
      <>
        <MarketplaceNavbar />
        <LoadingState variant="fullscreen" message="Cargando tu panel de Socio..." />
      </>
    );
  }

  if (!isSocio) {
    return (
      <>
        <MarketplaceNavbar />
        <main
          id="main-content"
          className="bg-[var(--surface-canvas)] min-h-[70vh] flex items-center justify-center px-4 py-12"
        >
          <div className="flex flex-col items-center text-center max-w-md">
            {/* Ilustración custom — corona con identidad shipibo */}
            <div className="text-[var(--text-secondary)] mb-6" aria-hidden="true">
              <SocioCorona size={200} />
            </div>
            <h2 className="text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
              Todavía no sos Socio Buleje
            </h2>
            <p className="mt-2 text-sm text-[var(--text-tertiary)] leading-relaxed max-w-sm">
              Únete y empieza a ahorrar desde el primer pedido. 30 días de prueba
              sin tarjeta.
            </p>
            <div className="mt-6">
              <PrimaryButton asChild>
                <Link href="/socio-buleje">Conocer el plan Socio</Link>
              </PrimaryButton>
            </div>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <MarketplaceNavbar />
      <main id="main-content" className="bg-[var(--surface-canvas)] min-h-screen">
        <div className="border-b border-[var(--rule-muted)] bg-[var(--surface-raised)]">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-3">
            <Breadcrumbs
              items={[
                { label: "Mi cuenta", href: "/cuenta" },
                { label: "Socio Buleje" },
              ]}
            />
          </div>
        </div>
        <SocioDashboardHero name={customerName} />

        <div className="mx-auto max-w-5xl px-4 py-8 space-y-10">
          {status === "canceled" && (
            <InfoAlert
              title="Membresía en cancelación"
              description="Tus beneficios siguen activos hasta el final del período pagado. Puedes reactivar cuando quieras."
            />
          )}

          <SocioKPIs />

          {/* Tier (gamificación) + uso de beneficios — lado a lado en desktop */}
          <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <SocioTierCard totalSpent={Math.round((totalSaved || 0) * 20)} />
            <SocioUsoBeneficios />
          </div>

          <SocioHistorial />
          <SocioOfertasExclusivas />

          {/* Cancelar membresía — sección colapsable al fondo */}
          <section aria-labelledby="danger-heading" className="pt-6 border-t border-[var(--rule-muted)]">
            <button
              type="button"
              onClick={() => setShowDangerZone((s) => !s)}
              aria-expanded={showDangerZone}
              className="w-full flex items-center justify-between gap-3 py-3 text-left"
            >
              <div>
                <SectionTitle
                  id="danger-heading"
                  as="h2"
                  className="text-[length:var(--ts-lg)]"
                >
                  Gestionar membresía
                </SectionTitle>
                <Caption className="text-[var(--text-tertiary)]">
                  Cambiar plan, cancelar o pausar temporalmente
                </Caption>
              </div>
              <ChevronDown
                className={`h-4 w-4 text-[var(--text-tertiary)] transition-transform ${
                  showDangerZone ? "rotate-180" : ""
                }`}
                aria-hidden
              />
            </button>

            {showDangerZone && (
              <div className="mt-3 rounded-xl border border-[var(--rule-muted)] bg-[var(--surface-sunken)]/50 p-5 space-y-4">
                <div>
                  <CardTitle>Cancelar membresía</CardTitle>
                  <BodyText className="mt-1 text-[var(--text-secondary)]">
                    Si cancelás, tus beneficios siguen hasta fin del ciclo.
                    Puedes volver cuando quieras y retomar tu saldo de cashback
                    acumulado.
                  </BodyText>
                  <div className="mt-3">
                    <PrimaryButton
                      variant="danger"
                      size="sm"
                      onClick={() => setCancelOpen(true)}
                    >
                      Cancelar mi membresía
                    </PrimaryButton>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>

        <RelatedFeatures features={relatedFor("socio-buleje")} />
      </main>
      {/* Footer ÚNICO lo provee el (store) layout — Brandon 2026-06-08 (sin doble). */}

      <CancelarMembresiaModal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
      />
    </>
  );
}
