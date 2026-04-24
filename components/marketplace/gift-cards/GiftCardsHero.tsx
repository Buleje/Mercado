"use client";

/**
 * GiftCardsHero — Hero migrado a <UnifiedHero> pattern.
 *
 * Variant: 2col-left (ilustracion izq, texto der — alternante vs otras landings).
 * Theme: canvas.
 * Illustration: PaicheEnOlla (pucallpa-local, regalo de comida regional).
 *
 * Reemplaza el hero ad-hoc anterior que usaba:
 *   - Gradientes de gray + Dark mode hardcoded
 *   - Imports directos de lucide-react (violacion de ADR-069)
 *   - Tipografia custom sin DS primitives
 */

import { UnifiedHero } from "@/components/ui-system/UnifiedHero";
import { PaicheEnOlla } from "@/components/ui-system/illustrations/pucallpa-locals";

export default function GiftCardsHero() {
  return (
    <UnifiedHero
      kicker="Tarjetas de Regalo Buleje"
      title="Regalá lo que más se disfruta en el barrio"
      description="Tarjetas digitales desde S/ 20 que se canjean en cualquier bodega del marketplace. Sin vencimiento, sin letra chica."
      trustChips={[
        "Envío instantáneo",
        "WhatsApp o email",
        "Personalizable",
      ]}
      ctaPrimary={{ label: "Elige un monto", href: "#denominaciones" }}
      ctaSecondary={{ label: "Mis tarjetas", href: "/cuenta/gift-cards" }}
      illustration={PaicheEnOlla}
      illustrationSize={280}
      variant="2col-left"
      theme="canvas"
      floatingChips={[
        {
          position: "top-right",
          label: "Desde S/ 20",
          dotIntent: "accent",
        },
        {
          position: "bottom-left",
          sublabel: "Enviada",
          label: "Al instante",
        },
      ]}
    />
  );
}
