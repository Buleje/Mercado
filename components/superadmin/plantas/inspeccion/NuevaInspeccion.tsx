"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck } from "@buleje/design-system/icons";
import { Button } from "@/components/ui-system/Button";
import { fetchSuperadmin } from "@/lib/superadmin/fetch-auth";
import { limaDateKey } from "@/lib/utils";
import { mensajeDeError } from "../use-carga";
import { enlaceInspeccion } from "./TablaInspecciones";

/**
 * Abre una inspección de hoy (congela el libro de la planta en ese momento) y
 * lleva a ella. Congelar lee todo el libro: tarda unos segundos.
 */
export function NuevaInspeccion({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const [abriendo, setAbriendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abrir = async () => {
    setAbriendo(true);
    setError(null);
    try {
      const res = await fetchSuperadmin(`/api/superadmin/plantas/${encodeURIComponent(tenantId)}/inspecciones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha: limaDateKey() }),
      });
      if (!res.ok) {
        setError(await mensajeDeError(res));
        setAbriendo(false);
        return;
      }
      const d = (await res.json()) as { id: string; tenantId?: string };
      router.push(enlaceInspeccion({ tenantId: d.tenantId ?? tenantId, id: d.id }));
    } catch {
      setError("Sin conexión con el servidor. Revisa tu internet y vuelve a intentar.");
      setAbriendo(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant="primary" onClick={() => void abrir()} disabled={abriendo}>
        <ClipboardCheck className="h-4 w-4" aria-hidden />
        {abriendo ? "Congelando el libro…" : "Nueva inspección"}
      </Button>
      {error && (
        <span role="alert" className="text-sm text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]">
          {error}
        </span>
      )}
    </div>
  );
}
