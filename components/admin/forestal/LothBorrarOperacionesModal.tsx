"use client";

/**
 * LothBorrarOperacionesModal — «Borrar operaciones del plan» (Brandon
 * 07-10-2026: «eliminar todas las operaciones de ese plan, sea tala, trozado,
 * despacho»).
 *
 * Dice ANTES cuánto hay por sección (líneas y m³) y cuánto cae en un mes
 * cerrado; «Todas» viene marcada. El botón rojo se habilita al escribir BORRAR.
 * Lo que el servidor salta (mes cerrado, ya en el Libro CTP, una tala con su
 * trozado vivo…) vuelve con su motivo y se dice en el aviso final.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Trash2 } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import { formatNumber } from "@/lib/format";
import type { LothSection } from "@/lib/forestal/loth-constants";
import { permisoConSigla } from "@/lib/forestal/loth-tipos-plan";
import type { ConteoBorrarDelPlan, ResultadoBorrarDelPlan } from "@/lib/forestal/loth-borrar-del-plan";
import { BotonesBorrar, ConfirmarBorrar, avisarBorrado, confirmaBorrar, nombreSeccion, pluralN as plural } from "./loth-borrar-piezas";

export interface PlanABorrar {
  id: string;
  planType: string | null;
  planNumber: string | null;
  titularName: string;
}

export default function LothBorrarOperacionesModal({
  plan,
  onClose,
  onBorrado,
}: {
  plan: PlanABorrar;
  onClose: () => void;
  /** Se borró algo: la vista relee el plan y el libro. */
  onBorrado: () => void;
}) {
  const [conteo, setConteo] = useState<ConteoBorrarDelPlan | null>(null);
  const [elegidas, setElegidas] = useState<Set<LothSection>>(new Set());
  const [palabra, setPalabra] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const r = await fetch(`/api/admin/forestal/loth/borrar-del-plan?planId=${encodeURIComponent(plan.id)}`, {
          credentials: "include",
          cache: "no-store",
          signal: ac.signal,
        });
        const j = await leerJson<ConteoBorrarDelPlan & { message?: string; error?: string }>(r);
        if (ac.signal.aborted) return;
        if (!r.ok || !j) throw new Error(j?.message ?? j?.error ?? `HTTP ${r.status}`);
        setConteo(j);
        setElegidas(new Set(j.secciones.map((s) => s.section)));
      } catch (err) {
        if (!ac.signal.aborted) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => ac.abort();
  }, [plan.id]);

  const secciones = useMemo(() => conteo?.secciones ?? [], [conteo]);
  const todas = secciones.length > 0 && secciones.every((s) => elegidas.has(s.section));
  /* Las de mes cerrado no se borran: el botón no las promete. */
  const aBorrar = secciones.filter((s) => elegidas.has(s.section)).reduce((a, s) => a + s.lineas - s.cerradas, 0);
  const confirmado = confirmaBorrar(palabra);

  const alternar = (s: LothSection) =>
    setElegidas((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  const borrar = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/forestal/loth/borrar-del-plan", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", ...csrfHeaders() },
        body: JSON.stringify({ planId: plan.id, secciones: [...elegidas] }),
      });
      const j = await leerJson<ResultadoBorrarDelPlan & { message?: string; error?: string }>(r);
      if (!r.ok || !j) throw new Error(j?.message ?? j?.error ?? `HTTP ${r.status}`);
      avisarBorrado(j);
      onBorrado();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [plan.id, elegidas, onBorrado]);

  const nombre = permisoConSigla(plan.planType, plan.planNumber);

  return (
    <AdminModal
      open
      onClose={busy ? () => undefined : onClose}
      title="Borrar operaciones del plan"
      description={`${nombre} — ${plan.titularName}`}
      icon={Trash2}
      className="max-w-xl"
      footer={
        <BotonesBorrar busy={busy} habilitado={confirmado} n={aBorrar} onCancelar={onClose} onBorrar={() => void borrar()} />
      }
    >
      <div className={`space-y-4 ${MODAL_BODY}`}>
        {error && (
          <p role="alert" className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm font-bold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
            {error}
          </p>
        )}

        {!conteo && !error && (
          <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Contando las operaciones del plan…
          </p>
        )}

        {conteo && conteo.total === 0 && (
          <p className="rounded-xl bg-[var(--surface-sunken)] p-3 text-sm text-[var(--text-secondary)]">
            Este plan no tiene operaciones en el libro: no hay nada que borrar.
          </p>
        )}

        {conteo && conteo.total > 0 && (
          <>
            <div className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
              <p className="min-w-0 flex-1">
                Marca qué secciones quieres borrar. Las líneas se borran del libro de este plan; las de otros planes no se tocan.
              </p>
              <InfoTip
                title="Qué se queda sin borrar"
                what="Por seguridad, algunas líneas no se borran aunque las marques. Al terminar te decimos cuáles y por qué."
                body={
                  <>
                    <span className="block">· Las de un mes cerrado: su acta no cambia hasta que lo reabras.</span>
                    <span className="block">· Las trozas que ya entraron a tu Libro CTP: anula ese ingreso primero.</span>
                    <span className="block">· Una tala cuyo árbol sigue con trozado vivo, o un trozado cuya troza sigue despachada o consumida: marca también esas secciones.</span>
                  </>
                }
                example="Si marcas solo Tala y el árbol 12 tiene trozado, la tala del 12 se queda."
                side="left"
              />
            </div>

            <fieldset className="divide-y divide-[var(--rule-base)] rounded-xl border border-[var(--rule-base)]">
              <legend className="sr-only">Secciones a borrar</legend>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm font-bold text-[var(--text-primary)]">
                <input
                  type="checkbox"
                  checked={todas}
                  onChange={() => setElegidas(todas ? new Set() : new Set(secciones.map((s) => s.section)))}
                  className="h-5 w-5 shrink-0 accent-[var(--data-error-600)]"
                />
                <span className="flex-1">Todas</span>
                <span className="font-mono tabular-nums">{plural(conteo.total, "línea", "líneas")} · {formatNumber(conteo.m3, 2)} m³</span>
              </label>
              {secciones.map((s) => (
                <label key={s.section} className="flex min-h-11 cursor-pointer items-start gap-3 px-3 py-2 text-sm text-[var(--text-primary)]">
                  <input
                    type="checkbox"
                    checked={elegidas.has(s.section)}
                    onChange={() => alternar(s.section)}
                    className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--data-error-600)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{nombreSeccion(s.section)}</span>
                    {(s.cerradas > 0 || s.anuladas > 0) && (
                      <span className="block text-xs text-[var(--text-secondary)]">
                        {[
                          s.anuladas > 0 ? plural(s.anuladas, "anulada", "anuladas") : null,
                          s.cerradas > 0 ? `${formatNumber(s.cerradas)} en mes cerrado: se quedan` : null,
                        ].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-right font-mono tabular-nums">
                    {plural(s.lineas, "línea", "líneas")} · {formatNumber(s.m3, 2)} m³
                  </span>
                </label>
              ))}
            </fieldset>

            <ConfirmarBorrar id="borrar-ops-confirmar" valor={palabra} onChange={setPalabra} />
          </>
        )}
      </div>
    </AdminModal>
  );
}
