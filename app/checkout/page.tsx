import { redirect } from "next/navigation";

/**
 * /checkout (segmento padre) — sin UI propia, redirect al primer step.
 *
 * El flujo de checkout esta dividido en 4 pasos: auth -> datos -> entrega ->
 * confirmar. Sin este page.tsx el segmento devolvia 404 (el layout existia
 * pero Next requiere page.tsx en cada nodo navegable).
 *
 * Redirect a /checkout/datos: si el usuario no esta logged el layout step
 * dispara el gate de auth automaticamente (CheckoutAuthGate).
 */
export default function CheckoutIndexPage() {
  redirect("/checkout/datos");
}
