"use client";

/**
 * Las piezas que repiten WhatsApp, Telegram y n8n: el código de vinculación
 * con su cuenta regresiva, la fila de un teléfono/chat vinculado y el aviso de
 * una línea con su ⓘ. Una sola forma de cada cosa en los tres canales.
 */

import type { ReactNode } from "react";
import { AlertTriangle, Check, Copy, Loader2, Trash2 } from "@buleje/design-system/icons";
import { WarningAlert } from "@buleje/design-system";
import { button } from "@/components/ui-system/button-variants";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import { minutosSegundos } from "./shared";

/** Botón cuadrado de 48 px (copiar, quitar, probar…). */
export const icono48 = button({ variant: "secondary", className: "w-12 shrink-0 rounded-xl px-0" });
/** Botón con texto de 48 px, del mismo radio que el resto de la vista. */
export const accion48 = button({ variant: "secondary", className: "rounded-xl px-4" });
/** La acción principal de un canal (vincular, agregar). */
export const principal48 = button({ variant: "primary", className: "rounded-xl px-5" });

/**
 * El código para vincular, listo para copiar, con lo que le queda de vida: sin
 * la cuenta, «el código venció» se descubre recién cuando el bot lo rechaza,
 * con el celular ya en la mano.
 */
export function BandaCodigo({
  rotulo,
  texto,
  quedan,
  copiado,
  onCopiar,
  extra,
}: {
  rotulo: string;
  texto: string;
  quedan: number;
  copiado: boolean;
  onCopiar: () => void;
  extra?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-[var(--data-success-500)]/10 px-4 py-3">
      <span className="text-sm font-semibold text-[var(--text-secondary)]">{rotulo}</span>
      <code className="rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 font-mono text-base font-bold tracking-widest text-[var(--text-primary)]">
        {texto}
      </code>
      <button type="button" onClick={onCopiar} aria-label="Copiar" title="Copiar" className={icono48}>
        {copiado ? <Check className="h-4 w-4 text-[var(--data-success-ink)]" /> : <Copy className="h-4 w-4" />}
      </button>
      <span className="text-sm text-[var(--text-secondary)]">
        Vence en <strong className="tabular-nums text-[var(--text-primary)]">{minutosSegundos(quedan)}</strong>
        {extra}
      </span>
    </div>
  );
}

/** Un teléfono o chat vinculado: quién, desde cuándo, último uso, y quitarlo. */
export function FilaVinculada({
  titulo,
  detalle,
  etiquetaQuitar,
  onQuitar,
}: {
  titulo: string;
  detalle: string;
  etiquetaQuitar: string;
  onQuitar: () => void;
}) {
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-[var(--text-primary)]">{titulo}</p>
        <p className="text-sm text-[var(--text-secondary)]">{detalle}</p>
      </div>
      <button
        type="button"
        onClick={onQuitar}
        aria-label={etiquetaQuitar}
        title={etiquetaQuitar}
        className={cn(icono48, "text-[var(--text-tertiary)] hover:text-[var(--data-error-ink)]")}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}

/** Un aviso que pide acción, en una línea; el detalle va en su ⓘ. */
export function LineaAviso({
  children,
  ayuda,
  titulo,
  tono = "warning",
}: {
  children: ReactNode;
  ayuda?: ReactNode;
  titulo?: string;
  tono?: "warning" | "error";
}) {
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-sm text-[var(--text-primary)]">
      <AlertTriangle
        aria-hidden="true"
        className={cn(
          "h-4 w-4 shrink-0",
          tono === "error" ? "text-[var(--data-error-ink)]" : "text-[var(--data-warning-ink)]",
        )}
      />
      <span>{children}</span>
      {ayuda && <InfoTip title={titulo ?? "Qué hacer"} what={ayuda} side="bottom" />}
    </p>
  );
}

/** Mientras el canal carga, o si no se pudo leer: nada de «0 teléfonos» de mentira. */
export function SinDato({ cargando, error }: { cargando: boolean; error: string | null }) {
  if (cargando) {
    return (
      <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        Leyendo el estado…
      </p>
    );
  }
  return <WarningAlert>{error ?? "No se pudo leer el estado"}</WarningAlert>;
}
