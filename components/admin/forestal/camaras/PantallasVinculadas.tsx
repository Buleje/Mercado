"use client";

/**
 * Las pantallas que hoy ven las cámaras (Modo TV): nombre, qué cámaras,
 * cuándo la vio el TV por última vez, hasta cuándo, y «Desconectar».
 */

import { useEffect, useMemo, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { Loader2, LogOut, RefreshCw, Tv } from "@buleje/design-system/icons";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { BTN } from "./camaras-ui";
import { fechaHora, textoCamaras, textoVisto } from "./otra-pantalla-ui";
import type { PantallasTv } from "./use-pantallas-tv";

interface Props {
  camaras: readonly { id: string; nombre: string }[];
  p: PantallasTv;
}

export default function PantallasVinculadas({ camaras, p }: Props) {
  const { confirm } = useConfirm();
  const nombres = useMemo(() => new Map(camaras.map((c) => [c.id, c.nombre])), [camaras]);
  /* «visto hace X» se mueve solo mientras el modal está abierto. */
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const desconectar = async (id: string, nombre: string) => {
    const ok = await confirm({
      title: `¿Desconectar «${nombre}»?`,
      description: "El televisor deja de ver las cámaras al toque. Para volver, tendrás que vincularlo con un código nuevo.",
      intent: "danger",
      confirmLabel: "Desconectar",
    });
    if (ok) await p.desconectar(id);
  };

  return (
    <section className="space-y-2 border-t border-[var(--rule-soft)] pt-3" aria-labelledby="tv-vinculadas-titulo">
      <div className="flex items-center gap-2">
        <CardTitle as="h3" id="tv-vinculadas-titulo" className="flex-1 text-sm font-bold">
          Pantallas vinculadas ({p.pantallas.length})
        </CardTitle>
        <button type="button" onClick={() => void p.recargar()} className={`${BTN} w-9 justify-center px-0`} aria-label="Actualizar la lista">
          <RefreshCw className={`h-4 w-4 ${p.cargando ? "animate-spin" : ""}`} aria-hidden />
        </button>
      </div>
      {p.cargando && p.pantallas.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando…
        </p>
      ) : p.pantallas.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)]">Ningún televisor está viendo las cámaras.</p>
      ) : (
        <ul className="space-y-2">
          {p.pantallas.map((x) => {
            const vencida = Date.parse(x.expiraEn) <= ahora;
            return (
              <li
                key={x.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2"
                data-pantalla-tv={x.id}
              >
                <Tv className="h-5 w-5 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-[var(--text-primary)]">{x.nombre}</p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {textoCamaras(x.camaras, nombres)} · {textoVisto(x.ultimaVez, ahora)} ·{" "}
                    {vencida ? "venció" : "vence"} {fechaHora(x.expiraEn)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void desconectar(x.id, x.nombre)}
                  disabled={p.guardando}
                  className={BTN}
                >
                  <LogOut className="h-4 w-4" aria-hidden /> Desconectar
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
