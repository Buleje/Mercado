"use client";

/**
 * TiendasWelcomeBanner — banner de bienvenida mobile estilo Rappi.
 *
 * Se muestra SOLO si el visitante NO está logueado. Invita a registrarse
 * con un beneficio concreto (delivery gratis en el primer pedido). Si
 * el cliente ya está logueado, no renderiza nada.
 *
 * Brandon, 2026-05-21.
 */

import Link from "next/link";
import { Gift, ArrowRight } from "@buleje/design-system/icons";
import { useCustomerAuthStatus } from "@/hooks/useCustomerAuthStatus";
import { cn } from "@/lib/utils";

export default function TiendasWelcomeBanner({
  className,
}: {
  className?: string;
}) {
  const { authenticated } = useCustomerAuthStatus();

  // `authenticated === null` durante el primer check (loading).
  // No renderizamos durante loading ni si el usuario está logueado —
  // evita flash de banner que luego desaparece.
  if (authenticated !== false) return null;

  return (
    <Link
      href="/login?returnTo=/tiendas"
      className={cn(
        "group flex items-center gap-2.5 w-full rounded-xl",
        "bg-[var(--accent)] text-white px-3.5 py-2.5",
        "active:scale-[0.99] transition-transform",
        className,
      )}
    >
      <Gift className="h-4 w-4 shrink-0 opacity-95" strokeWidth={2.5} aria-hidden />
      <span className="flex-1 text-sm font-extrabold tracking-tight truncate">
        Iniciá sesión · Delivery gratis en tu 1er pedido
      </span>
      <ArrowRight
        className="h-4 w-4 shrink-0 opacity-90 transition-transform group-hover:translate-x-0.5"
        strokeWidth={2.5}
        aria-hidden
      />
    </Link>
  );
}
