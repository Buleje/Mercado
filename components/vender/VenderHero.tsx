"use client";

/**
 * VenderHero — Seller Central hero migrado a <UnifiedHero>.
 *
 * Variant: 2col-right (texto izq, DoniaElena der).
 * Theme: canvas + floating chips de "200+ bodegas activas" y "Hoy +347 pedidos".
 */

import { UnifiedHero } from "@/components/ui-system/UnifiedHero";
import { DoniaElena } from "@/components/ui-system/illustrations/pucallpa-locals";

export default function VenderHero() {
  return (
    <UnifiedHero
      kicker="Seller Central"
      title="Vendé en Buleje, llegá a todo Pucallpa"
      description="Abrí tu tienda online como si abrieras la persiana de tu bodega de toda la vida. Cientos de clientes te compran todos los días por la plataforma de Ucayali."
      trustChips={[
        "Sin comisión el primer mes",
        "Soporte en español",
        "Pagos Yape, Plin y efectivo",
      ]}
      ctaPrimary={{ label: "Empezar a vender gratis", href: "/vender/registro" }}
      ctaSecondary={{ label: "Cómo funciona", href: "#como-empezar" }}
      illustration={DoniaElena}
      illustrationSize={320}
      variant="2col-right"
      theme="canvas"
      floatingChips={[
        {
          position: "top-left",
          label: "200+ bodegas activas",
          dotIntent: "success",
        },
        {
          position: "bottom-right",
          sublabel: "Hoy",
          label: "+347 pedidos",
        },
      ]}
    />
  );
}
