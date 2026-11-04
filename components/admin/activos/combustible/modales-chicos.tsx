"use client";

/**
 * Las dos ventanas chicas del cuaderno: anular un renglón (con motivo; no se
 * borra, ADR-533) y ver la firma del operador en un vale.
 */

import { useEffect, useState } from "react";
import { Ban, FileSignature, Loader2 } from "@buleje/design-system/icons";
import { toast } from "sonner";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { Field } from "@/components/admin/shared/Field";
import { button } from "@/components/ui-system/button-variants";
import type { ValeCuaderno } from "@/lib/combustible/cuaderno";
import { cn } from "@/lib/utils";
import { AREA, PRIMARIO, SECUNDARIO, fechaHora, gal } from "./compartido";
import type { CuadernoCombustible, TipoRenglon } from "./use-cuaderno-combustible";

const PELIGRO = button({ variant: "danger", size: "xl", className: "rounded-xl whitespace-normal px-4" });

export function ModalAnular({ c, tipo, id, que, onClose }: { c: CuadernoCombustible; tipo: TipoRenglon; id: string; que: string; onClose: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const anular = async () => {
    setError(null);
    if (motivo.trim().length < 3) return setError("Escribe el motivo");
    setGuardando(true);
    const r = await c.anular(tipo, id, motivo.trim());
    setGuardando(false);
    if (!r.ok) return setError(r.error);
    toast.success("Anulado: ya no cuenta en el saldo");
    onClose();
  };

  return (
    <AdminModal
      open
      onClose={onClose}
      title="Anular"
      description={que}
      icon={Ban}
      size="sm"
      claveVentana="combustible-anular"
      footer={
        <ModalFooter error={error}>
          <button type="button" className={SECUNDARIO} onClick={onClose} disabled={guardando}>Cancelar</button>
          <button type="button" className={PELIGRO} onClick={() => void anular()} disabled={guardando} data-confirmar-anular>
            {guardando ? "Anulando…" : "Anular"}
          </button>
        </ModalFooter>
      }
    >
      <div className={cn("space-y-3", MODAL_BODY)}>
        <p className="text-sm text-[var(--text-secondary)]">No se borra: queda tachado en el cuaderno, con el motivo y quién lo anuló.</p>
        <Field label="Motivo" required>
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} autoFocus className={AREA} placeholder="Me equivoqué en los galones" />
        </Field>
      </div>
    </AdminModal>
  );
}

export function ModalVerFirma({ c, vale, onClose }: { c: CuadernoCombustible; vale: ValeCuaderno; onClose: () => void }) {
  const [firma, setFirma] = useState<string | null | undefined>(undefined);
  const { firmaDeVale } = c;
  useEffect(() => {
    let vivo = true;
    void firmaDeVale(vale.id).then((f) => {
      if (vivo) setFirma(f);
    });
    return () => {
      vivo = false;
    };
  }, [firmaDeVale, vale.id]);

  return (
    <AdminModal
      open
      onClose={onClose}
      title={`Firma del vale ${vale.numero ?? ""}`}
      description={`${vale.maquina} · ${gal(vale.galones)} · ${fechaHora(vale.fecha)}`}
      icon={FileSignature}
      size="md"
      claveVentana="combustible-firma"
      footer={
        <ModalFooter>
          <button type="button" className={PRIMARIO} onClick={onClose}>Cerrar</button>
        </ModalFooter>
      }
    >
      <div className={cn("space-y-2", MODAL_BODY)}>
        {firma === undefined ? (
          <p className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando la firma…</p>
        ) : firma ? (
          // eslint-disable-next-line @next/next/no-img-element -- PNG en data URL guardado en la base: next/image no aporta nada acá.
          <img src={firma} alt={`Firma de ${vale.operador ?? "el operador"}`} className="w-full rounded-xl border border-[var(--rule-base)]" />
        ) : (
          <p className="text-sm text-[var(--text-tertiary)]">Este vale no tiene firma guardada.</p>
        )}
        <p className="text-sm font-semibold text-[var(--text-primary)]">{vale.operador ?? "—"}</p>
      </div>
    </AdminModal>
  );
}
