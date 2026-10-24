"use client";

/**
 * SeccionCelular — prender el aviso de la agenda en ESTE celular (o compu) por
 * Web Push: llega a la hora de cada actividad aunque el navegador esté cerrado.
 * Guarda al tocar (toast), sin el «Guardar» del modal.
 *
 * Se monta en `ConfigAvisoModal`. Lógica del navegador: `use-push-agenda.ts`.
 */
import { useId } from "react";
import { BellOff, Send, Smartphone } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { usePushAgenda } from "./use-push-agenda";

const AVISO_LINEA: Record<"sin_soporte" | "sin_claves" | "error", string> = {
  sin_soporte: "Este navegador no recibe avisos con la pantalla cerrada. En Android ábrelo en Chrome; en iPhone, agrega el panel a la pantalla de inicio.",
  sin_claves: "El servidor no tiene las claves de avisos al celular: pídeselas al soporte.",
  error: "No se pudo leer el aviso del celular. Cierra y vuelve a abrir.",
};

export function SeccionCelular() {
  const id = useId();
  const p = usePushAgenda();
  const otros = p.otros > 0 ? ` También llega a ${p.otros === 1 ? "otro celular tuyo" : `otros ${p.otros} celulares tuyos`}.` : "";

  return (
    <div className="space-y-2">
      <span id={`${id}-cel`} className="block text-sm font-semibold text-[var(--text-secondary)]">
        En el celular
      </span>
      {p.estado === "cargando" && <p className="text-sm text-[var(--text-tertiary)]">Mirando este celular…</p>}
      {(p.estado === "sin_soporte" || p.estado === "sin_claves" || p.estado === "error") && (
        <p className="text-sm text-[var(--text-tertiary)]">{AVISO_LINEA[p.estado]}</p>
      )}
      {p.estado === "listo" && (
        <div
          role="group"
          aria-labelledby={`${id}-cel`}
          className="flex min-h-12 flex-wrap items-center gap-3 rounded-lg border border-[var(--rule-base)] px-3 py-2 text-sm text-[var(--text-primary)]"
        >
          <Smartphone aria-hidden className="size-5 shrink-0 text-[var(--text-tertiary)]" />
          <span className="min-w-56 flex-1">
            <span className="block font-semibold">{p.prendido ? "Prendido en este celular" : "Apagado en este celular"}</span>
            <span className="block text-[var(--text-tertiary)]">
              {p.prendido
                ? `Vibra a la hora de cada actividad, aunque el navegador esté cerrado.${otros}`
                : `Te avisa a la hora de cada actividad aunque cierres el navegador.${otros}`}
            </span>
          </span>
          {p.prendido ? (
            <div className="flex flex-wrap gap-2 max-sm:w-full">
              <button type="button" className={button({ variant: "secondary", className: "max-sm:flex-1" })} disabled={p.ocupado} onClick={() => void p.probar()}>
                <Send aria-hidden className="size-4" />
                Mandar uno de prueba
              </button>
              <button type="button" className={button({ variant: "ghost", className: "max-sm:flex-1" })} disabled={p.ocupado} onClick={() => void p.apagar()}>
                <BellOff aria-hidden className="size-4" />
                Apagar en este celular
              </button>
            </div>
          ) : p.puedePrender ? (
            <button type="button" className={button({ variant: "primary", className: "max-sm:w-full" })} disabled={p.ocupado} onClick={() => void p.prender()}>
              <Smartphone aria-hidden className="size-4" />
              Avisarme en este celular
            </button>
          ) : (
            <span className="text-[var(--text-tertiary)]">La vista de tienda no puede prenderlo.</span>
          )}
        </div>
      )}
    </div>
  );
}
