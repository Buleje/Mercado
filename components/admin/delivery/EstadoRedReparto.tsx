"use client";

/**
 * «Reparten: tu equipo» / «tu equipo + red Buleje» (17-10, P30).
 *
 * Antes la red de repartidores Buleje sólo se veía abriendo Más › Red: al
 * asignar no se sabía quién más podía ver y aceptar el pedido. La pastilla va
 * en la fila de Asignaciones y abre la misma ventana de siempre para cambiarlo.
 * Sin permiso para leerla (cajero: 403) no se muestra.
 */
import { useCallback, useEffect, useState } from "react";
import { Globe, Users } from "@buleje/design-system/icons";
import { tenantFetch } from "@/lib/tenant-fetch";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";

/** El estado de la red, leído una vez mientras la sección lo necesite. */
export function useEstadoRedReparto(activo: boolean) {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await tenantFetch("/api/admin/delivery/network-toggle");
      if (!res.ok) return setEnabled(null);
      const json = (await res.json()) as { enabled?: boolean };
      setEnabled(typeof json.enabled === "boolean" ? json.enabled : null);
    } catch {
      setEnabled(null);
    }
  }, []);

  useEffect(() => {
    if (activo) void cargar();
  }, [activo, cargar]);

  return { enabled, setEnabled };
}

export function EstadoRedReparto({ enabled, onAbrir }: { enabled: boolean | null; onAbrir: () => void }) {
  if (enabled == null) return null;
  const Icono = enabled ? Globe : Users;
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={onAbrir}
        title="Cambiar quién reparte (Red de repartidores Buleje)"
        className="inline-flex h-12 items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)]"
      >
        <Icono className="h-4 w-4 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden />
        <span className="whitespace-nowrap">Reparten: {enabled ? "tu equipo + red Buleje" : "tu equipo"}</span>
      </button>
      <InfoTip
        title="Quién ve y acepta tus pedidos"
        what={
          enabled
            ? "Los pedidos que esperan repartidor se ofrecen a tu equipo y a los repartidores de la red Buleje cercanos, por su app. El primero que acepta se lo lleva."
            : "Sólo tu equipo: los pedidos que esperan repartidor se ofrecen a tus repartidores conectados y libres, o se los asignas tú aquí."
        }
        affects="Cambiarlo no reasigna los pedidos que ya tienen repartidor. Sólo el dueño, el administrador o el encargado pueden cambiarlo."
      />
    </span>
  );
}
