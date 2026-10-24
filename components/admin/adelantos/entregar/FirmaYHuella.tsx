"use client";

/**
 * Paso 3 de «Entregar adelanto»: la firma de quien recibe (y su huella, si
 * quiere o si no sabe firmar). Nombre y DNI vienen de la ficha; el DNI sólo se
 * escribe si la ficha no lo tiene. La firma va en tinta del tema en pantalla y
 * en negro sobre blanco al guardarla (`LienzoFirma` + `firmaEnCanvas`).
 */

import LienzoFirma from "@/components/ui-system/LienzoFirma";
import { enmascararDocumento } from "@/lib/adelantos/entregar-tipos";
import CapturaHuella from "../firma/CapturaHuella";
import { CabezaPaso } from "./PasoPersona";
import type { EntregaAdelanto } from "./use-entregar-adelanto";

const INPUT =
  "h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-base text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)] disabled:opacity-60";

export default function FirmaYHuella({ e }: { e: EntregaAdelanto }) {
  const ocupado = e.fase === "guardando";
  const quien = e.nombre.trim() || "quien recibe";

  return (
    <section className="space-y-3" aria-label="Firma de quien recibe">
      <CabezaPaso
        n={3}
        extra={!e.firmaObligatoria ? <span className="text-sm text-[var(--text-tertiary)]">opcional</span> : undefined}
      >
        Firma de {quien}
      </CabezaPaso>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
        <label className="block space-y-1">
          <span className="text-sm font-bold text-[var(--text-secondary)]">Nombre de quien firma</span>
          <input value={e.nombre} onChange={(ev) => e.setNombre(ev.target.value)} disabled={ocupado} autoComplete="off" className={INPUT} data-firma-nombre />
        </label>
        {e.documentoDeFicha ? (
          <div className="space-y-1">
            <span className="block text-sm font-bold text-[var(--text-secondary)]">DNI</span>
            <p className="flex h-12 items-center rounded-xl bg-[var(--surface-sunken)] px-3 font-mono text-base tabular-nums text-[var(--text-primary)]" data-firma-dni-ficha>
              {enmascararDocumento(e.persona?.documentoFinal)}
            </p>
          </div>
        ) : (
          <label className="block space-y-1">
            <span className="text-sm font-bold text-[var(--text-secondary)]">DNI</span>
            <input
              value={e.documento}
              onChange={(ev) => e.setDocumento(ev.target.value)}
              disabled={ocupado}
              inputMode="text"
              autoComplete="off"
              maxLength={16}
              placeholder="8 números"
              className={`${INPUT} font-mono tabular-nums`}
              data-firma-dni
            />
          </label>
        )}
      </div>

      <LienzoFirma trazos={e.trazos} onCambio={e.setTrazos} etiqueta={`Firma de ${quien}`} deshabilitado={ocupado} />

      <CapturaHuella valor={e.huella} onCambio={e.setHuella} consentido={e.consentido} onConsentir={e.setConsentido} deshabilitado={ocupado} />
    </section>
  );
}
