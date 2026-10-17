"use client";

/**
 * «Asignar permiso» de una guía que salió sin él (15-10: las trozas anotadas a
 * mano en «Despachar con guía» nacen sin permiso). Elige uno de los permisos
 * del libro y ata la guía, sus despachos y sus trozados en una transacción
 * (`POST /api/admin/forestal/loth/guia-permiso`).
 *
 * Los permisos salen del contexto del libro (`useLothPermiso`); fuera del libro,
 * de la lista de planes. Sólo admin/dueño (el servidor lo exige igual).
 *
 * Al elegir uno, muestra por especie lo que trae la guía contra lo autorizado
 * (T7 + T6, `LothGtfSaldoDelPermiso`); si no entra, el botón se apaga con el
 * mismo «no» del despacho. El servidor vuelve a medir al confirmar.
 */

import { useCallback, useEffect, useState } from "react";
import { Link2, Loader2 } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import { logger } from "@/lib/logger";
import { nombreDelPlan, planDesdeJson, type PlanTablero } from "@/lib/forestal/loth-tablero-permiso";
import { useLothPermiso } from "./hooks/use-loth-libro-permiso";
import { leerPlanesDelLibro } from "./hooks/planes-del-libro";
import { useSaldoDelPermiso } from "./hooks/use-guia-permiso-avisos";
import LothGtfSaldoDelPermiso from "./LothGtfSaldoDelPermiso";
import { Btn, I } from "./ctp-shared";

/** El rótulo de los selectores de permiso del libro: plan · título habilitante. */
function rotulo(p: PlanTablero): string {
  const titulo = p.tituloHabilitante && p.tituloHabilitante !== nombreDelPlan(p) ? ` · ${p.tituloHabilitante}` : "";
  return `${nombreDelPlan(p)}${titulo}`;
}

export default function LothGtfAsignarPermiso({
  gtf,
  onClose,
  onHecho,
}: {
  gtf: { id: string; gtfNumber: string; piezasTotal: number | null };
  onClose: () => void;
  onHecho: () => void;
}) {
  const delLibro = useLothPermiso();
  const [planes, setPlanes] = useState<readonly PlanTablero[] | null>(delLibro?.planes.length ? delLibro.planes : null);
  const [planId, setPlanId] = useState(delLibro?.plan?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const medida = useSaldoDelPermiso(gtf.id, planId);
  const bloqueada = !!medida.saldo?.bloqueo;

  /* Fuera del libro (o con la lista todavía vacía), se piden los planes. */
  useEffect(() => {
    if (planes) return;
    let vivo = true;
    leerPlanesDelLibro()
      .then((j) => {
        if (!vivo) return;
        const lista = ((j as { plans?: unknown[] } | null)?.plans ?? []).map(planDesdeJson).filter((p): p is PlanTablero => p != null);
        setPlanes(lista);
      })
      .catch((err) => {
        logger.warn("[loth-gtf] no se pudo leer la lista de permisos", { error: String(err) });
        if (vivo) setError("No se pudo traer la lista de permisos. Cierra y vuelve a intentar.");
      });
    return () => {
      vivo = false;
    };
  }, [planes]);

  const asignar = useCallback(async () => {
    if (!planId || bloqueada) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/forestal/loth/guia-permiso", {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ gtfId: gtf.id, planId }),
      });
      const j = await leerJson<{ message?: string; error?: string }>(r);
      if (!r.ok) throw new Error(j?.message ?? j?.error ?? `No se pudo asignar (${r.status})`);
      onHecho();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [planId, bloqueada, gtf.id, onHecho]);

  return (
    <AdminModal
      size="lg"
      open
      onClose={onClose}
      title={`Asignar permiso a la GTF ${gtf.gtfNumber}`}
      description="Salió sin permiso. Elige el permiso del libro al que pertenecen sus trozas."
      icon={Link2}
      footer={
        <ModalFooter error={error}>
          <Btn variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Btn>
          <Btn
            variant="primary"
            onClick={() => void asignar()}
            disabled={busy || !planId || medida.cargando || bloqueada}
            title={bloqueada ? "No entra en lo autorizado de este permiso: elige otro o corrige las trozas" : undefined}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Link2 className="h-4 w-4" aria-hidden="true" />}
            Asignar permiso
          </Btn>
        </ModalFooter>
      }
    >
      <div className={`space-y-2 ${MODAL_BODY}`}>
        <label htmlFor="gtf-asignar-permiso" className="block text-sm font-semibold text-[var(--text-secondary)]">
          Permiso
        </label>
        {planes == null && !error ? (
          <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Trayendo los permisos…
          </p>
        ) : planes && planes.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">Este libro no tiene permisos todavía: crea el plan de manejo primero.</p>
        ) : (
          <select id="gtf-asignar-permiso" value={planId} onChange={(e) => setPlanId(e.target.value)} className={`${I} font-semibold`}>
            <option value="">Elige un permiso…</option>
            {(planes ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {rotulo(p)}
              </option>
            ))}
          </select>
        )}
        {planId && <LothGtfSaldoDelPermiso saldo={medida.saldo} cargando={medida.cargando} error={medida.error} />}
        <p className="text-sm text-[var(--text-secondary)]">
          Se atan la guía{gtf.piezasTotal ? `, sus ${gtf.piezasTotal} ${gtf.piezasTotal === 1 ? "troza" : "trozas"}` : ""} y sus líneas de despacho. La hoja ya emitida no cambia.
        </p>
      </div>
    </AdminModal>
  );
}
