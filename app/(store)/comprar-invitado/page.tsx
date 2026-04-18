/**
 * Página /comprar-invitado — Guest Checkout standalone.
 *
 * Ubicación: `app/(store)/comprar-invitado/` (fuera de `/checkout/**` para
 * respetar zona de peligro). La ruta pública es `/comprar-invitado`.
 *
 * Demo standalone — no toca checkout real. Muestra el form de guest buy
 * con items mock (en producción, los items vendrían del cart-context).
 */

import type { Metadata } from "next";
import ComprarInvitadoClient from "./ComprarInvitadoClient";

export const metadata: Metadata = {
  title: "Comprar sin cuenta | Buleje",
  description:
    "Compra rápida sin registrarte. Te enviamos el link de seguimiento al celular.",
  robots: { index: false, follow: false },
};

export default function ComprarInvitadoPage() {
  return (
    <main className="min-h-screen bg-[var(--surface-canvas)] py-8 md:py-12">
      <div className="mx-auto max-w-3xl px-4 space-y-6">
        <header>
          <h1 className="text-[length:var(--ts-2xl)] font-extrabold text-[var(--text-primary)]">
            Comprar sin cuenta
          </h1>
          <p className="mt-2 text-[length:var(--ts-sm)] text-[var(--text-secondary)]">
            Rápido y sin contraseña. Completá tus datos una vez y te enviamos el
            seguimiento por WhatsApp.
          </p>
        </header>

        <ComprarInvitadoClient />
      </div>
    </main>
  );
}
