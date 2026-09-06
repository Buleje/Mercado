"use client";

/**
 * /checkout/datos — REDIRECT (Brandon 2026-07-06).
 *
 * "Datos" y "entrega" se unificaron en una sola página (/checkout/entrega, que
 * ahora captura quién recibe + dirección + pago). Mantenemos esta ruta como
 * redirect para links/bookmarks viejos y para el back de navegadores.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckoutTransitionOverlay } from "@/components/marketplace/checkout/CheckoutTransitionOverlay";

export default function CheckoutDatosPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/checkout/entrega");
  }, [router]);
  return <CheckoutTransitionOverlay show label="Cargando tu pedido" />;
}
