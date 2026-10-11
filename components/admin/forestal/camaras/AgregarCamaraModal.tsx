"use client";

/**
 * «Agregar cámara»: el alta de una cámara nueva (nombre y qué mira).
 *
 * Antes eran dos campos y un botón siempre abiertos arriba de la lista: se
 * tocan una vez por cámara y ocupaban la primera fila de la pestaña todos los
 * días (Brandon 10-10: «compactar, organizar»). Ahora es un botón que abre
 * esto; al guardar se cierra y la cámara aparece en la lista con su dirección.
 */

import { useState } from "react";
import { Camera, Loader2, Plus } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { button } from "@/components/ui-system/button-variants";
import { BTN } from "./camaras-ui";

const CAMPO =
  "mt-1 h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-base text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";

interface Props {
  guardando: boolean;
  error: string | null;
  /** Devuelve el id de la cámara creada, o `null` si no salió (el error queda en `error`). */
  onCrear: (nombre: string, lugar: string) => Promise<string | null>;
  onCerrar: () => void;
}

export default function AgregarCamaraModal({ guardando, error, onCrear, onCerrar }: Props) {
  const [nombre, setNombre] = useState("");
  const [lugar, setLugar] = useState("");
  const crear = async () => {
    if (!nombre.trim() || guardando) return;
    if (await onCrear(nombre, lugar)) onCerrar();
  };

  return (
    <AdminModal
      open
      onClose={onCerrar}
      title="Agregar cámara"
      description="Después copias su dirección y la pegas en la cámara"
      icon={Camera}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className={BTN}>
            Cancelar
          </button>
          <button
            type="submit"
            form="camaras-agregar-form"
            disabled={guardando || !nombre.trim()}
            className={button({ variant: "primary", className: "gap-1.5 rounded-xl" })}
          >
            {guardando ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Plus className="h-4 w-4" aria-hidden />
            )}
            Agregar
          </button>
        </div>
      }
    >
      <form
        id="camaras-agregar-form"
        className={`${MODAL_BODY} grid gap-3`}
        onSubmit={(e) => {
          e.preventDefault();
          void crear();
        }}
      >
        <label className="block">
          <span className="text-sm font-bold text-[var(--text-secondary)]">Nombre</span>
          <input
            autoFocus
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Portón de entrada"
            className={CAMPO}
          />
        </label>
        <label className="block">
          <span className="text-sm font-bold text-[var(--text-secondary)]">
            Qué mira (opcional)
          </span>
          <input
            value={lugar}
            onChange={(e) => setLugar(e.target.value)}
            placeholder="Patio de trozas"
            className={CAMPO}
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-[var(--data-error-ink)]">
            {error}
          </p>
        )}
      </form>
    </AdminModal>
  );
}
