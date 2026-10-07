"use client";

/**
 * LothBorrarLineasModal — borrar lo elegido en «Secciones»: las líneas
 * marcadas o todas las que deja el filtro (Brandon 07-10-2026: «escoger y
 * eliminar los procesos… según lo escogido por permiso o titular»).
 *
 * Antes de escribir pide al servidor la VISTA PREVIA (el mismo plan de borrado,
 * sin escribir): cuánto se borra por sección y por permiso · titular, y qué se
 * queda con su motivo. «Incluir lo que cuelga» suma el trozado de esas talas y
 * los despachos de esas trozas. El botón rojo se habilita al escribir BORRAR.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, Trash2 } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import { formatNumber } from "@/lib/format";
import { MOTIVO_SALTO_TEXTO_LINEAS, textoDelSalto, type ResultadoBorrarLineas } from "@/lib/forestal/loth-borrar-del-plan";
import { BotonesBorrar, ConfirmarBorrar, avisarBorrado, confirmaBorrar, nombreSeccion, pluralN } from "./loth-borrar-piezas";
import { permisoDeLinea, type PermisoDeLinea } from "./loth-seccion-filtros";

const URL_BORRAR = "/api/admin/forestal/loth/borrar-lineas";

async function pedir(ids: readonly string[], incluirLoQueCuelga: boolean, vista: boolean, signal?: AbortSignal) {
  const r = await fetch(`${URL_BORRAR}${vista ? "?vista=1" : ""}`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", ...csrfHeaders() },
    body: JSON.stringify({ ids, incluirLoQueCuelga }),
    signal,
  });
  const j = await leerJson<ResultadoBorrarLineas & { message?: string; error?: string }>(r);
  if (!r.ok || !j) throw new Error(j?.message ?? j?.error ?? `HTTP ${r.status}`);
  return j;
}

export default function LothBorrarLineasModal({
  ids,
  titulo,
  planes,
  onClose,
  onBorrado,
}: {
  /** Las líneas elegidas (marcadas o filtradas). */
  ids: readonly string[];
  /** «Borrar 3 líneas seleccionadas» / «Borrar las 120 filtradas». */
  titulo: string;
  planes: ReadonlyMap<string, PermisoDeLinea>;
  onClose: () => void;
  /** Se borró algo: el libro se relee. */
  onBorrado: () => void;
}) {
  const [incluir, setIncluir] = useState(false);
  const [vista, setVista] = useState<ResultadoBorrarLineas | null>(null);
  const [palabra, setPalabra] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* La vista previa sigue a «Incluir lo que cuelga»: sólo vale la última pedida. */
  useEffect(() => {
    const ac = new AbortController();
    setVista(null);
    setError(null);
    pedir(ids, incluir, true, ac.signal)
      .then((j) => { if (!ac.signal.aborted) setVista(j); })
      .catch((err) => { if (!ac.signal.aborted) setError(err instanceof Error ? err.message : String(err)); });
    return () => ac.abort();
  }, [ids, incluir]);

  const borrar = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      avisarBorrado(await pedir(ids, incluir, false), MOTIVO_SALTO_TEXTO_LINEAS);
      onBorrado();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [ids, incluir, onBorrado]);

  /* Lo que cuelga sólo importa si algo se queda por eso (o si ya se pidió). */
  const cuelga = incluir || (vista?.saltadas.some((s) => s.motivo === "tiene_trozado" || s.motivo === "tiene_salida") ?? false);

  return (
    <AdminModal
      open
      onClose={busy ? () => undefined : onClose}
      title={titulo}
      description="Se quitan del libro de operaciones; el registro de auditoría guarda qué se borró y quién."
      icon={Trash2}
      className="max-w-xl"
      footer={
        <BotonesBorrar busy={busy} habilitado={confirmaBorrar(palabra) && vista != null} n={vista?.borradas ?? 0} onCancelar={onClose} onBorrar={() => void borrar()} />
      }
    >
      <div className={`space-y-4 ${MODAL_BODY}`}>
        {error && (
          <p role="alert" className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm font-bold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
            {error}
          </p>
        )}

        {!vista && !error && (
          <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Revisando qué se puede borrar…
          </p>
        )}

        {vista && (
          <>
            <Resumen titulo="Se borran" filas={vista.porSeccion.map((s) => ({ k: s.section, nombre: nombreSeccion(s.section), n: s.borradas, m3: s.m3 }))} />
            {vista.porPlan.length > 0 && (
              <Resumen
                titulo="Por permiso · titular"
                filas={vista.porPlan.map((p) => {
                  const d = permisoDeLinea(p.planId, planes);
                  return { k: p.planId ?? "sin-plan", nombre: d.titular !== d.permiso ? `${d.permiso} · ${d.titular}` : d.permiso, n: p.borradas, m3: p.m3 };
                })}
              />
            )}
            {vista.borradas === 0 && (
              <p className="rounded-xl bg-[var(--surface-sunken)] p-3 text-sm text-[var(--text-secondary)]">No se puede borrar ninguna de estas líneas.</p>
            )}
            {vista.agregadas > 0 && (
              <p className="text-sm text-[var(--text-secondary)]">
                Se suman <b className="text-[var(--text-primary)]">{pluralN(vista.agregadas, "línea", "líneas")}</b> que cuelgan de lo elegido.
              </p>
            )}
            {vista.saltadas.length > 0 && (
              <div className="rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10 p-3 text-sm text-[var(--text-primary)]">
                <p className="font-semibold">Se quedan sin borrar:</p>
                <ul className="mt-1 space-y-1">
                  {vista.saltadas.map((s) => (
                    <li key={`${s.section}-${s.motivo}`}>{textoDelSalto(s, nombreSeccion, MOTIVO_SALTO_TEXTO_LINEAS)}</li>
                  ))}
                </ul>
              </div>
            )}
            {cuelga && (
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold text-[var(--text-primary)]">
                <input type="checkbox" checked={incluir} onChange={(e) => setIncluir(e.target.checked)} className="h-5 w-5 shrink-0 accent-[var(--data-error-600)]" />
                <span className="flex-1">Incluir lo que cuelga</span>
                <InfoTip
                  title="Incluir lo que cuelga"
                  what="Suma a lo elegido el trozado de esas talas y los despachos o consumos de esas trozas, del mismo permiso."
                  affects="Sin esto, una tala con su trozado vivo se queda: el trozado quedaría sin árbol."
                  example="Eliges 10 talas del permiso PO 001: se borran también sus 40 trozas y los despachos de esas trozas."
                  side="left"
                />
              </label>
            )}
            {vista.borradas > 0 && <ConfirmarBorrar id="borrar-lineas-confirmar" valor={palabra} onChange={setPalabra} />}
          </>
        )}
      </div>
    </AdminModal>
  );
}

function Resumen({ titulo, filas }: { titulo: string; filas: { k: string; nombre: string; n: number; m3: number }[] }) {
  if (filas.length === 0) return null;
  return (
    <div className="rounded-xl border border-[var(--rule-base)]">
      <p className="border-b border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2 text-xs font-bold text-[var(--text-secondary)]">{titulo}</p>
      <ul className="divide-y divide-[var(--rule-base)]">
        {filas.map((f) => (
          <li key={f.k} className="flex items-start gap-3 px-3 py-2 text-sm text-[var(--text-primary)]">
            <span className="min-w-0 flex-1 break-words font-semibold">{f.nombre}</span>
            <span className="shrink-0 text-right font-mono tabular-nums">
              {pluralN(f.n, "línea", "líneas")} · {formatNumber(f.m3, 2)} m³
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
