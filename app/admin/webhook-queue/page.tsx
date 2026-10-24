"use client";

/**
 * /admin/webhook-queue — página suelta (la enlazan el Control Center del
 * superadmin y /panel). Su contenido vive en
 * components/admin/sistema/WebhooksStripe.tsx desde la ola 2 del plan «panel
 * unificado»: el mismo se ve como bloque en Configuración › Sistema › Colas.
 * Esta página sigue abriendo igual.
 */
import React from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Inbox } from "@buleje/design-system/icons";
import AdminTabShell from "@/app/admin/_components/_shared/AdminTabShell";
import { button } from "@/components/ui-system/button-variants";
import { WebhooksStripeAcciones, WebhooksStripeContenido } from "@/components/admin/sistema/WebhooksStripe";
import { useWebhooksStripe } from "@/components/admin/sistema/use-webhooks-stripe";

export default function WebhookQueuePage() {
  const router = useRouter();
  const w = useWebhooksStripe();

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)] p-4 sm:p-8">
      <div className="mb-4">
        <button
          type="button"
          onClick={() => router.push("/admin")}
          className={button({ variant: "ghost", className: "rounded-xl px-3" })}
          aria-label="Volver al admin"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Volver al admin
        </button>
      </div>

      <AdminTabShell
        title="Webhooks de Stripe por reintentar"
        description="Avisos de pago que no se procesaron: la cola los reintenta sola, cada vez más espaciado."
        icon={Inbox}
        actions={<WebhooksStripeAcciones w={w} />}
      >
        <WebhooksStripeContenido w={w} />
      </AdminTabShell>
    </div>
  );
}
