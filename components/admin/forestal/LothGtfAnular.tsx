"use client";

/**
 * El cuerpo del modal «Anular la GTF» de la vista GTF del Libro TH. Salió de
 * `LothGtfView` (08-10, la vista pasaba de 960 líneas) sin cambios.
 */

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Ban, Loader2 } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { motivoLegible } from "@/lib/forestal/motivo";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { verIngresosDelCtp } from "./LothGtfCtp";
import { useLineasDeLaGuia } from "./hooks/use-lineas-de-la-guia";
import type { Gtf } from "./gtf-tabla-columnas";

/**
 * Anular no borra: deja la guía visible con su motivo. Con despachos, la guía
 * y sus líneas juntas (las trozas vuelven a quedar libres para la guía
 * corregida); sin, sólo el papel. `bloqueo` = el «no» del Libro CTP (la guía ya
 * entró allá) para mostrarlo en el modal; `error` = cualquier otro fallo.
 * Salió de `LothGtfView` (08-10) sin cambios.
 */
export async function anularGtf(
  id: string,
  reason: string,
  conDespachos: boolean,
): Promise<{ bloqueo: string | null; error: string | null }> {
  const r = await fetch("/api/admin/forestal/loth/despacho-guia", {
    method: "PATCH", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include",
    body: JSON.stringify({ id, action: "anular", reason, conDespachos }),
  });
  const j = (await r.json().catch(() => ({}))) as { error?: string; message?: string; ctp?: { estado?: string; mensaje?: string } };
  /* Su madera ya entró al Libro CTP: no se anula (liberaría trozas que allá
     siguen en el libro). El modal queda abierto con el «no» y el camino. */
  if (r.status === 409 && j.error === "guia_ya_en_el_ctp") {
    return { bloqueo: j.message ?? "Esta guía ya entró a tu Libro CTP: anula allá sus ingresos primero.", error: null };
  }
  if (!r.ok) return { bloqueo: null, error: j.message ?? `No se pudo anular la guía (${r.status})` };
  if (j.ctp?.mensaje) {
    /* Lo que pasó en el Libro CTP: la guía por recibir se dio de baja. */
    if (j.ctp.estado === "anulada") toast.success("Guía anulada", { description: j.ctp.mensaje });
    else toast.warning("Guía anulada — revisa tu Libro CTP", { description: j.ctp.mensaje, duration: 12_000 });
  }
  return { bloqueo: null, error: null };
}

/**
 * Cuerpo del modal de anulación. El motivo va a `annulledReason` y queda en el
 * libro: es lo que lee un fiscalizador para entender por qué esa guía no vale.
 */
export default function AnularGtfForm({
  gtf,
  despachos: porNumero,
  onConfirm,
  onCancel,
}: {
  gtf: Gtf;
  /** Líneas de despacho vivas con el N° de esta guía. */
  despachos: number;
  /** Devuelve el «no» del Libro CTP para mostrarlo acá, o null si se anuló. */
  onConfirm: (r: string, conDespachos: boolean) => Promise<string | null>;
  onCancel: () => void;
}) {
  /* Sólo las líneas de ESTA guía (el servidor): otro titular puede tener el mismo N°. */
  const despachos = useLineasDeLaGuia(gtf.id, porNumero);
  const [r, setR] = useState("");
  const [conDespachos, setConDespachos] = useState(true);
  const [busy, setBusy] = useState(false);
  const [bloqueo, setBloqueo] = useState<string | null>(null);
  /* La misma regla del servidor (`motivo.ts`): tres letras, sin invisibles. */
  const valido = motivoLegible(r);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!valido || busy) return;
        setBusy(true);
        void onConfirm(r.trim(), despachos > 0 && conDespachos).then((no) => {
          setBusy(false);
          setBloqueo(no);
        });
      }}
      className="space-y-4 p-5"
    >
      {bloqueo && (
        <div
          role="alert"
          data-testid="anular-guia-bloqueo-ctp"
          className="flex flex-wrap items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm font-semibold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]"
        >
          <Ban className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 basis-60">{bloqueo}</span>
          <button
            type="button"
            onClick={verIngresosDelCtp}
            className="inline-flex h-11 shrink-0 items-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] sm:h-9"
          >
            Ir a Ingresos del CTP
          </button>
        </div>
      )}
      <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] p-3 text-sm text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          Se anulan <strong>{gtf.volumenTotalM3 ? fmtM3(Number(gtf.volumenTotalM3)) : "—"} m³</strong>
          {gtf.destino ? <> con destino <strong>{gtf.destino}</strong></> : null}. La guía sigue apareciendo en el libro, marcada como anulada.
        </p>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Motivo de la anulación *</span>
        <textarea
          value={r}
          onChange={(e) => setR(e.target.value)}
          rows={3}
          placeholder="Ej.: error en la placa del vehículo; se reemplaza por la GTF 001-0000126."
          className="w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)]"
        />
        <span className="mt-1 block text-xs text-[var(--text-tertiary)]">Al menos 3 letras. Queda registrado en el libro.</span>
      </label>
      {despachos > 0 && (
        <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3 text-sm text-[var(--text-primary)]">
          <input type="checkbox" checked={conDespachos} onChange={(e) => setConDespachos(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--data-error-600)]" />
          <span>
            Anular también {despachos === 1 ? "la línea" : `las ${despachos} líneas`} de despacho de esta guía.
            <span className="block text-xs text-[var(--text-secondary)]">Las trozas vuelven a quedar libres para ir en la guía corregida. Si la guía ya entró a tu Libro CTP, primero se anulan allá sus ingresos.</span>
          </span>
        </label>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="h-11 rounded-xl px-4 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
        <button type="submit" disabled={!valido || busy} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--data-error-600)] px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />} Anular la guía
        </button>
      </div>
    </form>
  );
}
