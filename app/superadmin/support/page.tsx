"use client";

/**
 * /superadmin/support — Bandeja de soporte cross-tenant (gestión de tiendas,
 * Brandon 2026-06-14). Cablea el componente SupportInbox (que ya existía pero
 * no tenía página ni endpoints) a /api/superadmin/support.
 */

import { Inbox } from "@buleje/design-system/icons";
import { AdminTabShell } from "../_components/_shared";
import SupportInbox from "@/components/superadmin/SupportInbox";

export default function SupportPage() {
  return (
    <AdminTabShell
      title="Soporte"
      kicker="Plataforma · Tiendas"
      description="Solicitudes de ayuda de todas las tiendas. Respondé y gestioná su estado."
      icon={Inbox}
    >
      <SupportInbox />
    </AdminTabShell>
  );
}
