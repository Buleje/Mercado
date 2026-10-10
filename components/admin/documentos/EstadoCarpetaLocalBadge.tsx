"use client";

/**
 * EstadoCarpetaLocalBadge — "¿está conectado mi escritorio?", a la vista.
 *
 * Antes esto sólo se sabía entrando a la vista "Mi PC": si alguien vinculó
 * una carpeta hace semanas y el navegador le retiró el permiso (pasa solo,
 * el permiso vuelve a "prompt" en cada sesión nueva), el drive seguía
 * mostrando el header normal sin ningún aviso de que la sincronización
 * automática dejó de correr (Brandon 2026-08-28: "un aviso si está
 * conectado con mi escritorio o no").
 *
 * Deliberadamente NO usa `useCarpetaLocal` (ese hook arranca el ciclo
 * automático de 60s): esto es sólo LECTURA — el vínculo guardado + el
 * permiso actual — para no correr el motor de sync dos veces si además
 * está montado `CarpetaLocalPanel` en la vista "Mi PC".
 */

import { useEffect, useState } from "react";
import { FolderOpen, Link2Off, Pause } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { leerVinculo } from "@/lib/documentos/carpeta-local/almacen";
import { permisoDeEscritura, soportado } from "@/lib/documentos/carpeta-local/disco";

type Estado = "cargando" | "sin-soporte" | "sin-vincular" | "pausado" | "sin-permiso" | "conectado";

export default function EstadoCarpetaLocalBadge({
  tenantId,
  onAbrir,
}: {
  tenantId: string;
  /** Lleva a la vista "Mi PC" — para vincular, dar permiso o revisar. */
  onAbrir: () => void;
}) {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [nombre, setNombre] = useState<string | null>(null);

  useEffect(() => {
    if (!soportado() || !tenantId) { setEstado("sin-soporte"); return; }
    let vivo = true;
    const revisar = async () => {
      const v = await leerVinculo(tenantId).catch((err) => {
        logger.warn("[EstadoCarpetaLocalBadge] no se pudo leer el vínculo", { error: String(err) });
        return null;
      });
      if (!vivo) return;
      if (!v) { setEstado("sin-vincular"); setNombre(null); return; }
      setNombre(v.nombre);
      if (v.pausado) { setEstado("pausado"); return; }
      const permiso = await permisoDeEscritura(v.handle).catch(() => "denied" as const);
      if (!vivo) return;
      setEstado(permiso === "granted" ? "conectado" : "sin-permiso");
    };
    void revisar();
    // El permiso se puede revocar desde el navegador mientras esta pestaña
    // estaba en segundo plano — se re-chequea al volver a mirarla.
    const onFocus = () => void revisar();
    window.addEventListener("focus", onFocus);
    return () => { vivo = false; window.removeEventListener("focus", onFocus); };
  }, [tenantId]);

  if (estado === "cargando" || estado === "sin-soporte") return null;

  const META: Record<Exclude<Estado, "cargando" | "sin-soporte">, { texto: string; cls: string; Icon: typeof FolderOpen; titulo: string }> = {
    "sin-vincular": {
      texto: "Escritorio: sin vincular",
      cls: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
      Icon: Link2Off,
      titulo: "Ninguna carpeta de tu PC está vinculada con este drive — clic para vincular una.",
    },
    pausado: {
      texto: "Escritorio pausado",
      cls: "bg-[var(--data-warning-500)]/10 text-[var(--data-warning-700)] hover:brightness-110 dark:text-[var(--data-warning)]",
      Icon: Pause,
      titulo: `"${nombre}" está vinculada pero pausada — no se sincroniza sola.`,
    },
    "sin-permiso": {
      texto: "Escritorio: falta permiso",
      cls: "bg-[var(--data-error-500)]/10 text-[var(--data-error-700)] hover:brightness-110 dark:text-[var(--data-error)]",
      Icon: Link2Off,
      titulo: `El navegador retiró el permiso sobre "${nombre}" — clic para dárselo de nuevo.`,
    },
    conectado: {
      texto: "Escritorio conectado",
      cls: "bg-[var(--data-success-500)]/10 text-[var(--data-success-700)] hover:brightness-110 dark:text-[var(--data-success)]",
      Icon: FolderOpen,
      titulo: `Sincronizada con "${nombre}".`,
    },
  };

  const m = META[estado];
  return (
    <button
      type="button"
      onClick={onAbrir}
      title={m.titulo}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors",
        m.cls,
      )}
    >
      <m.Icon className="h-4 w-4 shrink-0" />
      {m.texto}
    </button>
  );
}
