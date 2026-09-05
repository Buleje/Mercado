"use client";

/**
 * DuenosModal — gestión explícita de los dueños guardados.
 *
 * El campo "Dueño" ya guardaba solo (al tipear uno nuevo, queda recordado
 * para la próxima vez) — pero eso era implícito y Brandon lo pidió explícito:
 * un lugar donde CREAR un nombre y GUARDARLO es un gesto aparte de ESCOGERLO
 * después. Este modal es ese lugar.
 */
import { useState } from "react";
import { Check, Trash2, UserPlus } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { Btn, ModalBody, ModalFooter } from "./ctp-shared";

export default function DuenosModal({
  duenos,
  actual,
  onAgregar,
  onQuitar,
  onElegir,
  onClose,
}: {
  /** Los ya guardados en este equipo. */
  duenos: string[];
  /** El dueño que está fijo ahora mismo, para marcarlo en la lista. */
  actual: string;
  onAgregar: (nombre: string) => void;
  onQuitar: (nombre: string) => void;
  /** Elegir cierra el modal: es el gesto de "lo uso ahora". */
  onElegir: (nombre: string) => void;
  onClose: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const agregar = () => {
    const limpio = nombre.trim();
    if (!limpio) { setErr("Escribí un nombre."); return; }
    if (duenos.some((d) => d.toLowerCase() === limpio.toLowerCase())) {
      setErr("Ese dueño ya está guardado.");
      return;
    }
    onAgregar(limpio);
    setNombre("");
    setErr(null);
  };

  return (
    <AdminModal
      open
      onClose={onClose}
      title="Dueños guardados"
      description="Creá el nombre una vez; después lo elegís de la lista, sin re-tipearlo."
    >
      <ModalBody className="space-y-4">
        <div className="flex gap-2">
          <input
            value={nombre}
            onChange={(e) => { setNombre(e.target.value); setErr(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregar(); } }}
            placeholder="Nombre del dueño nuevo"
            aria-label="Nombre del dueño nuevo"
            autoFocus
            className="h-11 min-w-0 flex-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-base)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
          <Btn variant="primary" onClick={agregar}>
            <UserPlus className="h-4 w-4" /> Guardar
          </Btn>
        </div>
        {err && <p role="alert" className="text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{err}</p>}

        {duenos.length === 0 ? (
          <p className="rounded-xl bg-[var(--surface-sunken)] px-4 py-6 text-center text-sm text-[var(--text-tertiary)]">
            Todavía no guardaste ningún dueño. Escribí uno arriba.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)]">
            {duenos.map((d) => (
              <li key={d} className="flex items-center gap-2 px-3 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--text-primary)]">{d}</span>
                {actual === d ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/12 px-2.5 py-1 text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
                    <Check className="h-3.5 w-3.5" /> Elegido
                  </span>
                ) : (
                  <Btn variant="secondary" size="sm" onClick={() => onElegir(d)}>Elegir</Btn>
                )}
                <button
                  type="button"
                  onClick={() => onQuitar(d)}
                  aria-label={`Borrar a ${d} de la lista de dueños`}
                  title="Borrar de la lista (no toca las piezas que ya cargaste con este dueño)"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition-colors hover:bg-[var(--data-error-50)] hover:text-[var(--data-error-700)] dark:hover:bg-[var(--data-error-500)]/12 dark:hover:text-[var(--data-error-500)]"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </ModalBody>
      <ModalFooter nota="Se guarda en este equipo — no se comparte con otro dispositivo.">
        <Btn variant="ghost" onClick={onClose}>Cerrar</Btn>
      </ModalFooter>
    </AdminModal>
  );
}
