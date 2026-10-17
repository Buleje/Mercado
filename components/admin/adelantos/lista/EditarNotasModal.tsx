"use client";

/**
 * Editar el motivo / notas de un adelanto ya creado.
 *
 * `PATCH /api/adelantos/[id]` ya aceptaba `notas` — el endpoint se llama
 * "editar notas" en su propio comentario — pero ninguna pantalla lo llamaba
 * sin `cancelar`. Un motivo mal tipeado o una nota que quedó corta se
 * quedaba así para siempre.
 */

import { useState } from "react";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { leerJson } from "@/lib/errores/sin-dato";
import { Pencil } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import { inputCls } from "../shared";

const jsonHeaders = () => csrfHeaders({ "Content-Type": "application/json" });

export default function EditarNotasModal({
  adelantoId,
  notasActuales,
  onClose,
  onGuardado,
}: {
  adelantoId: string;
  notasActuales: string | null;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [notas, setNotas] = useState(notasActuales ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const guardar = async () => {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/adelantos/${adelantoId}`, {
        method: "PATCH",
        headers: jsonHeaders(),
        credentials: "include",
        body: JSON.stringify({ notas: notas.trim() || null }),
      });
      if (res.ok) {
        onGuardado();
        return;
      }
      const j = await leerJson<{ error?: string }>(res);
      setErr(j?.error ?? "No se pudo guardar.");
    } catch (e) {
      logger.error("[adelantos] no se pudo editar notas", { error: String(e) });
      setErr("No se pudo guardar. Revisa la conexión.");
    } finally {
      setSaving(false);
    }
  };

  return (
    /* Se abre también desde el detalle del adelanto (otro modal): va encima. */
    <AdminModal
      open
      onClose={saving ? () => undefined : onClose}
      title="Editar motivo / notas"
      icon={Pencil}
      aboveModals
      claveVentana="adelanto-editar-notas"
      footer={
        <ModalFooter error={err}>
          <button type="button" onClick={onClose} className={button({ variant: "secondary" })}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void guardar()}
            disabled={saving}
            className={button({ variant: "primary" })}
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </ModalFooter>
      }
    >
      <div className={MODAL_BODY}>
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={4}
          placeholder="Para qué era la plata…"
          aria-label="Motivo / notas del adelanto"
          className={`${inputCls} h-auto py-3`}
        />
      </div>
    </AdminModal>
  );
}
