"use client";

/** Cambiar el nombre de una conversación de Buleje IA. */
import { useState } from "react";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { Button } from "@/components/ui-system/Button";
import type { Resultado } from "./api";
import { CAMPO_IA } from "./campos";

export function RenombrarConversacion({
  tituloActual,
  onCerrar,
  onGuardar,
}: {
  tituloActual: string;
  onCerrar: () => void;
  onGuardar: (titulo: string) => Promise<Resultado<unknown>>;
}) {
  const [titulo, setTitulo] = useState(tituloActual);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    const t = titulo.trim();
    if (!t) return setError("Ponle un nombre.");
    setGuardando(true);
    const r = await onGuardar(t.slice(0, 120));
    setGuardando(false);
    if (r.ok) onCerrar();
    else setError(r.error);
  };

  return (
    <AdminModal
      open
      onClose={onCerrar}
      title="Nombre de la conversación"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={guardar} disabled={guardando}>
            Guardar
          </Button>
        </>
      }
    >
      <form
        className={MODAL_BODY}
        onSubmit={(e) => {
          e.preventDefault();
          void guardar();
        }}
      >
        <label htmlFor="ia-renombrar" className="mb-1 block text-sm font-semibold text-[var(--text-primary)]">
          Nombre
        </label>
        <input id="ia-renombrar" autoFocus value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={120} className={CAMPO_IA} />
        {error && <p role="alert" className="mt-2 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>}
      </form>
    </AdminModal>
  );
}
