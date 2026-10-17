"use client";

/**
 * Los accesos fijos de una cabecera (F33): las acciones del «Más» que la
 * persona eligió quedan como botones de 48 px al lado del menú, y la ventana
 * para elegirlas. Genérico: recibe las `MenuAccion` de la pantalla y los ids
 * fijados de `useAccesosFijos`.
 */
import { useState } from "react";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";

const BOTON_48 = button({ variant: "secondary", size: "icon", className: "shrink-0 rounded-xl" });

export function BotonesFijados({ acciones, fijados, prefijoQa }: { acciones: readonly MenuAccion[]; fijados: readonly string[]; prefijoQa: string }) {
  return (
    <>
      {fijados.map((id) => {
        const a = acciones.find((x) => x.id === id);
        if (!a) return null; // la acción no aplica ahora (sin permiso, sin datos)
        const Icono = a.icon;
        return (
          <button
            key={id}
            type="button"
            onClick={a.onSelect}
            disabled={a.disabled}
            aria-label={a.label}
            title={a.hint ? `${a.label} · ${a.hint}` : a.label}
            data-qa={`${prefijoQa}-fijada-${id}`}
            className={cn(BOTON_48, a.tone === "danger" && "text-[var(--data-error-ink)]")}
          >
            <Icono className={cn("h-5 w-5", a.tone !== "danger" && "text-primary")} aria-hidden />
          </button>
        );
      })}
    </>
  );
}

interface ElegirProps {
  open: boolean;
  onClose: () => void;
  titulo: string;
  tope: number;
  opciones: readonly Pick<MenuAccion, "id" | "label" | "icon">[];
  fijados: readonly string[];
  onGuardar: (ids: string[]) => void;
  prefijoQa: string;
}

/** Se monta sólo abierta (`open && <ElegirAccesosFijos …/>`): arranca con lo guardado cada vez. */
export function ElegirAccesosFijos({ open, onClose, titulo, tope, opciones, fijados, onGuardar, prefijoQa }: ElegirProps) {
  const [elegidas, setElegidas] = useState<string[]>(() => [...fijados]);
  const lleno = elegidas.length >= tope;
  const alternar = (id: string) =>
    setElegidas((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= tope ? prev : [...prev, id]));

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title={titulo}
      description={`Hasta ${tope}: quedan a un clic en la cabecera y se guardan para ti en esta computadora.`}
      size="sm"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={() => setElegidas([])} className={button({ variant: "ghost", className: "rounded-xl" })}>
            Quitar todos
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={button({ variant: "secondary", className: "rounded-xl" })}>
              Cancelar
            </button>
            <button type="button" onClick={() => { onGuardar(elegidas); onClose(); }} className={button({ variant: "primary", className: "rounded-xl" })} data-qa={`${prefijoQa}-fijar-guardar`}>
              Guardar
            </button>
          </div>
        </div>
      }
    >
      <div className={MODAL_BODY}>
        <ul className="grid gap-1">
          {opciones.map(({ id, label, icon: Icono }) => {
            const marcada = elegidas.includes(id);
            const bloqueada = !marcada && lleno;
            return (
              <li key={id}>
                <label className={cn("flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-3 hover:bg-[var(--surface-sunken)]", bloqueada && "cursor-not-allowed opacity-50")}>
                  <input type="checkbox" checked={marcada} disabled={bloqueada} onChange={() => alternar(id)} className="h-5 w-5 accent-[var(--accent)]" data-qa={`${prefijoQa}-fijar-${id}`} />
                  <Icono className="h-5 w-5 text-[var(--text-secondary)]" aria-hidden />
                  <span className="text-base text-[var(--text-primary)]">{label}</span>
                </label>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-sm text-[var(--text-secondary)]" aria-live="polite">
          {elegidas.length} de {tope} elegidas
        </p>
      </div>
    </AdminModal>
  );
}
