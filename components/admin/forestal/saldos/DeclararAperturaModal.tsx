"use client";

/**
 * Declarar (o deshacer) que una corrida es EXISTENCIA DE APERTURA (ADR-394).
 *
 * Calco del modal de «marcar usado»: pide el motivo porque un fiscalizador va
 * a preguntar «¿y estos 5 m³?», y la respuesta tiene que tener nombre, fecha y
 * porqué. No toca ningún número; el certificado sigue bloqueado para la corrida.
 */

import { useState } from "react";
import AdminModal from "@/components/admin/shared/AdminModal";
import { Archive } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { Btn, I, MODAL_BODY, ModalFooter } from "../ctp-shared";

export default function DeclararAperturaModal({
  corridaId,
  lote,
  deshacer = false,
  onClose,
  onListo,
}: {
  corridaId: string;
  lote: string | null;
  /** `true` = quitar la declaración (no pide motivo). */
  deshacer?: boolean;
  onClose: () => void;
  onListo: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmar() {
    if (!deshacer && motivo.trim().length < 3) {
      setError("Poné por qué esta corrida es existencia de apertura.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/forestal/ctp", {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({
          id: corridaId,
          action: "declarar_apertura",
          apertura: !deshacer,
          motivo: motivo.trim() || undefined,
        }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      onListo();
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
      title={
        deshacer
          ? "Quitar la declaración de apertura"
          : `Declarar existencia de apertura${lote ? ` · ${lote}` : ""}`
      }
      description={
        deshacer
          ? "La corrida vuelve a contar como hueco de origen a corregir."
          : "Madera anterior al libro: no hay guía ni piezas que atar. No cambia ningún número y el certificado sigue bloqueado."
      }
      icon={Archive}
      footer={
        <ModalFooter>
          <Btn variant="secondary" size="md" onClick={onClose} disabled={guardando}>
            Cancelar
          </Btn>
          <Btn variant="dark" size="md" onClick={() => void confirmar()} disabled={guardando}>
            {guardando ? "Guardando…" : deshacer ? "Quitar declaración" : "Declarar"}
          </Btn>
        </ModalFooter>
      }
    >
      <div className={`space-y-3 ${MODAL_BODY}`}>
        {!deshacer && (
          <label className="block text-sm">
            <span className="mb-1 block font-bold text-[var(--text-primary)]">Motivo</span>
            <textarea
              rows={3}
              className={`${I} h-auto py-2.5`}
              placeholder="Ej.: inventario físico al 01/07/2026, previo al libro electrónico"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </label>
        )}
        {error && (
          <p className="rounded-xl border-2 border-[var(--data-error-500)] px-3 py-2 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
            {error}
          </p>
        )}
      </div>
    </AdminModal>
  );
}
