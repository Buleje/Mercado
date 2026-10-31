"use client";

/**
 * «Adelantos fijos» (antes la pestaña «Recurrentes», 25-10): los adelantos que se
 * crean solos cada semana, quincena o mes. Se abre desde el menú ⋯ de Adelantos.
 * Misma función de siempre; sólo cambió dónde vive y cómo se dice.
 */

import { useCallback, useEffect, useState } from "react";
import { Ban, CheckCircle, Plus, Repeat, Trash2 } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import { formatDateShort } from "@/lib/format";
import type { DbRecurrente } from "@/lib/db/adelantos.db";
import { fmtMon, EmptyState, SkeletonGrid } from "../shared";
import type { BeneficiarioConSaldo } from "../crear-adelanto/tipos";
import CrearRecurrenteModal, { FREC_LABEL } from "./CrearRecurrenteModal";

const jsonHeaders = () => csrfHeaders({ "Content-Type": "application/json" });

export default function AdelantosFijosModal({
  beneficiarios,
  onClose,
  onChange,
}: {
  beneficiarios: BeneficiarioConSaldo[];
  onClose: () => void;
  onChange: () => void;
}) {
  const [recs, setRecs] = useState<DbRecurrente[]>([]);
  const [loading, setLoading] = useState(true);
  const [creando, setCreando] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/adelantos/recurrentes", { credentials: "include" })
      .then((x) => (x.ok ? x.json() : []))
      .catch((err: unknown) => {
        logger.error("[adelantos] no se pudieron leer los adelantos fijos", { error: String(err) });
        return [];
      });
    setRecs(Array.isArray(r) ? r : []);
    setLoading(false);
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);

  const toggle = async (r: DbRecurrente) => {
    await fetch(`/api/adelantos/recurrentes/${r.id}`, { method: "PATCH", headers: jsonHeaders(), credentials: "include", body: JSON.stringify({ activo: !r.activo }) });
    void reload();
  };
  const borrar = async (r: DbRecurrente) => {
    await fetch(`/api/adelantos/recurrentes/${r.id}`, { method: "DELETE", headers: jsonHeaders(), credentials: "include" });
    void reload();
  };

  return (
    <AdminModal open onClose={onClose} title="Adelantos fijos" icon={Repeat} size="lg" claveVentana="adelantos-fijos">
      <div className={`${MODAL_BODY} space-y-4`}>
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            {recs.length} fijo{recs.length === 1 ? "" : "s"}
            <InfoTip
              title="Adelantos fijos"
              what="Un adelanto que se repite solo: eliges la persona, el monto y cada cuánto. Se crean solos cada día a primera hora."
              example="S/ 200 cada mes, el día 1, para el vigilante."
            />
          </span>
          <button type="button" onClick={() => setCreando(true)} disabled={beneficiarios.length === 0} className={button({ variant: "primary" })}>
            <Plus className="h-4 w-4" aria-hidden /> Nuevo fijo
          </button>
        </div>

        {loading ? (
          <SkeletonGrid />
        ) : recs.length === 0 ? (
          <EmptyState icon={Repeat} title="Sin adelantos fijos" hint={beneficiarios.length === 0 ? "Primero crea una persona." : "Programa un adelanto que se repita solo."} />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {recs.map((r) => (
              <div key={r.id} className={`rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 ${!r.activo ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-base font-extrabold text-[var(--text-primary)]">{r.beneficiarioNombre ?? "—"}</p>
                  <button type="button" onClick={() => void borrar(r)} title="Eliminar" aria-label={`Eliminar el adelanto fijo de ${r.beneficiarioNombre ?? "esta persona"}`} className={button({ variant: "ghost", size: "icon", className: "h-9 w-9 shrink-0 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-error)]" })}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
                <p className="mt-1 text-2xl font-extrabold tabular-nums text-[var(--text-primary)]">{fmtMon(r.monto, r.moneda)}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]"><Repeat className="h-4 w-4" aria-hidden /> {FREC_LABEL[r.frecuencia]}</span>
                  {r.proximaEjecucion && <span className="text-[var(--text-tertiary)]">Próximo: {formatDateShort(r.proximaEjecucion)}</span>}
                </div>
                <button type="button" onClick={() => void toggle(r)} className={button({ variant: "ghost", size: "md", className: `mt-3 h-9 gap-1.5 rounded-full px-3 font-bold ${r.activo ? "bg-[var(--data-success)]/15 text-[var(--data-success)]" : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"}` })}>
                  {r.activo ? <><CheckCircle className="h-4 w-4" aria-hidden /> Activo</> : <><Ban className="h-4 w-4" aria-hidden /> Pausado</>}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      {creando && (
        <CrearRecurrenteModal beneficiarios={beneficiarios} onClose={() => setCreando(false)} onCreated={() => { setCreando(false); void reload(); onChange(); }} />
      )}
    </AdminModal>
  );
}
