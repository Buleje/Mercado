"use client";

/**
 * La pantalla de éxito tras confirmar (ADR-413 §UI paso 6): el código, el
 * comprobante y el texto para WhatsApp — `textoLiquidacion` es la MISMA
 * función pura del servidor, no un texto armado a mano acá.
 */

import { useState } from "react";
import { AlertTriangle, Check, Copy, FileDown } from "@buleje/design-system/icons";
import { useSettingsSafe } from "@/contexts/settings-context";
import { textoLiquidacion } from "@/lib/cuentas/liquidacion";
import type { LiquidacionDTO } from "@/lib/db/liquidacion-cuenta.db";
import type { CuentaPersona } from "@/lib/adelantos/cuenta-unificada";
import { textoResultadoCaja } from "./caja-texto";

export default function ResultadoLiquidacion({
  liquidacion,
  persona,
  onCerrar,
}: {
  liquidacion: LiquidacionDTO;
  persona: CuentaPersona;
  onCerrar: () => void;
}) {
  const settings = useSettingsSafe();
  const [copiado, setCopiado] = useState(false);
  const resultadoCaja = textoResultadoCaja(liquidacion);

  const copiarWhatsApp = async () => {
    try {
      await navigator.clipboard.writeText(textoLiquidacion(liquidacion));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso de portapapeles no se puede copiar — no rompe el flujo.
    }
  };

  const descargarPdf = async () => {
    const { descargarComprobanteLiquidacion } = await import("@/lib/adelantos/pdf-liquidacion");
    await descargarComprobanteLiquidacion({ negocio: settings?.businessName ?? null, liquidacion });
  };

  return (
    <div className="space-y-4 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--data-success-700)]/10">
        <Check
          className="h-8 w-8 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
          aria-hidden
        />
      </div>
      <p className="text-2xl font-extrabold tabular-nums text-[var(--text-primary)]">
        {liquidacion.codigo}
      </p>
      <p className="text-base text-[var(--text-secondary)]">
        Se liquidó la cuenta de {persona.nombre}.
      </p>
      {resultadoCaja &&
        (resultadoCaja.tono === "aviso" ? (
          <p
            role="status"
            className="flex items-center justify-center gap-1.5 text-sm font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> {resultadoCaja.texto}
          </p>
        ) : (
          <p className="text-sm font-semibold text-[var(--text-secondary)]">
            {resultadoCaja.texto}
          </p>
        ))}
      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={descargarPdf}
          className="inline-flex h-11 items-center gap-1.5 rounded-2xl border border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-primary"
        >
          <FileDown className="h-4 w-4" aria-hidden /> Descargar comprobante
        </button>
        <button
          type="button"
          onClick={copiarWhatsApp}
          className="inline-flex h-11 items-center gap-1.5 rounded-2xl border border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-primary"
        >
          <Copy className="h-4 w-4" aria-hidden /> {copiado ? "¡Copiado!" : "Copiar para WhatsApp"}
        </button>
      </div>
      <button
        type="button"
        onClick={onCerrar}
        className="inline-flex h-11 items-center rounded-2xl bg-primary px-6 text-sm font-bold text-white transition-colors hover:bg-primary-dark"
      >
        Cerrar
      </button>
    </div>
  );
}
