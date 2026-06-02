"use client";

/**
 * /checkout/auth — gate de autenticación antes de entrar al checkout.
 *
 * Pantalla minimalista (fondo vacío, sin shell, sin stepper) con el
 * AuthModal forzado abierto encima. Flow:
 *
 *   1. User clickea "Continuar" en /marketplace/carrito sin sesión
 *   2. Carrito redirect a /checkout/auth
 *   3. Esta página muestra el modal fijo (no se puede cerrar sin login)
 *   4. User se loguea con Google / Facebook / OTP phone
 *   5. Apenas aparece el customer en useCustomer → redirect a /checkout/datos
 *
 * Si el usuario cierra el modal (X o ESC) lo mandamos de vuelta al carrito.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, ArrowLeft } from "@buleje/design-system/icons";
import { AuthModal } from "@/components/auth/AuthModal";
import { useCustomer } from "@/contexts/customer-context";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";
import { BulejeWordmark } from "@/components/ui-system/illustrations";

/** Solo rutas internas son aceptadas como returnTo (protección open-redirect). */
function safeReturnTo(value: string | null): string {
  if (!value) return "/checkout/datos";
  if (!value.startsWith("/")) return "/checkout/datos";
  if (value.startsWith("//") || value.startsWith("/\\")) return "/checkout/datos";
  return value;
}

export default function CheckoutAuthGate() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get("returnTo"));
  const { customer } = useCustomer();
  const { itemCount, hydrated: cartHydrated } = useMarketplaceCart();
  // Guardamos el customer que había al montar para detectar "login nuevo"
  const [initialPhone] = useState<string | null>(() => customer?.phone ?? null);
  // Brandon 2026-06-01 (fix login con otra cuenta): una vez que detectamos el
  // login y redirigimos a returnTo, NO debemos dejar que el onClose diferido del
  // AuthModal (setTimeout 1.5s tras verificar OTP) dispare handleClose → eso
  // rebotaba al usuario recién logueado a /marketplace/carrito en vez de dejarlo
  // en /checkout/datos. Este ref hace que handleClose sea no-op tras el redirect.
  const redirectedRef = useRef(false);

  // Si el carrito está vacío, no tiene sentido el gate.
  // Brandon 2026-06-01 (fix "iniciar sesión con otra cuenta"): esperar a que el
  // carrito HIDRATE desde localStorage antes de chequear. Antes `itemCount` era
  // 0 en el primer render (pre-hidratación) → el gate rebotaba SIEMPRE a
  // /marketplace/carrito apenas entrabas, antes de poder loguearte. Igual que
  // datos/entrega/confirmar, que ya esperan `cartHydrated`.
  useEffect(() => {
    if (cartHydrated && itemCount === 0) router.replace("/marketplace/carrito");
  }, [cartHydrated, itemCount, router]);

  // Detecta cuando se completó el login (phone distinto al inicial, o antes null)
  useEffect(() => {
    if (!customer?.phone) return;
    if (customer.phone !== initialPhone && !redirectedRef.current) {
      redirectedRef.current = true;
      router.replace(returnTo);
    }
  }, [customer, initialPhone, returnTo, router]);

  const handleClose = () => {
    // Ya redirigimos tras un login exitoso → no rebotar a carrito.
    if (redirectedRef.current) return;
    // Si el usuario insiste en cerrar, volvemos a la ruta de origen
    router.replace(returnTo === "/checkout/datos" ? "/marketplace/carrito" : returnTo);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--surface-canvas)]">
      {/* Header minimalista — solo logo + volver */}
      <header className="border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)]">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            <Link
              href="/marketplace"
              aria-label="Volver al marketplace"
              className="flex items-center text-[var(--accent)]"
            >
              <BulejeWordmark
                size={30}
                strokeWidth={1.75}
                textSize={17}
                className="text-[var(--accent-600)] dark:text-white"
              />
            </Link>
            <Link
              href="/marketplace/carrito"
              className="inline-flex items-center gap-1.5 text-[length:var(--ts-xs)] font-semibold text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              Volver al carrito
            </Link>
          </div>
        </div>
      </header>

      {/* Fondo vacío con hint sutil detrás del modal */}
      <main className="relative flex-1 flex items-center justify-center px-4 py-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <div className="text-center max-w-md opacity-40">
            <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)] mb-4">
              <ShieldCheck className="h-7 w-7" strokeWidth={1.75} aria-hidden />
            </span>
            <p className="text-xl sm:text-2xl font-black tracking-[var(--ls-tight)] text-[var(--text-primary)]">
              Inicia sesión para continuar
            </p>
            <p className="mt-2 text-[length:var(--ts-sm)] text-[var(--text-tertiary)]">
              Te pedimos loguearte para guardar tu pedido y poder trackearlo.
            </p>
          </div>
        </div>

        <AuthModal open onClose={handleClose} />
      </main>
    </div>
  );
}
