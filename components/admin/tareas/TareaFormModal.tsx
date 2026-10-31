"use client";

/**
 * TareaFormModal — la ventana de «Nueva tarea» / «Editar tarea».
 *
 * La usan Equipo › Tareas y el centro «Pendientes y avisos» (ahí con
 * `encima`, porque se abre desde otra ventana). Lleva su propio borrador: al
 * abrir, parte de la tarea que se edita o de una en blanco.
 */
import { useEffect, useState } from "react";
import { Check } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { Field } from "@/components/admin/shared/Field";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import SelectorEncargado from "@/components/admin/tareas/SelectorEncargado";
import { CLASE_CAMPO_TAREA, CLASE_ROTULO_TAREA, EMPTY, MODULES, PRIORITY_META, type FormData, type Priority, type Task } from "@/components/admin/tareas/tareas-shared";

interface Props {
  open: boolean;
  /** La tarea que se edita; sin ella, es una nueva. */
  tarea: Task | null;
  guardando: boolean;
  onClose: () => void;
  /** `true` si el servidor la guardó: la ventana se cierra sola. */
  onGuardar: (form: FormData, id: string | null) => Promise<boolean>;
  /** Se abre desde otra ventana: va por encima de ella. */
  encima?: boolean;
}

function borradorDe(t: Task | null): FormData {
  if (!t) return EMPTY;
  return { title: t.title, description: t.description ?? "", priority: t.priority, assignedTo: t.assignedTo ?? "", dueDate: t.dueDate ?? "", module: t.module ?? "" };
}

export default function TareaFormModal({ open, tarea, guardando, onClose, onGuardar, encima = false }: Props) {
  const [form, setForm] = useState<FormData>(EMPTY);
  const idTarea = tarea?.id ?? null;

  /* Cada vez que se abre parte de cero (o de la tarea elegida): no hereda el borrador anterior. */
  useEffect(() => {
    if (open) setForm(borradorDe(tarea));
    // `tarea` entra por su id: un refresco de la lista no pisa lo que se está escribiendo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, idTarea]);

  const guardar = async () => {
    if (await onGuardar(form, idTarea)) onClose();
  };

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title={idTarea ? "Editar tarea" : "Nueva tarea"}
      variant="default"
      aboveModals={encima}
      footer={
        <ModalFooter>
          <button type="button" onClick={onClose} className={button({ variant: "secondary" })}>Cancelar</button>
          <button type="button" onClick={guardar} disabled={guardando || !form.title.trim()} className={button({ variant: "accent" })}>
            {guardando ? "Guardando…" : <><Check className="h-4 w-4" aria-hidden />{idTarea ? "Guardar" : "Crear tarea"}</>}
          </button>
        </ModalFooter>
      }
    >
      <div className={cn("space-y-4", MODAL_BODY)}>
        <Field label="Título" labelClassName={CLASE_ROTULO_TAREA}>
          <input type="text" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Ej.: contar el stock de gaseosas" className={CLASE_CAMPO_TAREA} />
        </Field>
        <Field label="Descripción (opcional)" labelClassName={CLASE_ROTULO_TAREA}>
          <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} className={cn(CLASE_CAMPO_TAREA, "h-auto resize-none py-2.5")} />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Prioridad" labelClassName={CLASE_ROTULO_TAREA}>
            <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as Priority }))} className={CLASE_CAMPO_TAREA}>
              {Object.entries(PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
          <Field label="Módulo" labelClassName={CLASE_ROTULO_TAREA}>
            <select value={form.module} onChange={(e) => setForm((f) => ({ ...f, module: e.target.value }))} className={CLASE_CAMPO_TAREA}>
              <option value="">Sin módulo</option>
              {MODULES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SelectorEncargado value={form.assignedTo} onChange={(v) => setForm((f) => ({ ...f, assignedTo: v }))} />
          <Field label="Fecha límite" labelClassName={CLASE_ROTULO_TAREA}>
            <input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} className={CLASE_CAMPO_TAREA} />
          </Field>
        </div>
      </div>
    </AdminModal>
  );
}
