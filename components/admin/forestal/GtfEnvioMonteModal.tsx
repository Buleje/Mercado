"use client";

/**
 * Lo que la oficina ve de un envío al monte (16-10), al tocar la pastilla de la
 * fila GTF: en qué estado está, quién la imprimió, en qué hoja y la foto. Si
 * quedó «Observada» (la hoja no coincide con la guía), el porqué va arriba y
 * en rojo. «Anular el envío» la saca de la cola para mandarla de nuevo.
 */

import { useState } from "react";
import { Ban, ExternalLink, Printer } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { ETIQUETA_HOJA } from "@/lib/forestal/gtf-cola-monte";
import type { TrabajoImpresion } from "@/lib/forestal/gtf-salida-tipos";
import { Btn } from "./ctp-shared";
import type { CambioTrabajo, Respuesta } from "./hooks/use-cola-monte";
import { PastillaEstadoMonte, cuandoLima, srcFotoHoja } from "./gtf-cola-monte-ui";

export const rutaCola = (trabajoId?: string): string =>
  `/admin?tab=loth-libro-operaciones&vista=monte${trabajoId ? `&trabajo=${encodeURIComponent(trabajoId)}` : ""}`;

function Linea({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-[var(--rule-soft)] py-2 text-sm last:border-0">
      <dt className="text-[var(--text-secondary)]">{titulo}</dt>
      <dd className="font-semibold text-[var(--text-primary)]">{children}</dd>
    </div>
  );
}

export default function GtfEnvioMonteModal({
  trabajo: t,
  cambiar,
  onClose,
}: {
  trabajo: TrabajoImpresion;
  cambiar: (id: string, c: CambioTrabajo) => Promise<Respuesta<unknown>>;
  onClose: () => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const anular = async () => {
    setGuardando(true);
    setError(null);
    const r = await cambiar(t.id, { accion: "anular", motivo: "Anulado desde la oficina" });
    setGuardando(false);
    if (!r.ok) return setError(r.mensaje);
    onClose();
  };

  return (
    <AdminModal
      open
      onClose={onClose}
      size="md"
      icon={Printer}
      title="En el monte"
      description={`Guía ${t.numeroGuia}`}
      footer={
        <ModalFooter error={error}>
          {t.estado !== "anulado" && (
            <Btn variant="danger" onClick={() => (confirmando ? void anular() : setConfirmando(true))} disabled={guardando} data-qa="anular-envio-monte">
              <Ban className="h-4 w-4" aria-hidden /> {confirmando ? "Sí, sacarla de la cola" : "Anular el envío"}
            </Btn>
          )}
          <a href={rutaCola(t.id)} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]">
            <ExternalLink className="h-4 w-4" aria-hidden /> Ver en la cola
          </a>
          <Btn variant="primary" onClick={onClose}>Cerrar</Btn>
        </ModalFooter>
      }
    >
      <div className={`${MODAL_BODY} space-y-3`}>
        <div className="flex flex-wrap items-center gap-2">
          <PastillaEstadoMonte estado={t.estado} conFoto={!!t.fotoDocId} />
          {t.numeroHoja && <span className="font-mono text-sm font-bold text-[var(--text-primary)]">Hoja N° {t.numeroHoja}</span>}
        </div>
        {t.estado === "observada" && t.observacion && (
          <p role="alert" className="rounded-xl bg-[var(--data-error-50)] px-3 py-2 text-sm font-bold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]" data-qa="observacion-monte">
            {t.observacion}
          </p>
        )}
        <dl>
          <Linea titulo="Enviada">{cuandoLima(t.creadoEn)} · {t.creadoPor}</Linea>
          <Linea titulo="Hojas">{t.hojas.map((h) => ETIQUETA_HOJA[h]).join(" + ")}</Linea>
          {t.impresaEn && <Linea titulo="Impresa">{cuandoLima(t.impresaEn)} · {t.impresaPor ?? "—"}</Linea>}
          {t.titular && <Linea titulo="Titular">{t.titular}</Linea>}
        </dl>
        {t.fotoDocId ? (
          <a href={srcFotoHoja(t.numeroGuia, t.fotoDocId)} target="_blank" rel="noopener noreferrer" className="block" title="Abrir la foto en grande">
            {/* eslint-disable-next-line @next/next/no-img-element -- documento privado de la guía, servido con sesión por su ruta */}
            <img src={srcFotoHoja(t.numeroGuia, t.fotoDocId)} alt={`Foto de la hoja impresa de la guía ${t.numeroGuia}`} className="max-h-80 w-full rounded-xl border border-[var(--rule-base)] object-contain" data-qa="foto-hoja-monte" />
          </a>
        ) : (
          <p className="text-sm text-[var(--text-tertiary)]">Sin foto todavía.</p>
        )}
      </div>
    </AdminModal>
  );
}
