"use client";

/**
 * Cargar lo autorizado de TODAS las especies del plan en una tabla.
 *
 * Las especies del censo ya vienen escritas (con lo censado como referencia al
 * lado): se tipean los m³ y el N° de árboles que dice la resolución y se guarda
 * todo en UNA llamada. Lo ya autorizado aparece con sus números, para
 * corregirlo en el mismo lugar. Una fila vacía no se toca; vaciar una especie
 * ya cargada tampoco la borra (eso es el tacho del editor de a una).
 *
 * Desde «Cupo por especie» llega con la especie elegida: esa fila se resalta y
 * su casilla de m³ recibe el foco.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardList, Loader2, Save } from "@buleje/design-system/icons";
import { toast } from "sonner";
import AdminModal from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { csrfHeaders } from "@/lib/csrf-client";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import {
  filaDeEspecie,
  filasParaAutorizar,
  leerFilas,
  type ArbolCensoAutorizar,
  type FilaAutorizar,
} from "@/lib/forestal/loth-autorizar-lote";
import type { Species } from "./loth-plan-shared";

const CASILLA =
  "h-10 w-24 rounded-lg border bg-[var(--surface-raised)] px-2 text-right text-sm tabular-nums text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/30 sm:w-28";

export default function LothPlanAutorizarLote({ open, onClose, planId, censo, species, especiePedida, onGuardado }: {
  open: boolean;
  onClose: () => void;
  planId: string;
  censo: readonly ArbolCensoAutorizar[];
  species: readonly Species[];
  /** La especie con la que se llegó (desde «Cupo por especie»). */
  especiePedida?: string | null;
  onGuardado: () => void;
}) {
  const base = useMemo(() => filasParaAutorizar(censo, species, especiePedida), [censo, species, especiePedida]);
  const [filas, setFilas] = useState<FilaAutorizar[]>(base);
  const [busy, setBusy] = useState(false);
  const [intentado, setIntentado] = useState(false);
  const foco = useRef<HTMLInputElement | null>(null);
  const clavePedida = filaDeEspecie(base, especiePedida)?.clave ?? null;

  /* Cada vez que se abre, arranca de lo guardado (no de lo que quedó tipeado
     la vez anterior sin guardar). */
  useEffect(() => {
    if (!open) return;
    setFilas(base);
    setIntentado(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sólo al abrir
  }, [open]);

  useEffect(() => {
    if (!open || !clavePedida) return;
    const t = window.setTimeout(() => {
      foco.current?.scrollIntoView?.({ block: "center" });
      foco.current?.focus();
    }, 50);
    return () => window.clearTimeout(t);
  }, [open, clavePedida]);

  const { items, errores } = useMemo(() => leerFilas(filas), [filas]);
  const errorDe = useMemo(() => new Map(errores.map((e) => [e.clave, e.motivo])), [errores]);
  const set = (clave: string, campo: "volumen" | "arboles", v: string) =>
    setFilas((fs) => fs.map((f) => (f.clave === clave ? { ...f, [campo]: v } : f)));

  async function guardar() {
    setIntentado(true);
    if (busy || errores.length > 0 || items.length === 0) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/forestal/plan/species", {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ planId, especies: items }),
      });
      const j = (await r.json().catch(() => ({}))) as { message?: string; error?: string; creadas?: number; actualizadas?: number };
      if (!r.ok) {
        toast.error(j.message ?? j.error ?? `No se pudo guardar lo autorizado (error ${r.status})`);
        return;
      }
      const partes = [
        j.creadas ? `${j.creadas} ${j.creadas === 1 ? "especie nueva" : "especies nuevas"}` : null,
        j.actualizadas ? `${j.actualizadas} ${j.actualizadas === 1 ? "corregida" : "corregidas"}` : null,
      ].filter(Boolean);
      toast.success(`Autorizado guardado: ${partes.join(", ") || "sin cambios"}.`);
      onGuardado();
      onClose();
    } catch (err) {
      console.warn("[LothPlanAutorizarLote] guardar falló", err);
      toast.error("No se pudo guardar lo autorizado — revisa tu conexión.");
    } finally {
      setBusy(false);
    }
  }

  const pie = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <p className="mr-auto text-sm text-[var(--text-secondary)]" aria-live="polite" data-autorizar-resumen>
        {errores.length > 0 && intentado ? (
          <span className="font-semibold text-[var(--data-error-ink)]">
            {errores.length} {errores.length === 1 ? "fila por corregir" : "filas por corregir"}
          </span>
        ) : (
          <>
            <b className="tabular-nums text-[var(--text-primary)]">{items.length}</b> {items.length === 1 ? "especie para guardar" : "especies para guardar"}
          </>
        )}
      </p>
      <button type="button" onClick={onClose} className="h-11 rounded-xl px-4 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">
        Cancelar
      </button>
      <button
        type="button"
        onClick={() => void guardar()}
        disabled={busy || items.length === 0}
        className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent-dark)] px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
        Guardar todo
      </button>
    </div>
  );

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title="Cargar lo autorizado por especie"
      description="Lo que dice la resolución (POA) para cada especie. Es el cupo contra el que se mide cada tala."
      icon={ClipboardList}
      variant="wide"
      footer={pie}
    >
      <div className="px-3 py-3 sm:px-5" data-autorizar-lote>
        {filas.length === 0 ? (
          <p className="py-4 text-sm text-[var(--text-secondary)]">El plan no tiene censo ni especies: agrega una con «Agregar».</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--rule-base)] text-left text-[length:var(--ts-2xs)] uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                  <th scope="col" className="px-2 py-2 font-bold">
                    <span className="inline-flex items-center gap-1">
                      Especie
                      <InfoTip
                        title="Cómo se llena"
                        what="Escribe los m³ y árboles que autoriza la resolución. Al lado de cada especie va lo censado, sólo como referencia."
                        affects="Fila vacía = no se toca. Para quitar una especie, usa el tacho de la tabla de abajo."
                        example="Copaiba: 120,5 m³ y 14 árboles → el cupo de Copaiba pasa de «censado» a «autorizado»."
                      />
                    </span>
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-bold">m³ autoriz.</th>
                  <th scope="col" className="px-2 py-2 text-right font-bold">N° árb.</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => {
                  const err = intentado || f.volumen || f.arboles ? errorDe.get(f.clave) : undefined;
                  const pedida = f.clave === clavePedida;
                  return (
                    <tr
                      key={f.clave}
                      data-autorizar-fila={f.clave}
                      data-pedida={pedida || undefined}
                      className={`border-b border-[var(--rule-soft)] last:border-0 ${pedida ? "bg-[var(--accent-soft)]" : ""}`}
                    >
                      <th scope="row" className="px-2 py-2 text-left align-top font-normal">
                        <span className="font-semibold text-[var(--text-primary)]">{f.especie}</span>
                        {f.id && <span className="ml-1.5 text-xs text-[var(--data-success-ink)]">ya cargada</span>}
                        <span className="block text-xs tabular-nums text-[var(--text-tertiary)]">
                          {f.arbolesCensados > 0
                            ? `censo: ${formatNumber(f.arbolesCensados)} árb. · ${fmtM3(f.censadoM3)} m³`
                            : "sin censo"}
                        </span>
                        {err && <span className="block text-xs font-semibold text-[var(--data-error-ink)]" role="alert">{err}</span>}
                      </th>
                      <td className="px-2 py-2 text-right align-top">
                        <input
                          ref={pedida ? foco : undefined}
                          inputMode="decimal"
                          value={f.volumen}
                          onChange={(e) => set(f.clave, "volumen", e.target.value)}
                          placeholder="0,000"
                          aria-label={`Volumen autorizado de ${f.especie} (m³)`}
                          aria-invalid={Boolean(err) || undefined}
                          className={`${CASILLA} ${err ? "border-[var(--data-error-500)]" : "border-[var(--rule-base)]"}`}
                        />
                      </td>
                      <td className="px-2 py-2 text-right align-top">
                        <input
                          inputMode="numeric"
                          value={f.arboles}
                          onChange={(e) => set(f.clave, "arboles", e.target.value)}
                          placeholder="—"
                          aria-label={`Número de árboles autorizados de ${f.especie}`}
                          className={`${CASILLA} border-[var(--rule-base)]`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminModal>
  );
}
