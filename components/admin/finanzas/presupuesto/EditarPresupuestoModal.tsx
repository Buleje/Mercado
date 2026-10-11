"use client";

/**
 * La ventana para crear o editar el presupuesto del mes por rubro (Mi Plata ›
 * Gastos › Presupuesto). Salió de `PresupuestoMensualTab` (11-10) para dejar
 * ese archivo bajo las 300 líneas y con el pie de siempre (`ModalFooter`,
 * botones a 48 px, campos a 48 px y 14 px). La lógica de guardado es la misma
 * de antes: POST `/api/presupuesto` con las categorías que tengan nombre y
 * límite.
 *
 * Quien la abre le pasa el borrador inicial y la monta con un `key` nuevo en
 * cada apertura: así el borrador arranca limpio sin un efecto que lo copie.
 */

import { useState } from "react";
import { Loader2, Plus, X } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { Field } from "@/components/admin/shared/Field";
import { button } from "@/components/ui-system/button-variants";

export type BorradorCategoria = { nombre: string; limite: string };

const CAMPO =
  "h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";
const ROTULO = "mb-1 block text-sm font-semibold text-[var(--text-secondary)]";

interface Props {
  open: boolean;
  /** «Crear» (sin categorías todavía) o «Editar». */
  creando: boolean;
  inicial: BorradorCategoria[];
  onClose: () => void;
  /** Se guardó: quien la abrió relee el presupuesto. */
  onGuardado: () => void;
}

export default function EditarPresupuestoModal({ open, creando, inicial, onClose, onGuardado }: Props) {
  const [draft, setDraft] = useState<BorradorCategoria[]>(inicial);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const agregar = () => setDraft((prev) => [...prev, { nombre: "", limite: "" }]);
  const quitar = (i: number) => setDraft((prev) => prev.filter((_, idx) => idx !== i));
  const cambiar = (i: number, campo: keyof BorradorCategoria, valor: string) =>
    setDraft((prev) => prev.map((d, idx) => (idx === i ? { ...d, [campo]: valor } : d)));

  const guardar = async () => {
    setSaveError(null);
    const categorias = draft
      .filter((d) => d.nombre.trim() && d.limite.trim())
      .map((d) => ({ nombre: d.nombre.trim(), limite: parseFloat(d.limite) }));

    if (categorias.length === 0) {
      setSaveError("Agrega al menos un rubro con nombre y límite");
      return;
    }
    if (categorias.some((c) => isNaN(c.limite) || c.limite <= 0)) {
      setSaveError("Todos los límites deben ser mayores a 0");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/presupuesto", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ categorias }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "No se pudo guardar" }));
        throw new Error(err.error || "No se pudo guardar");
      }
      onGuardado();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title={creando ? "Crear presupuesto" : "Editar presupuesto"}
      variant="default"
      footer={
        <ModalFooter error={saveError}>
          <button type="button" onClick={onClose} className={button({ variant: "secondary" })}>
            Cancelar
          </button>
          <button type="button" onClick={guardar} disabled={saving} className={button({ variant: "primary", className: "gap-2" })}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Guardar
          </button>
        </ModalFooter>
      }
    >
      <div className={`space-y-3 ${MODAL_BODY}`}>
        {draft.map((d, i) => (
          <div key={i} className="flex items-end gap-2 rounded-xl bg-[var(--surface-sunken)] p-3">
            <Field className="flex-1" label="Rubro" labelClassName={ROTULO}>
              <input type="text" value={d.nombre} onChange={(e) => cambiar(i, "nombre", e.target.value)} placeholder="Ej: Mercadería" className={CAMPO} />
            </Field>
            <Field className="w-32" label="Límite (S/)" labelClassName={ROTULO}>
              <input
                type="number"
                step="0.01"
                min="0.01"
                inputMode="decimal"
                value={d.limite}
                onChange={(e) => cambiar(i, "limite", e.target.value)}
                placeholder="0.00"
                className={CAMPO}
              />
            </Field>
            <button
              type="button"
              aria-label={`Quitar ${d.nombre || "este rubro"}`}
              onClick={() => quitar(i)}
              className={button({ variant: "ghost", size: "icon", className: "h-12 w-12 shrink-0 rounded-xl" })}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ))}
        <button type="button" onClick={agregar} className={button({ variant: "ghost", className: "gap-2 rounded-xl" })}>
          <Plus className="h-4 w-4" aria-hidden /> Agregar rubro
        </button>
      </div>
    </AdminModal>
  );
}
