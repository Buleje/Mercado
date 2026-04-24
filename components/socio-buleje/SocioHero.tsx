"use client";

/**
 * SocioHero — Hero migrado a <UnifiedHero> pattern.
 *
 * Variant: 2col-right + theme accent-soft (radial gradient suave del accent).
 * Illustration: BodegueroCelebrando (celebrating).
 *
 * Mantiene la logica stateful: PlanSelector + subscribe action + SuccessAlert
 * cuando el usuario ya es Socio — todo como children del UnifiedHero.
 */

import { useState } from "react";
import Link from "next/link";
import {
  PrimaryButton,
  SuccessAlert,
} from "@buleje/design-system";
import { ArrowRight } from "@buleje/design-system/icons";
import { BodegueroCelebrando } from "@/components/ui-system/illustrations/success-moments";
import { UnifiedHero } from "@/components/ui-system/UnifiedHero";
import { PlanSelector } from "./PlanSelector";
import { useSocioBuleje } from "@/contexts/socio-buleje-context";
import type { SocioPlan } from "@/lib/validators/socio-buleje";
import { TRIAL_DAYS } from "@/lib/validators/socio-buleje";

export function SocioHero() {
  const { isSocio, subscribe } = useSocioBuleje();
  const [plan, setPlan] = useState<SocioPlan>("yearly");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubscribe = async () => {
    setIsSubmitting(true);
    try {
      await subscribe(plan);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <UnifiedHero
      kicker="Nueva membresía"
      title="Socio Buleje"
      subtitle="Ahorrá todo el año en tu bodega"
      description="Delivery gratis ilimitado, 5% cashback en cada compra y precios exclusivos en las bodegas de tu barrio. La bodega del vecindario, ahora con beneficios."
      trustChips={[
        "Desde S/ 19/mes",
        `${TRIAL_DAYS} días gratis`,
        "Sin permanencia",
      ]}
      illustration={BodegueroCelebrando}
      illustrationSize={240}
      variant="2col-right"
      theme="accent-soft"
      footnote={
        !isSocio ? "Sin tarjeta para el trial. Cancelás cuando quieras." : undefined
      }
    >
      {!isSocio ? (
        <>
          <PlanSelector value={plan} onChange={setPlan} />
          <div className="flex flex-wrap gap-3 pt-2">
            <PrimaryButton
              size="lg"
              onClick={handleSubscribe}
              loading={isSubmitting}
              rightIcon={<ArrowRight className="h-4 w-4" aria-hidden />}
            >
              Volverme Socio
            </PrimaryButton>
            <PrimaryButton size="lg" variant="secondary" asChild>
              <Link href="#beneficios">Ver beneficios</Link>
            </PrimaryButton>
          </div>
        </>
      ) : (
        <SuccessAlert
          title="Ya sos Socio Buleje"
          description="Tus beneficios están activos. Revisa tu panel para ver el saldo de cashback."
          action={
            <PrimaryButton size="sm" asChild>
              <Link href="/cuenta/socio-buleje">Ir al panel</Link>
            </PrimaryButton>
          }
        />
      )}
    </UnifiedHero>
  );
}
