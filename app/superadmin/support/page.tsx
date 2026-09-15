"use client";

/**
 * /superadmin/support — Bandeja de soporte cross-tenant (gestión de tiendas,
 * Brandon 2026-06-14). Cablea el componente SupportInbox (que ya existía pero
 * no tenía página ni endpoints) a /api/superadmin/support.
 */

import { Inbox } from "@buleje/design-system/icons";
import { AdminTabShell } from "../_components/_shared";
import SupportInbox from "@/components/superadmin/SupportInbox";
import {
  SuperAdminModuleTabs,
  COMUNICACION_TABS,
} from "@/components/superadmin/_shared/ModuleTabs";

export default function SupportPage() {
  return (
    <>
      <SuperAdminModuleTabs tabs={COMUNICACION_TABS} />
      <AdminTabShell
        info={{
          what: "Bandeja centralizada de tickets de soporte de todas las tiendas. Muestra los mensajes enviados por los dueños de tienda y permite responderlos y cambiar su estado (abierto, en progreso, resuelto).",
          affects:
            "Solo el superadmin ve esta bandeja. Los dueños de tienda ven la respuesta en su propio panel de soporte.",
          example:
            "Si 'Bodega Luis' envía 'no puedo imprimir boletas', el ticket aparece aquí. Respondes y el dueño ve tu respuesta desde su panel.",
        }}
        title="Soporte"
        kicker="Plataforma · Tiendas"
        description="Solicitudes de ayuda de todas las tiendas. Respondé y gestioná su estado."
        icon={Inbox}
      >
        <SupportInbox />
      </AdminTabShell>
    </>
  );
}
