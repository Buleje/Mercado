"use client";

/**
 * SeccionTelegram — el resumen de la agenda por Telegram: a qué hora el de la
 * mañana y el de la noche (del negocio, no de la persona). Guarda solo al
 * cambiar, sin el «Guardar» del modal. Sólo lo ven quienes escriben la agenda.
 * Se monta en `ConfigAvisoModal`. API: `/api/admin/agenda/telegram`.
 */
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { Send } from "@buleje/design-system/icons";
import { CAMPO_ALTO } from "@/components/admin/planificacion/piezas/clases";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { button } from "@/components/ui-system/button-variants";
import { useMiRol } from "@/hooks/use-mi-rol";
import { puedeEscribirAgenda } from "@/lib/admin/agenda-acceso";
import { csrfHeaders } from "@/lib/csrf-client";
import type { ConfigResumenTelegram, Momento } from "@/lib/agenda/resumen-telegram";
import { Casilla } from "@/components/ui-system/Casilla";

const API = "/api/admin/agenda/telegram";
const VINCULAR = "/admin?tab=asistente-ia&vista=automatizaciones";
const FILAS: readonly { m: Momento; titulo: string; texto: string }[] = [
  { m: "manana", titulo: "Mañana", texto: "Lo que toca hoy y lo atrasado" },
  { m: "noche", titulo: "Noche", texto: "Cierre del día: lo que quedó sin hacer" },
];

interface Estado {
  config: ConfigResumenTelegram;
  chats: number;
  botConfigurado: boolean;
}

async function pedir(metodo: "PUT" | "POST", url: string, body?: unknown): Promise<Record<string, unknown>> {
  const r = await fetch(url, { method: metodo, headers: csrfHeaders({ "Content-Type": "application/json" }), body: body ? JSON.stringify(body) : undefined });
  const d = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new Error(typeof d.error === "string" ? d.error : "No se pudo. Reintenta.");
  return d;
}

export function SeccionTelegram() {
  const puede = puedeEscribirAgenda(useMiRol());
  const id = useId();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [fallo, setFallo] = useState(false);
  const [probando, setProbando] = useState(false);
  // La hora que se ve (la por defecto, la guardada o la última elegida): al apagar y volver a prender, vuelve ésa.
  const [horas, setHoras] = useState<Record<Momento, string>>({ manana: "07:00", noche: "19:30" });

  useEffect(() => {
    if (!puede) return;
    let vivo = true;
    fetch(API, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Estado>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (!vivo) return;
        setEstado(d);
        setHoras((h) => ({ manana: d.config.manana ?? h.manana, noche: d.config.noche ?? h.noche }));
      })
      .catch(() => vivo && setFallo(true));
    return () => {
      vivo = false;
    };
  }, [puede]);

  if (!puede) return null;

  const guardar = async (config: ConfigResumenTelegram) => {
    if (!estado) return;
    const antes = estado.config;
    setEstado({ ...estado, config });
    try {
      await pedir("PUT", API, config);
      toast.success("Resumen por Telegram guardado");
    } catch (e) {
      setEstado((s) => (s ? { ...s, config: antes } : s));
      toast.error(e instanceof Error ? e.message : "No se guardó. Reintenta.");
    }
  };
  const alternar = (m: Momento, prender: boolean) => estado && void guardar({ ...estado.config, [m]: prender ? horas[m] : null });
  const fijarHora = (m: Momento) => estado && estado.config[m] && horas[m] && horas[m] !== estado.config[m] && void guardar({ ...estado.config, [m]: horas[m] });

  const probar = async () => {
    setProbando(true);
    try {
      const d = await pedir("POST", `${API}?prueba=1`);
      toast.success(d.enviados === 1 ? "Mandado a tu chat de Telegram" : `Mandado a ${String(d.enviados)} chats de Telegram`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se mandó. Reintenta.");
    } finally {
      setProbando(false);
    }
  };

  const listo = estado && estado.botConfigurado && estado.chats > 0;

  return (
    <div className="space-y-2">
      <span id={`${id}-tg`} className="block text-sm font-semibold text-[var(--text-secondary)]">
        Por Telegram
      </span>
      {fallo && !estado && <p className="text-sm text-[var(--text-tertiary)]">No se pudo leer el resumen por Telegram. Cierra y vuelve a abrir.</p>}
      {estado && (
        <>
          <div role="group" aria-labelledby={`${id}-tg`} className="space-y-2">
            {FILAS.map((f) => (
              <div key={f.m} className="flex min-h-12 items-center gap-3 rounded-lg border border-[var(--rule-base)] px-3 py-2 text-sm text-[var(--text-primary)]">
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                  <Casilla checked={estado.config[f.m] !== null} onChange={(e) => alternar(f.m, e.target.checked)} />
                  <span className="min-w-0">
                    <span className="block font-semibold">{f.titulo}</span>
                    <span className="block text-[var(--text-tertiary)]">{f.texto}</span>
                  </span>
                </label>
                <div className="w-32 shrink-0">
                  <input
                    type="time"
                    aria-label={`Hora del resumen de la ${f.titulo.toLowerCase()}`}
                    className={CAMPO_ALTO}
                    value={horas[f.m]}
                    disabled={estado.config[f.m] === null}
                    onChange={(e) => setHoras((h) => ({ ...h, [f.m]: e.target.value }))}
                    onBlur={() => fijarHora(f.m)}
                    onKeyDown={(e) => e.key === "Enter" && fijarHora(f.m)}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 text-sm text-[var(--text-tertiary)]">
              {!estado.botConfigurado ? (
                "El bot de Telegram no está configurado en el servidor."
              ) : estado.chats > 0 ? (
                `Va a ${estado.chats} chat${estado.chats === 1 ? "" : "s"} vinculado${estado.chats === 1 ? "" : "s"}.`
              ) : (
                <>
                  Sin chat: vincúlalo en <EnlacePanel href={VINCULAR}>Asistente IA › Automatizaciones</EnlacePanel>.
                </>
              )}
            </p>
            <button type="button" className={button({ variant: "secondary" })} onClick={() => void probar()} disabled={!listo || probando}>
              <Send className="size-4" aria-hidden="true" />
              {probando ? "Mandando…" : "Mandar uno de prueba"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
