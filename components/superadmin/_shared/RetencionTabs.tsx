"use client";

import { useEffect, useState } from "react";
import { SuperAdminModuleTabs, RETENCION_TABS } from "./ModuleTabs";
import { fetchSuperadmin } from "@/lib/superadmin/fetch-auth";

/**
 * Barra de tabs del hub Retención con badge en vivo del nº de alertas CRÍTICAS.
 * Wrapper client para que el contador aparezca consistente tanto en /alerts
 * (client) como en /rescue (server component). Fetch best-effort; si falla, no
 * muestra badge (degrada a la barra normal).
 */
export function RetencionTabs() {
  const [critical, setCritical] = useState(0);

  useEffect(() => {
    let alive = true;
    fetchSuperadmin("/api/superadmin/alerts")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d?.counts) setCritical(Number(d.counts.critical) || 0);
      })
      .catch((e) => void e); // best-effort: sin badge si falla
    // Se refresca cuando otra vista dispara el evento (igual que el badge del sidebar).
    const onChange = () => {
      fetchSuperadmin("/api/superadmin/alerts")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.counts) setCritical(Number(d.counts.critical) || 0);
        })
        .catch((e) => void e); // best-effort: sin badge si falla
    };
    window.addEventListener("superadmin-alerts-changed", onChange);
    return () => {
      alive = false;
      window.removeEventListener("superadmin-alerts-changed", onChange);
    };
  }, []);

  const tabs = RETENCION_TABS.map((t) =>
    t.href === "/superadmin/alerts" ? { ...t, badge: critical } : t,
  );
  return <SuperAdminModuleTabs tabs={tabs} />;
}
