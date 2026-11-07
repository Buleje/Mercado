"use client";

/**
 * Lo que Buleje IA recuerda del negocio («el blanco» = el camión N12, quién es
 * el chofer…). Lo aprende al conversar; acá se busca, se corrige, se olvida o
 * se le enseña a mano.
 */
import { useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "@buleje/design-system/icons";
import { CardTitle, ErrorAlert } from "@buleje/design-system";
import { Button } from "@/components/ui-system/Button";
import CampoBuscar from "@/components/ui-system/CampoBuscar";
import { useConfirm } from "@/components/ui-system/ConfirmModal";
import type { MemoriaItem } from "@/lib/ia-proveedores/tipos";
import { useBulejeIaMemoria } from "@/hooks/use-buleje-ia-memoria";
import { FormMemoria, NOMBRE_TIPO_MEMORIA } from "./FormMemoria";
import { fechaCorta } from "./formato";
import { PILDORA } from "./TarjetaModelo";

export function VistaMemoria() {
  const mem = useBulejeIaMemoria();
  const [editando, setEditando] = useState<MemoriaItem | "nuevo" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { confirm, ConfirmDialog } = useConfirm();

  const olvidar = async (m: MemoriaItem) => {
    const ok = await confirm({ title: `¿Olvidar «${m.titulo}»?`, description: "La IA ya no lo va a tener en cuenta.", intent: "danger", confirmLabel: "Olvidar" });
    if (!ok) return;
    const r = await mem.olvidar(m.id);
    if (!r.ok) setError(r.error);
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-5">
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <CampoBuscar
            valor={mem.busqueda}
            onCambiar={mem.setBusqueda}
            placeholder="Buscar: camión, chofer, grifo…"
            etiqueta="Buscar en lo que recuerda"
            limpiable
            className="min-w-0 flex-1"
          />
          <Button variant="accent" onClick={() => setEditando("nuevo")}>
            <Plus className="h-5 w-5" aria-hidden /> Enseñarle algo
          </Button>
        </div>

        {(mem.error || error) && (
          <ErrorAlert
            description={mem.error ?? error}
            action={
              mem.error ? (
                <Button variant="secondary" onClick={mem.recargar}>
                  Reintentar
                </Button>
              ) : undefined
            }
          />
        )}

        {mem.cargando && mem.items.length === 0 ? (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--text-secondary)]">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Cargando…
          </p>
        ) : mem.items.length === 0 && !mem.error ? (
          <p className="py-10 text-center text-sm text-[var(--text-secondary)]">
            {mem.buscando
              ? "No recuerda nada con esas palabras."
              : "Todavía no recuerda nada. Dile en el chat, por ejemplo: «recuerda que el blanco es el camión N12»."}
          </p>
        ) : (
          <ul className="space-y-2">
            {mem.items.map((m) => (
              <li key={m.id} className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <span className={`${PILDORA} bg-[var(--surface-sunken)] text-[var(--text-secondary)]`}>{NOMBRE_TIPO_MEMORIA[m.tipo] ?? m.tipo}</span>
                    <CardTitle className="mt-1.5">{m.titulo}</CardTitle>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--text-primary)]">{m.texto}</p>
                    <p className="mt-1.5 text-xs text-[var(--text-tertiary)]">
                      {m.usos > 0 ? `La usó ${m.usos} ${m.usos === 1 ? "vez" : "veces"}` : "Todavía no la usó"}
                      {m.ultimoUso && ` · última ${fechaCorta(m.ultimoUso)}`}
                      {m.creadoPor && ` · la anotó ${m.creadoPor}`}
                    </p>
                  </div>
                  <div className="flex shrink-0">
                    <Button variant="ghost" size="icon" aria-label={`Corregir ${m.titulo}`} onClick={() => setEditando(m)}>
                      <Pencil className="h-5 w-5" aria-hidden />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label={`Olvidar ${m.titulo}`} onClick={() => void olvidar(m)}>
                      <Trash2 className="h-5 w-5" aria-hidden />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {editando && (
        <FormMemoria
          item={editando === "nuevo" ? null : editando}
          onCerrar={() => setEditando(null)}
          onGuardar={(d) => (editando === "nuevo" ? mem.crear(d) : mem.editar(editando.id, d))}
        />
      )}
      <ConfirmDialog />
    </div>
  );
}
