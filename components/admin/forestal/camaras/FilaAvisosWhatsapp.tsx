"use client";

/**
 * A quién avisa la cámara por WhatsApp y cuándo. Salió de `CamaraFila` tal
 * cual (2026-10-03) para que la fila tenga lugar para el puente de pantalla.
 * Lo tipeado vive acá hasta «Guardar»: una recarga de la lista no lo pisa.
 */

import { useState } from "react";
import { Check, MessageCircle } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import type { AvisosCamara } from "@/lib/camaras/camaras";
import type { CamaraConConexion } from "./conexion-camara";
import { BTN } from "./camaras-ui";

interface Props {
  camara: CamaraConConexion;
  guardando: boolean;
  onGuardarAvisos: (whatsapp: string, cuando: AvisosCamara["cuando"]) => Promise<unknown>;
}

export default function FilaAvisosWhatsapp({ camara: c, guardando, onGuardarAvisos }: Props) {
  const [edit, setEdit] = useState<{ whatsapp: string; cuando: AvisosCamara["cuando"] } | null>(
    null,
  );
  const avisos = edit ?? {
    whatsapp: c.avisos?.whatsapp ?? "",
    cuando: c.avisos?.cuando ?? "noche",
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[var(--rule-soft)] pt-2">
      {/* En el celular la etiqueta y el número se quedan con la fila entera:
          con `min-w-*` (anulado por el `min-width: 0` global) el campo
          quedaba de 10 px a 400. El ⓘ va pegado al rótulo: al final de la
          fila quedaba solo en un tercer renglón. */}
      <div className="flex w-full items-center gap-2 text-sm text-[var(--text-secondary)] sm:w-auto sm:flex-1">
        <MessageCircle className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
        <span className="whitespace-nowrap font-bold">Avisar al WhatsApp</span>
        <InfoTip
          title="Avisos por WhatsApp"
          what={
            c.avisos?.whatsapp
              ? `Avisa a ${c.avisos.whatsapp} ${c.avisos.cuando === "noche" ? "de noche" : c.avisos.cuando === "siempre" ? "siempre" : "— apagado"} cuando la foto muestra una persona o un vehículo.`
              : "Sin número: la foto queda en el historial y nadie se entera hasta que lo abre."
          }
          affects="Como mucho un aviso cada 10 minutos. «De noche» es de 19:00 a 06:00, cuando el patio está solo."
        />
        <input
          value={avisos.whatsapp}
          onChange={(e) => setEdit({ ...avisos, whatsapp: e.target.value })}
          inputMode="tel"
          placeholder="9 dígitos"
          aria-label={`WhatsApp al que avisa ${c.nombre}`}
          className="h-9 w-full min-w-0 flex-1 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
        />
      </div>
      <select
        value={avisos.cuando}
        onChange={(e) => setEdit({ ...avisos, cuando: e.target.value as AvisosCamara["cuando"] })}
        aria-label={`Cuándo avisa ${c.nombre}`}
        className="h-9 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
      >
        <option value="noche">sólo de noche (19–06)</option>
        <option value="siempre">siempre</option>
        <option value="nunca">nunca</option>
      </select>
      <button
        type="button"
        onClick={async () => {
          if (edit && (await onGuardarAvisos(edit.whatsapp, edit.cuando))) setEdit(null);
        }}
        disabled={guardando || !edit}
        className={cn(BTN, "border-[var(--accent)] text-[var(--accent-ink)] disabled:opacity-40")}
      >
        <Check className="h-4 w-4" aria-hidden /> Guardar
      </button>
    </div>
  );
}
