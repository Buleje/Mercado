"use client";

/**
 * «Tope sugerido S/ X» en la ficha: lo más alto que la persona devolvió
 * completo, con un botón para dejarlo como su tope. Sólo si su historia lo
 * sostiene y es distinto del tope que ya tiene.
 */

import { useState } from "react";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import { logger } from "@/lib/logger";
import { cuerpoPatch } from "@/lib/adelantos/datos-persona";
import { conviene, soles, topeSugerido } from "@/lib/adelantos/tope";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
import type { BeneficiarioConSaldo } from "../crear-adelanto/tipos";

export default function TopeSugeridoFicha({
  persona,
  suyos,
  onCambio,
}: {
  persona: BeneficiarioConSaldo;
  suyos: readonly DbAdelanto[];
  /** Se guardó el tope nuevo: que la lista se ponga al día. */
  onCambio: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const sug = topeSugerido(suyos);
  if (!conviene(sug, persona.limiteCredito)) return null;

  const usar = async () => {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/adelantos/beneficiarios/${persona.id}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify(cuerpoPatch(persona, { limiteCredito: sug.monto })),
      });
      if (res.ok) {
        onCambio();
        return;
      }
      setErr((await leerJson<{ error?: string }>(res))?.error ?? "No se pudo guardar el tope.");
    } catch (e) {
      logger.error("[adelantos] no se pudo guardar el tope sugerido", { error: String(e) });
      setErr("No se pudo guardar. Revisa la conexión.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-[var(--surface-sunken)] px-4 py-2">
      <p className="text-base text-[var(--text-primary)]">
        Tope sugerido <strong className="tabular-nums">{soles(sug.monto)}</strong>
      </p>
      <InfoTip
        title="Tope sugerido"
        what={`Lo más alto que devolvió completo: ${soles(sug.monto)} (de ${sug.basadoEn} adelanto${sug.basadoEn === 1 ? "" : "s"} liquidado${sug.basadoEn === 1 ? "" : "s"}).`}
        affects="Al darle «Usar» queda como su tope: te avisa cuando un adelanto nuevo se lo pase. No bloquea; decides tú."
        example="Devolvió completos S/ 500 y S/ 900: el tope sugerido es S/ 900."
      />
      <button type="button" onClick={usar} disabled={saving} className={button({ variant: "secondary", className: "ml-auto h-12 rounded-xl px-4" })}>
        {saving ? "Guardando…" : "Usar"}
      </button>
      {err && <p role="alert" className="w-full text-sm font-semibold text-[var(--data-error-ink)]">{err}</p>}
    </div>
  );
}
