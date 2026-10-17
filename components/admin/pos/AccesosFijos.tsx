"use client";

/**
 * Los accesos fijos del POS (H06/M03): las acciones del «Más» que el cajero
 * eligió quedan a un clic en la fila del buscador; el «Más» conserva el resto
 * y la ventana para elegirlas o restablecer.
 */
import { useState } from "react";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { TOPE_FIJADAS, type AccionFijable } from "./use-acciones-fijadas";

const BOTON_48 = button({ variant: "secondary", size: "icon", className: "shrink-0 rounded-xl" });

export function BotonesFijados({ acciones, fijadas }: { acciones: MenuAccion[]; fijadas: readonly AccionFijable[] }) {
  return (
    <>
      {fijadas.map((id) => {
        const a = acciones.find((x) => x.id === id);
        if (!a) return null; // «Repetir» o «Reimprimir» sin una venta previa no tienen qué hacer.
        const Icono = a.icon;
        const titulo = a.hint ? `${a.label} · ${a.hint}` : a.label;
        return (
          <button
            key={id}
            type="button"
            onClick={a.onSelect}
            disabled={a.disabled}
            aria-label={a.label}
            aria-pressed={a.activo === undefined ? undefined : a.activo}
            title={titulo}
            data-qa={`pos-fijada-${id}`}
            className={cn(BOTON_48, a.activo && "border-primary bg-primary/10", a.tone === "danger" && "text-[var(--data-error-ink)]")}
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
  opciones: { id: AccionFijable; label: string; icon: MenuAccion["icon"] }[];
  fijadas: readonly AccionFijable[];
  onGuardar: (ids: AccionFijable[]) => void;
}

export function ElegirAccesosModal({ open, onClose, opciones, fijadas, onGuardar }: ElegirProps) {
  const [elegidas, setElegidas] = useState<AccionFijable[]>(() => [...fijadas]);
  const lleno = elegidas.length >= TOPE_FIJADAS;
  const alternar = (id: AccionFijable) =>
    setElegidas((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= TOPE_FIJADAS ? prev : [...prev, id]));

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title="Accesos fijos del mostrador"
      description={`Hasta ${TOPE_FIJADAS}: quedan a un clic al lado del buscador y salen del «Más».`}
      size="sm"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={() => setElegidas([])} className={button({ variant: "ghost", className: "rounded-xl" })}>
            Restablecer
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={button({ variant: "secondary", className: "rounded-xl" })}>
              Cancelar
            </button>
            <button type="button" onClick={() => { onGuardar(elegidas); onClose(); }} className={button({ variant: "primary", className: "rounded-xl" })} data-qa="pos-fijar-guardar">
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
                  <input type="checkbox" checked={marcada} disabled={bloqueada} onChange={() => alternar(id)} className="h-5 w-5 accent-[var(--accent)]" data-qa={`pos-fijar-${id}`} />
                  <Icono className="h-5 w-5 text-[var(--text-secondary)]" aria-hidden />
                  <span className="text-base text-[var(--text-primary)]">{label}</span>
                </label>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-sm text-[var(--text-secondary)]" aria-live="polite">
          {elegidas.length} de {TOPE_FIJADAS} elegidas
        </p>
      </div>
    </AdminModal>
  );
}
