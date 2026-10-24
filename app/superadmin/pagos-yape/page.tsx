import "server-only";
import { CabeceraConPestanas } from "@/components/admin/shared/cabecera-con-pestanas";
import { ADMIN_TOKENS } from "@/app/admin/_components/_shared/admin-tokens";
import type { Metadata } from "next";
import { Smartphone } from "@buleje/design-system/icons";
import { requirePlatformPage } from "@/lib/superadmin-auth";
import { PaymentApprovalDb } from "@/lib/db/payment-approval.db";
import PagosYapeClient from "./PagosYapeClient";
import { SuperAdminModuleTabs, FINANZAS_TABS } from "@/components/superadmin/_shared/ModuleTabs";
import { SUPERADMIN_PAGE, SUPERADMIN_CONTENT } from "@/lib/superadmin-layout";

export const metadata: Metadata = {
  title: "Pagos Yape — Buleje Platform",
  robots: "noindex, nofollow",
};

export default async function PagosYapePage() {
  await requirePlatformPage();

  // Carga inicial SSR — el client hace polling cada 30s a partir de esto
  let initialCount = 0;
  try {
    const pending = await PaymentApprovalDb.listPending({ limit: 500 });
    initialCount = pending.length;
  } catch {
    initialCount = 0;
  }

  return (
    <div className={SUPERADMIN_PAGE}>
      <CabeceraConPestanas
        icon={Smartphone}
        title="Pagos Yape pendientes"
        kicker="Plataforma · Yape"
        info={{
          title: "Pagos Yape pendientes",
          body: "La IA lee cada captura: compara monto y operación detectados con los esperados. Atajos: / buscar · J/K navegar · A aprobar.",
          what: "Bandeja de comprobantes Yape que esperan tu aprobación manual.",
          affects: "Aprobar un comprobante confirma el pago del pedido o suscripción correspondiente.",
          example: "Un cliente paga por Yape y sube su captura → la revisas aquí y la apruebas para liberar el pedido.",
        }}
        /* El conteo de pendientes era un recuadro aparte a la derecha: ahora es el
           chip pegado al título, como «15 tiendas». */
        chip={
          initialCount > 0 ? (
            <span className={ADMIN_TOKENS.chipAccent}>
              {initialCount} pendiente{initialCount !== 1 ? "s" : ""}
            </span>
          ) : undefined
        }
        pestanas={<SuperAdminModuleTabs enLinea tabs={FINANZAS_TABS} />}
      />

      <div className={SUPERADMIN_CONTENT}>
        <PagosYapeClient initialCount={initialCount} />
      </div>
    </div>
  );
}
