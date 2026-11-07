"use client";

/**
 * Aviso de «estamos cerrados» del bot (como el mensaje de ausencia de WhatsApp
 * Business, opción «solo fuera del horario»). Va en Mensajes › Números y bot,
 * debajo de los números. Apagado por defecto.
 *
 * El horario no se edita acá: es el de la tienda (Marketplace › Tienda ›
 * Horario). Sin horario cargado el aviso no sale, y se dice.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { cn } from "@/lib/utils";
import { button } from "@/components/ui-system/button-variants";
import { Interruptor } from "@/components/ui-system/Interruptor";
import { CAMPO_INPUT } from "@/components/admin/shared/campos-personalizados-ui";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";

interface EstadoAviso {
  ajuste: { activo: boolean; texto: string };
  horario: { resumen: string | null; abiertoAhora: boolean | null; proximaApertura: string | null };
  vistaPrevia: string;
}

const RUTA = "/api/admin/whatsapp/fuera-de-horario";
const TEXTO_MAXIMO = 600;

function lineaHorario(h: EstadoAviso["horario"]): string {
  if (!h.resumen) return "Primero carga el horario de tu tienda en Marketplace › Tienda: sin horario el aviso no sale.";
  const ahora = h.abiertoAhora ? "ahora abierta" : `ahora cerrada${h.proximaApertura ? `, abre ${h.proximaApertura}` : ""}`;
  return `Tu horario: ${h.resumen} · ${ahora}.`;
}

export default function FueraDeHorarioBot() {
  const [estado, setEstado] = useState<EstadoAviso | null>(null);
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(RUTA)
      .then(async (r) => (r.ok ? ((await r.json()) as EstadoAviso) : null))
      .then((j) => {
        if (!vivo || !j) return;
        setEstado(j);
        setTexto(j.ajuste.texto);
      })
      .catch(() => {
        if (vivo) setError("No se pudo leer el aviso.");
      });
    return () => {
      vivo = false;
    };
  }, []);

  const guardar = useCallback(async (activo: boolean, nuevoTexto: string) => {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(RUTA, {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ activo, texto: nuevoTexto }),
      });
      const j = (await res.json().catch(() => null)) as (EstadoAviso & { error?: string }) | null;
      if (!res.ok || !j || j.error) {
        setError(j?.error ?? "No se pudo guardar el aviso.");
        return;
      }
      setEstado(j);
      setTexto(j.ajuste.texto);
    } catch {
      setError("Sin conexión: no se guardó.");
    } finally {
      setGuardando(false);
    }
  }, []);

  if (!estado) {
    return error ? <p className="text-sm text-[var(--text-secondary)]">{error}</p> : null;
  }

  const { ajuste } = estado;
  const cambiado = texto.trim() !== ajuste.texto;
  const vacio = texto.trim().length === 0;

  return (
    <section className="space-y-2" aria-label="Aviso cuando la tienda está cerrada">
      <div className="flex items-center gap-2">
        <Interruptor
          className="flex-1"
          enabled={ajuste.activo}
          disabled={guardando || (vacio && !ajuste.activo)}
          onChange={(v) => void guardar(v, texto.trim() || ajuste.texto)}
          label="Avisar cuando la tienda está cerrada"
          desc={lineaHorario(estado.horario)}
        />
        <InfoTip
          title="Aviso de tienda cerrada"
          what="Si te escriben fuera de tu horario, el bot manda primero este texto y después sigue contestando precios y pedidos. A cada cliente le llega una sola vez cada 12 horas."
          affects="Usa el horario de tu tienda (Marketplace › Tienda › Horario), en hora de Lima. Si una persona está atendiendo ese chat (bot pausado), no se manda. {apertura} se cambia por cuándo abres."
          example="Te escriben un domingo a las 21:00: «¡Hola! En este momento la tienda está cerrada; abrimos mañana a las 08:00…»."
        />
      </div>

      {ajuste.activo && (
        <div className="space-y-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
          <label htmlFor="aviso-cerrado-texto" className="block text-sm font-semibold text-[var(--text-primary)]">
            Texto del aviso
          </label>
          <textarea
            id="aviso-cerrado-texto"
            rows={3}
            maxLength={TEXTO_MAXIMO}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            className={cn(CAMPO_INPUT, "h-auto min-h-[6rem] py-2.5 leading-relaxed")}
          />
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 text-sm text-[var(--text-secondary)]">
              {cambiado ? "Escribe {apertura} donde va cuándo abres." : `Así le llega hoy: «${estado.vistaPrevia}»`}
            </p>
            {cambiado && (
              <button
                type="button"
                disabled={guardando || vacio}
                onClick={() => void guardar(true, texto.trim())}
                className={button({ variant: "primary", className: "rounded-xl" })}
              >
                {guardando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Guardar texto
              </button>
            )}
          </div>
        </div>
      )}
      {error && <p className="text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>}
    </section>
  );
}
