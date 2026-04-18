"use client";

/**
 * EnVivoHero — Hero migrado a <UnifiedHero> pattern.
 *
 * Variant: 1col-center (copy centrado, ilustracion como watermark).
 * Theme: canvas. Illustration: VideoEnVivo (cámara + chip "LIVE" pulsante).
 *
 * Mantiene el state indicator "EN VIVO AHORA" / "Proxima transmision"
 * como kicker dinamico.
 */

import { UnifiedHero } from "@/components/ui-system/UnifiedHero";
import { VideoEnVivo } from "@/components/ui-system/illustrations/feature-identity";

export interface EnVivoHeroProps {
  liveCount: number;
  nextInHours?: number;
}

export function EnVivoHero({ liveCount, nextInHours }: EnVivoHeroProps) {
  const isLive = liveCount > 0;

  const kicker = isLive
    ? `En vivo ahora · ${liveCount} ${liveCount === 1 ? "tienda" : "tiendas"}`
    : `Próxima transmisión en ${nextInHours ?? 2}h`;

  return (
    <UnifiedHero
      kicker={kicker}
      title="Buleje en Vivo"
      subtitle="Mirá lo fresco del día"
      description="Las bodegas de Pucallpa muestran sus productos en vivo. Preguntá en el chat, mirá lo que acaba de llegar y agregalo al carrito sin salir de la transmisión."
      trustChips={
        isLive
          ? ["Transmisión en curso", "Chat con el vendedor", "Delivery directo"]
          : ["Próxima en breve", "Recordatorios por WhatsApp"]
      }
      illustration={VideoEnVivo}
      illustrationSize={320}
      variant="1col-center"
      theme="canvas"
    />
  );
}
