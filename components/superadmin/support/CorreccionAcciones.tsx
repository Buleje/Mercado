"use client";

/**
 * Los botones de un pedido de corrección de guía (ADR-512): «En revisión»,
 * «Rechazar» (pide el porqué), «Resolver» (pide qué se hizo) y, desde En
 * revisión, «Volver a Pendiente». Sólo se ofrecen los pasos que `puedePasar`
 * permite; el servidor vuelve a validar y responde 409 si otro lo movió.
 */

import { useState } from "react";
import { CheckCircle2, Clock, Loader2, RotateCcw, XCircle } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { puedePasar, type EstadoCorreccion } from "@/lib/soporte/correccion-guia";

type PideTexto = "closed" | "rejected";

const PIDE: Record<PideTexto, { titulo: string; placeholder: string; boton: string }> = {
  closed: {
    titulo: "Qué se hizo (lo lee el negocio)",
    placeholder: "p. ej. Anulamos la GTF 0012345 y emitimos la 0012399 con la placa AHX-821.",
    boton: "Marcar resuelta",
  },
  rejected: {
    titulo: "Por qué no se corrige (lo lee el negocio)",
    placeholder: "p. ej. La placa de la guía coincide con la de SUNARP: no hay error que corregir.",
    boton: "Rechazar el pedido",
  },
};

export default function CorreccionAcciones({
  estado,
  enviando,
  onCambiar,
}: {
  /** Estado guardado (`rawStatus`). */
  estado: string;
  enviando: EstadoCorreccion | null;
  onCambiar: (estado: EstadoCorreccion, resolucion?: string) => Promise<boolean>;
}) {
  const [pide, setPide] = useState<PideTexto | null>(null);
  const [texto, setTexto] = useState("");
  const ocupado = enviando !== null;
  const giro = (e: EstadoCorreccion) => enviando === e && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />;

  async function confirmar() {
    if (!pide) return;
    if (await onCambiar(pide, texto)) {
      setPide(null);
      setTexto("");
    }
  }

  if (pide) {
    const p = PIDE[pide];
    return (
      <div className="space-y-2">
        <label className="block">
          <span className="block text-sm font-semibold text-[var(--text-secondary)]">{p.titulo}</span>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={3}
            maxLength={1000}
            autoFocus
            placeholder={p.placeholder}
            className="mt-1 w-full rounded-xl border border-[var(--rule-strong)] bg-[var(--surface-raised)] px-3 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]"
          />
        </label>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => setPide(null)} disabled={ocupado} className={button({ variant: "ghost" })}>
            Volver
          </button>
          <button
            type="button"
            onClick={() => void confirmar()}
            disabled={ocupado || texto.trim().length < 3}
            className={button({ variant: pide === "rejected" ? "danger" : "primary" })}
          >
            {giro(pide)}
            {p.boton}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {puedePasar(estado, "in_review") && (
        <button type="button" onClick={() => void onCambiar("in_review")} disabled={ocupado} className={button({ variant: "secondary" })}>
          {giro("in_review") || <Clock className="h-4 w-4" aria-hidden />}
          {estado === "open" ? "En revisión" : "Reabrir en revisión"}
        </button>
      )}
      {puedePasar(estado, "open") && (
        <button type="button" onClick={() => void onCambiar("open")} disabled={ocupado} className={button({ variant: "ghost" })}>
          {giro("open") || <RotateCcw className="h-4 w-4" aria-hidden />}
          Volver a Pendiente
        </button>
      )}
      {puedePasar(estado, "rejected") && (
        <button type="button" onClick={() => setPide("rejected")} disabled={ocupado} className={cn(button({ variant: "secondary" }), "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]")}>
          <XCircle className="h-4 w-4" aria-hidden />
          Rechazar
        </button>
      )}
      {puedePasar(estado, "closed") && (
        <button type="button" onClick={() => setPide("closed")} disabled={ocupado} className={button({ variant: "primary" })}>
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          Resolver
        </button>
      )}
    </div>
  );
}
