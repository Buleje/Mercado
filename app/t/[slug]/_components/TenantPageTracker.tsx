"use client";

import { useEffect } from "react";
import { csrfHeaders } from "@/lib/csrf-client";

/**
 * Client beacon — trackea pageview al /api/store-page/visits.
 * Persist sessionId en sessionStorage para correlar conversiones.
 */
export default function TenantPageTracker({ tenantSlug }: { tenantSlug: string }) {
  useEffect(() => {
    try {
      let sessionId = sessionStorage.getItem("bp_sid");
      if (!sessionId) {
        sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
        sessionStorage.setItem("bp_sid", sessionId);
      }

      const url = new URL(window.location.href);
      const utmSource = url.searchParams.get("utm_source");

      const body = JSON.stringify({
        tenantSlug,
        sessionId,
        referrer: document.referrer || null,
        utmSource,
        path: url.pathname,
      });

      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: "application/json" });
        navigator.sendBeacon("/api/store-page/visits", blob);
      } else {
        void fetch("/api/store-page/visits", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body,
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      // silent — analytics never blocks UX
    }
  }, [tenantSlug]);

  return null;
}
