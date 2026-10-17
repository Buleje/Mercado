"use client";

/**
 * «Acepta fiado» en el marketplace: al prenderlo, la tarjeta de la tienda en
 * /tiendas muestra la insignia y aparece en el filtro homónimo.
 *
 * Fuente de verdad: `Store.benefits.acceptsFiado` vía /api/marketplace/stores/my/fiado.
 * Si el negocio aún no publicó su tienda (`hasStore=false`) no hay dónde
 * mostrarla y la opción queda apagada.
 *
 * Era una tarjeta con interruptor al pie del Resumen (`FiadoMarketplaceToggle`,
 * 76 px de alto que se tocan una vez). Desde el 10-10 es una opción con tilde
 * en el menú «Más» de Me deben; la lógica es la misma.
 */
import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";

export function useFiadoMarketplace() {
  const [enabled, setEnabled] = useState(false);
  const [hasStore, setHasStore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/marketplace/stores/my/fiado", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive || !data) return;
        setEnabled(Boolean(data.acceptsFiado));
        setHasStore(data.hasStore !== false);
      })
      .catch((err) => logger.error("[fiado-marketplace] load failed", { error: String(err) }))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const alternar = useCallback(async () => {
    if (saving || !hasStore) return;
    const next = !enabled;
    setEnabled(next); // optimista
    setSaving(true);
    try {
      const res = await fetch("/api/marketplace/stores/my/fiado", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) {
        setEnabled(!next); // revertir
        const body: unknown = await res.json().catch((err: unknown) => ({ sinCuerpo: String(err) }));
        logger.error("[fiado-marketplace] save failed", { status: res.status, body });
      }
    } catch (err) {
      setEnabled(!next);
      logger.error("[fiado-marketplace] save error", { error: String(err) });
    } finally {
      setSaving(false);
    }
  }, [enabled, saving, hasStore]);

  return { enabled, hasStore, loading, saving, alternar };
}
