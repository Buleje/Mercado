"use client";

import { useEffect, useState } from "react";
import { SuperAdminModuleTabs, VENDORS_TABS } from "./ModuleTabs";
import { fetchSuperadmin } from "@/lib/superadmin/fetch-auth";

/**
 * Barra de tabs del hub Vendors con badge en vivo del nº de SOLICITUDES pendientes
 * de revisión. Best-effort: si el fetch falla, degrada a la barra sin badge.
 */
export function VendorsTabs() {
  const [pending, setPending] = useState(0);

  useEffect(() => {
    let alive = true;
    fetchSuperadmin("/api/superadmin/vendor-applications?status=pending")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && typeof d?.count === "number") setPending(d.count);
      })
      .catch((e) => void e); // best-effort: sin badge si falla
    return () => {
      alive = false;
    };
  }, []);

  const tabs = VENDORS_TABS.map((t) =>
    t.href === "/superadmin/vendor-applications" ? { ...t, badge: pending } : t,
  );
  return <SuperAdminModuleTabs tabs={tabs} />;
}
