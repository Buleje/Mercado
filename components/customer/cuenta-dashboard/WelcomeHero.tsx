"use client";

/**
 * WelcomeHero — saludo personalizado + 3 StatCards preview + ilustracion.
 *
 * Primera seccion del dashboard /cuenta. 2-col desktop, stack mobile.
 * Izquierda: "Hola Maria" + chip "Miembro hace X meses" + 3 StatCards.
 * Derecha: ilustracion DoniaElena o BodegueroCelebrando.
 */

import { memo } from "react";
import { StatCard, Chip, Kicker, PageTitle, BodyText } from "@buleje/design-system";
import {
  Package,
  Heart,
  PiggyBank,
} from "@buleje/design-system/icons";
import { DoniaElena, BodegueroCelebrando } from "@/components/ui-system/illustrations";
import type { CustomerDashboardData } from "@/lib/customer-dashboard.mock";

export interface WelcomeHeroProps {
  firstName: string;
  data: CustomerDashboardData;
  isAuthenticated: boolean;
}

function fmtSoles(n: number) {
  return `S/ ${n.toFixed(2)}`;
}

export const WelcomeHero = memo(function WelcomeHero({
  firstName,
  data,
  isAuthenticated,
}: WelcomeHeroProps) {
  const Illustration = isAuthenticated ? BodegueroCelebrando : DoniaElena;
  const memberLabel = isAuthenticated
    ? `Miembro hace ${data.profile.memberMonths} mes${data.profile.memberMonths === 1 ? "" : "es"}`
    : "Identificate para ver tu historial";

  return (
    <section
      aria-labelledby="welcome-heading"
      className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 sm:p-8"
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6 items-center">
        <div className="min-w-0">
          <Kicker>Tu bodega de confianza</Kicker>
          <PageTitle id="welcome-heading" className="font-display mt-1">
            Bienvenida de vuelta, {firstName}
          </PageTitle>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Chip className="bg-[var(--surface-sunken)] text-[var(--text-secondary)] border-[var(--rule-soft)]">
              {memberLabel}
            </Chip>
            {data.profile.isSocioBuleje && (
              <Chip className="bg-[color-mix(in_oklch,var(--accent)_10%,transparent)] text-[var(--accent)] border-[color-mix(in_oklch,var(--accent)_30%,transparent)]">
                Socio {data.profile.socioTier === "plus" ? "Plus" : data.profile.socioTier === "pro" ? "Pro" : "Gratis"}
              </Chip>
            )}
          </div>
          <BodyText className="mt-2 text-[var(--text-secondary)] max-w-md">
            Revisa tus pedidos, cupones, suscripciones y todo lo que tenes en
            un solo lugar.
          </BodyText>

          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard
              label="Pedidos totales"
              value={data.totals.pedidosTotales}
              icon={Package}
              density="compact"
              subValue={
                data.totals.pedidosActivos > 0
                  ? `${data.totals.pedidosActivos} activo${data.totals.pedidosActivos === 1 ? "" : "s"}`
                  : "Sin pedidos en curso"
              }
            />
            <StatCard
              label="Ahorro Socio este mes"
              value={fmtSoles(data.totals.ahorroMesSocio)}
              icon={PiggyBank}
              density="compact"
              emphasis={data.totals.ahorroMesSocio > 0 ? "success" : "neutral"}
              subValue="Cashback + envios"
            />
            <StatCard
              label="Productos favoritos"
              value={data.totals.favoritosCount}
              icon={Heart}
              density="compact"
              subValue="En tu lista"
            />
          </div>
        </div>

        <div className="hidden lg:flex items-center justify-center shrink-0">
          <Illustration
            size={176}
            className="text-[var(--text-tertiary)]"
            aria-hidden
          />
        </div>
      </div>
    </section>
  );
});

export default WelcomeHero;
