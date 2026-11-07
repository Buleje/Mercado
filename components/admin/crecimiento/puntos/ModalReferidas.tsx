"use client";

/**
 * «Trae a una amiga» (Más › Trae a una amiga, ADR-510): las reglas del
 * negocio y quién trajo a quién, en dos secciones de la misma ventana.
 */
import { useEffect, useState } from "react";
import { HeartHandshake } from "@buleje/design-system/icons";
import AdminModal, { MODAL_GUTTER } from "@/components/admin/shared/AdminModal";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { button } from "@/components/ui-system/button-variants";
import { resumenDelPrograma } from "@/lib/referidas/reglas";
import { FormReferidas, useBorradorReferidas } from "./FormReferidas";
import { ListaReferidas } from "./ListaReferidas";
import type { Referidas } from "./use-referidas";

type Seccion = "reglas" | "anotadas";

export function ModalReferidas({ open, onClose, r, onCopiar }: { open: boolean; onClose: () => void; r: Referidas; onCopiar: (t: string) => void }) {
  const [seccion, setSeccion] = useState<Seccion>("reglas");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const borrador = useBorradorReferidas(r.resumen?.config ?? null, open);
  const { cargar } = r;

  useEffect(() => {
    if (!open) return;
    setError(null);
    void cargar();
  }, [open, cargar]);

  const guardar = async () => {
    if (borrador.error) return;
    setGuardando(true);
    const e = await r.guardar(borrador.config);
    setGuardando(false);
    if (e) setError(e);
    else onClose();
  };

  const n = r.resumen?.totales.vinculos ?? 0;
  const descripcion = r.resumen
    ? r.resumen.guardada
      ? resumenDelPrograma(r.resumen.config)
      : "Sin guardar: da los puntos de siempre."
    : "Una clienta recomienda a una amiga y las dos reciben un premio.";

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title="Trae a una amiga"
      description={descripcion}
      icon={HeartHandshake}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={button({ variant: "ghost", className: "rounded-xl text-sm" })}>
            {seccion === "reglas" ? "Cancelar" : "Cerrar"}
          </button>
          {seccion === "reglas" && (
            <button type="button" onClick={() => void guardar()} disabled={Boolean(borrador.error) || guardando || !r.resumen} className={button({ variant: "primary", className: "rounded-xl px-5 text-sm" })}>
              {guardando ? "Guardando…" : "Guardar"}
            </button>
          )}
        </div>
      }
    >
      <div className={`space-y-4 py-4 ${MODAL_GUTTER}`}>
        <SegmentedControl<Seccion>
          value={seccion}
          onChange={setSeccion}
          size="lg"
          label="Sección"
          options={[
            { value: "reglas", label: "Reglas" },
            { value: "anotadas", label: "Quién trajo a quién", badge: n || undefined },
          ]}
        />
        {r.error && !r.resumen ? (
          <p role="alert" className="text-sm text-[var(--data-error-ink)]">{r.error}</p>
        ) : seccion === "reglas" ? (
          <FormReferidas borrador={borrador} />
        ) : (
          <ListaReferidas r={r} onCopiar={onCopiar} />
        )}
        {error && <p role="alert" className="text-sm text-[var(--data-error-ink)]">{error}</p>}
      </div>
    </AdminModal>
  );
}
