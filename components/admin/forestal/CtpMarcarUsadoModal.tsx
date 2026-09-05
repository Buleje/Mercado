"use client";

/**
 * Marcar (o desmarcar) una corrida como "ya se usó" (Brandon, 2026-09-01).
 *
 * Para lo que quedó en la pila sin salida formal —mermas, ajustes de
 * inventario, existencias ya repartidas por fuera del libro— fabricar un
 * despacho que no ocurrió rompería la cadena de custodia. Esto es sólo una
 * etiqueta: saca la corrida de Productos disponibles sin tocar su saldo real
 * ni su historia en el libro. Reversible desde la misma pantalla.
 */

import { useState } from "react";
import { CheckCircle2, Loader2 } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { csrfHeaders } from "@/lib/csrf-client";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import { Btn, ModalBody, ModalFooter } from "./ctp-shared";

export default function CtpMarcarUsadoModal({
  corridaId,
  lineNo,
  onClose,
  onListo,
}: {
  corridaId: string;
  lineNo: number | null;
  onClose: () => void;
  onListo: (mensaje: string) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmar() {
    if (motivo.trim().length < 3) {
      setError("Poné el motivo por el que se marca como usado.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/forestal/ctp", {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ id: corridaId, action: "marcar_usado", usado: true, motivo: motivo.trim() }),
      });
      const data = (await r.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!r.ok) throw new Error(data?.message ?? data?.error ?? `El servidor respondió ${r.status}`);
      invalidarCtp("/forestal/ctp");
      onListo(`Corrida N° ${lineNo ?? "—"} marcada como usada: ya no aparece en Productos disponibles.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <AdminModal
      open
      onClose={onClose}
      variant="info"
      icon={CheckCircle2}
      title={`Marcar como usado · Corrida N° ${lineNo ?? "—"}`}
      description="Sale de Productos disponibles. Su saldo y su historia en el libro no cambian — es reversible desde la misma corrida."
      footer={
        <ModalFooter error={error}>
          <Btn variant="secondary" onClick={onClose}>
            Cancelar
          </Btn>
          <Btn variant="primary" disabled={guardando} onClick={() => void confirmar()}>
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Marcar como usado
          </Btn>
        </ModalFooter>
      }
    >
      <ModalBody>
        <div className="sm:col-span-12">
          <label className="mb-1 block text-sm font-bold text-[var(--text-primary)]" htmlFor="marcar-usado-motivo">
            Motivo (se guarda en el historial)
          </label>
          <textarea
            id="marcar-usado-motivo"
            autoFocus
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Ej.: merma de secado, ajuste de inventario, ya se entregó por fuera del libro…"
            className="w-full rounded-2xl border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-raised)] px-3.5 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)]"
          />
        </div>
      </ModalBody>
    </AdminModal>
  );
}
