"use client";

/**
 * «N papeles de guías siguen en carpetas por mes · Ordenarlos» (ADR-442).
 *
 * Antes de ADR-442 los papeles de una guía se guardaban en «Guías forestales
 * (GTF) / año / mes». Esto los muda, con un botón, a la carpeta del titular ›
 * permiso › GTF. Si no queda ninguno, no dibuja nada.
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { FolderInput, Loader2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import { useMiRol } from "@/hooks/use-mi-rol";
import { Btn } from "./ctp-shared";

const RUTA = "/api/admin/forestal/guias/guardadas/ordenar";

interface Pendientes {
  pendientes: number;
  papeles: { name: string; gtf: string; destino: string[] }[];
}

export default function CtpOrdenarPapelesViejos({ onOrdenados }: { onOrdenados?: () => void }) {
  const [datos, setDatos] = useState<Pendientes | null>(null);
  const [ordenando, setOrdenando] = useState(false);
  const rol = useMiRol();
  /* Reordenar el Drive es de admin y dueño (el servidor rechaza al resto). */
  const puede = rol == null || rol === "admin" || rol === "owner" || rol === "superadmin";

  const leer = useCallback(async () => {
    try {
      const r = await fetch(RUTA, { credentials: "include" });
      if (r.ok) setDatos((await r.json()) as Pendientes);
    } catch (err) {
      logger.warn("[papeles-viejos] no se pudo leer", { error: String(err) });
    }
  }, []);

  useEffect(() => {
    void leer();
  }, [leer]);

  if (!datos || datos.pendientes === 0) return null;

  const ordenar = async () => {
    setOrdenando(true);
    try {
      const r = await fetch(RUTA, { method: "POST", credentials: "include", headers: csrfHeaders() });
      const j = (await r.json().catch((err: unknown) => {
        logger.warn("[papeles-viejos] respuesta sin JSON", { status: r.status, error: String(err) });
        return null;
      })) as { movidos?: number; message?: string } | null;
      if (!r.ok) {
        toast.error(j?.message ?? "No se pudieron ordenar los papeles.");
        return;
      }
      const n = j?.movidos ?? 0;
      toast.success(n === 1 ? "1 papel ordenado" : `${n} papeles ordenados`, {
        description: "Ahora están en la carpeta de su titular y permiso, en Documentos.",
      });
      onOrdenados?.();
      await leer();
    } catch (err) {
      logger.error("[papeles-viejos] ordenar failed", { error: String(err) });
      toast.error("No se pudieron ordenar los papeles. Revisa la señal y prueba de nuevo.");
    } finally {
      setOrdenando(false);
    }
  };

  const ejemplo = datos.papeles[0];
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2">
      <FolderInput className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
      <p className="min-w-0 flex-1 basis-48 text-sm text-[var(--text-secondary)]">
        <b className="tabular-nums text-[var(--text-primary)]">
          {datos.pendientes} {datos.pendientes === 1 ? "papel de guía sigue" : "papeles de guías siguen"}
        </b>{" "}
        en carpetas por mes
      </p>
      <InfoTip
        title="Papeles en carpetas por mes"
        what="Antes, los papeles de cada guía se guardaban por año y mes. Ahora van en la carpeta del titular y su permiso, una por guía."
        affects="Sólo cambian de carpeta en Documentos: siguen en su casillero y en su guía. Las carpetas de mes que queden vacías se quitan."
        example={ejemplo ? `«${ejemplo.name}» → ${ejemplo.destino.slice(1).join(" › ")}` : undefined}
      />
      <Btn
        variant="secondary"
        onClick={() => void ordenar()}
        disabled={ordenando || !puede}
        title={puede ? undefined : "Sólo el administrador o el dueño pueden reordenar Documentos"}
        className="max-sm:w-full"
      >
        {ordenando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {ordenando ? "Ordenando…" : "Ordenarlos"}
      </Btn>
    </div>
  );
}
