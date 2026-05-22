"use client";

/**
 * TiendasLocationBar — barra superior mobile estilo Rappi.
 *
 * Muestra la dirección activa del customer (o "Elegí tu ubicación" si está
 * deslogueado o sin dirección guardada). Al tap abre el CustomerModal en
 * modo "profile" para que edite/complete su ubicación.
 *
 * Mobile-only por default — el desktop sigue con el h1 + count layout
 * existente en TiendasClient. Brandon, 2026-05-21.
 */

import { MapPin, ChevronDown } from "@buleje/design-system/icons";
import { useCustomer } from "@/contexts/customer-context";
import { useCustomerAuthStatus } from "@/hooks/useCustomerAuthStatus";
import { cn } from "@/lib/utils";

export default function TiendasLocationBar({
  className,
}: {
  className?: string;
}) {
  const { customer, openModal } = useCustomer();
  const { authenticated } = useCustomerAuthStatus();
  const isLoggedIn = authenticated === true;

  const hasAddress = Boolean(
    isLoggedIn &&
      customer &&
      (customer.addressLine ||
        customer.districtName ||
        customer.provinceName),
  );

  // Línea 1 (título corto): "Tu ubicación" / "Elegí tu ubicación"
  const eyebrow = hasAddress ? "Entregar en" : "Elegí tu ubicación";

  // Línea 2 (dirección o CTA): dirección completa truncada, o un CTA
  // "Tocá para agregar tu dirección" cuando no hay datos.
  const addressDisplay = hasAddress
    ? [customer?.addressLine, customer?.districtName ?? customer?.provinceName]
        .filter(Boolean)
        .join(" · ")
    : "Tocá para agregar tu dirección";

  return (
    <button
      type="button"
      onClick={() => openModal("profile")}
      aria-label={
        hasAddress
          ? `Cambiar ubicación. Actual: ${addressDisplay}`
          : "Elegir tu ubicación de entrega"
      }
      className={cn(
        "w-full flex items-center gap-2.5 py-2 -mx-1 px-1 rounded-lg",
        "text-left active:bg-[var(--surface-sunken)] transition-colors",
        className,
      )}
    >
      <MapPin
        className="h-4 w-4 shrink-0 text-[var(--accent)]"
        strokeWidth={2.5}
        aria-hidden
      />
      <span className="flex items-baseline gap-1.5 min-w-0 flex-1">
        <span className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] shrink-0">
          {eyebrow}
        </span>
        <span
          className={cn(
            "text-sm font-extrabold tracking-tight truncate",
            hasAddress
              ? "text-[var(--text-primary)]"
              : "text-[var(--accent)]",
          )}
        >
          {addressDisplay}
        </span>
      </span>
      <ChevronDown
        className="h-4 w-4 shrink-0 text-[var(--text-secondary)]"
        strokeWidth={2.5}
        aria-hidden
      />
    </button>
  );
}
