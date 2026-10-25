"use client";

/**
 * «Desatar del permiso» (25-10, revisión del freno de saldo): la vuelta atrás
 * de «Asignar permiso». La guía, sus líneas de despacho y los trozados sin
 * árbol de sus trozas vuelven a sin plan en una transacción
 * (`DELETE /api/admin/forestal/loth/guia-permiso?gtfId=…`). Sólo admin/dueño
 * (el servidor lo exige igual).
 *
 * Sin plan, lo que se llevó cuenta en el saldo de CADA plan vigente (ADR-459):
 * si con eso alguno queda pasado, el servidor lo dice y se muestra antes de
 * cerrar. Un mes cerrado o una troza de la tala del plan → el 422 del servidor.
 */

import { useCallback, useState } from "react";
import { AlertTriangle, Link2Off, Loader2 } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import { Btn } from "./ctp-shared";

interface Respuesta {
  despachos?: number;
  trozados?: number;
  avisos?: string[];
  message?: string;
  error?: string;
}

export default function LothGtfDesatarPermiso({
  gtf,
  permiso,
  onClose,
  onHecho,
  aboveModals = false,
}: {
  gtf: { id: string; gtfNumber: string };
  /** El permiso del que sale (para la pregunta); `null` = no se sabe el nombre. */
  permiso: string | null;
  onClose: () => void;
  onHecho: () => void;
  /** Se abre desde otra ventana (el saldo del plan). */
  aboveModals?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Lo que el servidor avisa al desatar: con avisos, se leen antes de cerrar. */
  const [avisos, setAvisos] = useState<string[] | null>(null);

  const desatar = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/forestal/loth/guia-permiso?gtfId=${encodeURIComponent(gtf.id)}`, {
        method: "DELETE",
        credentials: "include",
        headers: csrfHeaders(),
      });
      const j = await leerJson<Respuesta>(r);
      if (!r.ok) throw new Error(j?.message ?? j?.error ?? `No se pudo desatar (${r.status})`);
      if (j?.avisos?.length) setAvisos(j.avisos);
      else onHecho();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [gtf.id, onHecho]);

  const hecho = avisos != null;
  return (
    <AdminModal
      aboveModals={aboveModals}
      size="md"
      open
      onClose={hecho ? onHecho : onClose}
      title={`Desatar la GTF ${gtf.gtfNumber}`}
      description={permiso ? `Sale del permiso ${permiso} y vuelve a sin plan.` : "Vuelve a sin plan."}
      icon={Link2Off}
      footer={
        <ModalFooter error={error}>
          {hecho ? (
            <Btn variant="primary" onClick={onHecho}>
              Entendido
            </Btn>
          ) : (
            <>
              <Btn variant="ghost" onClick={onClose} disabled={busy}>
                Cancelar
              </Btn>
              <Btn variant="danger" onClick={() => void desatar()} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Link2Off className="h-4 w-4" aria-hidden="true" />}
                Desatar
              </Btn>
            </>
          )}
        </ModalFooter>
      }
    >
      <div className={`space-y-2 ${MODAL_BODY}`}>
        {hecho ? (
          <>
            <p className="text-sm font-semibold text-[var(--text-primary)]">Listo: la guía quedó sin plan.</p>
            {avisos.map((a) => (
              <p key={a} className="flex items-start gap-2 rounded-lg border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] p-2 text-sm text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/10 dark:text-[var(--data-warning-500)]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {a}
              </p>
            ))}
          </>
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">
            La guía, sus líneas de despacho y los trozados de sus trozas sin árbol quedan sin plan: cuentan en el saldo de cada plan vigente hasta que la ates de nuevo. La hoja ya emitida no cambia.
          </p>
        )}
      </div>
    </AdminModal>
  );
}
