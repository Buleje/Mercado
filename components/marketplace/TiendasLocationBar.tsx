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

import { MapPin, ChevronRight } from "@buleje/design-system/icons";
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

  // Línea 1 (eyebrow): "Entregar en" cuando hay dirección, o un encabezado
  // claro de delivery cuando todavía no hay datos.
  const eyebrow = hasAddress ? "Entregar en" : "Entrega a domicilio";

  // Línea 2 (dirección o CTA): dirección completa truncada del customer
  // logueado, o el CTA "Elegí tu dirección" cuando aún no hay datos.
  const addressDisplay = hasAddress
    ? [customer?.addressLine, customer?.districtName ?? customer?.provinceName]
        .filter(Boolean)
        .join(" · ")
    : "Elegí tu dirección";

  // CTA chip de la derecha: "Cambiar" si ya hay dirección, "Agregar" si no.
  const actionLabel = hasAddress ? "Cambiar" : "Agregar";

  return (
    <button
      type="button"
      onClick={() => openModal("profile")}
      aria-label={
        hasAddress
          ? `Cambiar ubicación. Actual: ${addressDisplay}`
          : "Elegir tu dirección de entrega"
      }
      className={cn(
        // Barra minimalista: fondo de marca plano + texto blanco. Sin gradiente
        // ni halos — limpia y profesional, alto contraste sobre el listado.
        // Brandon 2026-06-07: rectángulo plano full-bleed (sin redondear, sin
        // ring) — el wrapper en /tiendas le pone -mx-4 para pegarlo al nav.
        "group w-full flex items-center gap-3 px-4 py-3 rounded-none text-left",
        "bg-[var(--accent)] text-white",
        "active:scale-[0.99] transition-transform",
        className,
      )}
    >
      <MapPin
        className="h-5 w-5 shrink-0 text-white/90"
        strokeWidth={2.5}
        aria-hidden
      />
      <span className="flex flex-col min-w-0 flex-1 leading-tight">
        <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-white/70">
          {eyebrow}
        </span>
        <span className="text-sm font-extrabold truncate text-white mt-0.5">
          {addressDisplay}
        </span>
      </span>
      <span className="inline-flex items-center gap-0.5 shrink-0 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-white/85">
        {actionLabel}
        <ChevronRight className="h-4 w-4" strokeWidth={2.5} aria-hidden />
      </span>
    </button>
  );
}
