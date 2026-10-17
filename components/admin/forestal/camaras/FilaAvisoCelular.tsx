"use client";

/**
 * «Avisarme en este celular» (2026-10-10): el aviso del detector del mosaico
 * llega como notificación al dispositivo donde se prende, sin WhatsApp ni
 * plantilla. Debajo, a qué dispositivos llega hoy el aviso de esta cámara.
 */

import { BellRing, Send, Smartphone, X } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import type { CuandoCelular } from "@/lib/camaras/avisar-push";
import { BTN } from "./camaras-ui";
import { useAvisoCelular } from "./use-aviso-celular";

const FRANJA: Record<CuandoCelular, string> = { noche: "de noche", siempre: "siempre" };

export default function FilaAvisoCelular({ camaraId, nombre }: { camaraId: string; nombre: string }) {
  const { datos, soporte, este, ocupado, mensaje, prender, quitar, probar } = useAvisoCelular(camaraId);
  const valor: CuandoCelular | "no" = este?.cuando ?? "no";
  const sinClaves = datos !== null && !datos.clavePublica;
  const lista = datos?.dispositivos ?? [];

  return (
    <div className="flex w-full basis-full flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex w-full items-center gap-2 text-sm text-[var(--text-secondary)] sm:w-auto sm:flex-1">
          <Smartphone className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
          <span className="whitespace-nowrap font-bold">Avisarme en este celular</span>
          <InfoTip
            title="Avisos al celular"
            what="Cuando el video en vivo ve aparecer a alguien en esta cámara, te llega una notificación a este celular o PC, aunque el panel esté cerrado. Sale de la PC que tiene el mosaico abierto."
            affects="Como mucho un aviso cada 10 minutos por cámara. No lleva la foto: al tocarlo abre «Personas» en el panel, con tu sesión. En iPhone, primero agrega el panel a la pantalla de inicio."
            example="Prende «sólo de noche» en el portón y a las 23:40 te llega «Portón · 23:40 — Apareció una persona»."
          />
        </div>
        <select
          value={valor}
          disabled={ocupado || soporte === false || sinClaves || datos === null}
          onChange={(e) => {
            const v = e.target.value as CuandoCelular | "no";
            if (v === "no") {
              if (este) void quitar(este.id);
            } else void prender(v);
          }}
          aria-label={`Avisos de ${nombre} en este celular`}
          className="h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] disabled:opacity-50"
        >
          <option value="no">no</option>
          <option value="noche">sólo de noche (19–06)</option>
          <option value="siempre">siempre</option>
        </select>
        <button
          type="button"
          onClick={() => void probar()}
          disabled={ocupado || !este}
          className={cn(BTN, "disabled:opacity-40")}
          title="Manda un aviso de prueba a este dispositivo"
        >
          <Send className="h-4 w-4" aria-hidden /> Probar
        </button>
      </div>

      {soporte === false ? (
        <p className="text-xs text-[var(--text-tertiary)]">Este navegador no recibe notificaciones. En iPhone: Compartir › Agregar a inicio, y abre el panel desde ahí.</p>
      ) : sinClaves ? (
        <p className="text-xs text-[var(--data-warning-ink)]">El servidor no tiene las claves de avisos (VAPID): por ahora sólo avisa el WhatsApp.</p>
      ) : null}

      {lista.length > 0 && (
        <ul className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-secondary)]" aria-label={`Dispositivos que reciben los avisos de ${nombre}`}>
          <li className="flex items-center gap-1 font-bold">
            <BellRing className="h-3.5 w-3.5 text-[var(--text-tertiary)]" aria-hidden /> Llega a:
          </li>
          {lista.map((d) => {
            const esEste = d.id === este?.id;
            const puedeQuitar = d.tuyo || datos?.puedeQuitarOtros;
            return (
              <li
                key={d.id}
                className={cn(
                  "flex items-center gap-1 rounded-full border px-2 py-0.5",
                  esEste ? "border-[var(--accent)] text-[var(--text-primary)]" : "border-[var(--rule-base)]",
                )}
              >
                <span>
                  {d.dispositivo} · {d.tuyo ? "tú" : d.usuario}
                  {esEste ? " (este)" : ""} · {FRANJA[d.cuando]}
                </span>
                {puedeQuitar && !esEste && (
                  <button
                    type="button"
                    onClick={() => void quitar(d.id)}
                    disabled={ocupado}
                    className="grid h-6 w-6 place-items-center rounded-full text-[var(--text-tertiary)] hover:text-[var(--data-error-ink)]"
                    aria-label={`Dejar de avisar a ${d.dispositivo} de ${d.usuario}`}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {mensaje && (
        <p
          role="status"
          className={cn("text-xs", mensaje.tono === "ok" ? "text-[var(--data-success-ink)]" : "text-[var(--data-error-ink)]")}
        >
          {mensaje.texto}
        </p>
      )}
    </div>
  );
}
