"use client";

/**
 * El detalle de un pedido de corrección de guía en la bandeja de soporte
 * (ADR-512): de qué negocio, qué guía (N° y fecha), cada cambio con «Dice» →
 * «Debería decir» lado a lado, el motivo, la evidencia y los botones para
 * moverlo. Lo que «dice» lo leyó el SERVIDOR de la guía guardada al recibir el
 * pedido; el negocio sólo mandó lo correcto.
 */

import { ArrowRight, Building2, ExternalLink, FileText, FileWarning, ImageIcon, Paperclip, X } from "@buleje/design-system/icons";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import {
  ENTITY_TYPE_ETIQUETA,
  esEstadoCorreccion,
  rutaEvidenciaPlataforma,
  type EntityTypeCorreccion,
  type SolicitudCorreccionDTO,
} from "@/lib/soporte/correccion-guia";
import { diaDeLaGuia, diaDelPedido } from "@/components/admin/forestal/correccion-guia/fecha";
import CorreccionAcciones from "./CorreccionAcciones";
import { etiquetaDelTicket, type SupportTicket } from "./shared";
import { useCambiarEstadoCorreccion } from "./use-cambiar-estado-correccion";

const TONO: Record<string, string> = {
  open: "bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]",
  in_review: "bg-[var(--data-info-50)] text-[var(--data-info-700)] dark:bg-[var(--data-info-500)]/15 dark:text-[var(--data-info-500)]",
  closed: "bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]",
  rejected: "bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]",
};

const tipoDeGuia = (t: string | null | undefined): string =>
  t && t in ENTITY_TYPE_ETIQUETA ? ENTITY_TYPE_ETIQUETA[t as EntityTypeCorreccion] : "Guía";

export default function CorreccionDetalle({
  ticket,
  onClose,
  onAplicar,
  onRecargar,
}: {
  ticket: SupportTicket;
  onClose: () => void;
  onAplicar: (s: SolicitudCorreccionDTO) => void;
  onRecargar: () => void | Promise<void>;
}) {
  const s = ticket.correccion ?? null;
  const estado = ticket.rawStatus ?? s?.estado ?? "open";
  const { cambiar, enviando, error } = useCambiarEstadoCorreccion({ onHecho: onAplicar, onRecargar });
  const docs = s?.documentoIds ?? [];
  /* `evidencia` = los documentos que siguen en el Archivo; sin el campo (servidor viejo), sólo se cuentan. */
  const evidencia = s?.evidencia;

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-[var(--rule-base)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
              <FileWarning className="h-4 w-4" aria-hidden /> Corrección de guía
            </p>
            <h3 className="mt-0.5 text-base font-bold text-[var(--text-primary)]">
              {s ? `${tipoDeGuia(s.entityType)} N° ${s.guiaNumero}` : ticket.subject}
              {s?.guiaFecha && <span className="font-normal text-[var(--text-secondary)]"> · emitida el {diaDeLaGuia(s.guiaFecha)}</span>}
            </h3>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-[var(--text-secondary)]">
              <Building2 className="h-4 w-4 shrink-0" aria-hidden />
              <b className="text-[var(--text-primary)]">{s?.tenantName ?? ticket.tenantName}</b>
              {(s?.tenantSlug ?? ticket.tenantSlug) && <span className="font-mono text-xs">{s?.tenantSlug ?? ticket.tenantSlug}</span>}
              <span>· pidió {s?.createdBy ?? ticket.senderEmail} el {diaDelPedido(s?.createdAt ?? ticket.createdAt)}</span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", TONO[estado] ?? TONO.open)}>{etiquetaDelTicket(ticket)}</span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar el detalle"
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] lg:hidden"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {!s ? (
          <p className="text-sm text-[var(--text-secondary)]">
            Este pedido no trae el detalle de los cambios (fila vieja). Mensaje: {ticket.lastMessage}
          </p>
        ) : (
          <>
            <section aria-label="Cambios pedidos" className="space-y-2">
              <p className="flex items-center gap-1 text-sm font-bold text-[var(--text-primary)]">
                {s.cambios.length === 1 ? "1 cambio" : `${s.cambios.length} cambios`}
                <InfoTip
                  title="Dice → Debería decir"
                  what="«Dice» es lo que la guía guardada tenía en ese casillero o fila cuando llegó el pedido: lo leyó la plataforma, no lo escribió el negocio."
                  affects="Una troza que la guía no trae sale «no está en la guía»: justo eso puede ser lo que hay que corregir."
                />
              </p>
              <ul className="space-y-2">
                {s.cambios.map((c) => (
                  <li key={`${c.donde}:${c.clave}`} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{c.etiqueta ?? (c.donde === "casillero" ? `(${c.clave})` : c.clave)}</p>
                    <div className="mt-1.5 grid items-start gap-2 sm:grid-cols-[1fr_auto_1fr]">
                      <div className="min-w-0 rounded-lg bg-[var(--surface-sunken)] px-2.5 py-2">
                        <span className="block text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Dice</span>
                        <span className="block break-words text-sm text-[var(--text-secondary)]">
                          {c.dice ?? (c.donde === "item" ? "— no está en la guía" : "— vacío")}
                        </span>
                      </div>
                      <ArrowRight className="hidden h-4 w-4 self-center text-[var(--text-tertiary)] sm:block" aria-hidden />
                      <div className="min-w-0 rounded-lg border border-[var(--accent)] bg-primary/5 px-2.5 py-2">
                        <span className="block text-xs font-bold uppercase tracking-wide text-[var(--accent-ink)] dark:text-[var(--accent)]">Debería decir</span>
                        <span className="block break-words text-sm font-semibold text-[var(--text-primary)]">{c.correcto}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-label="Motivo">
              <p className="text-sm font-bold text-[var(--text-primary)]">Motivo</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-[var(--text-secondary)]">{s.motivo}</p>
            </section>

            <section aria-label="Evidencia">
              <p className="text-sm font-bold text-[var(--text-primary)]">Evidencia</p>
              {evidencia?.length ? (
                <ul className="mt-1 flex flex-wrap gap-2">
                  {evidencia.map((e) => {
                    const Icono = e.mime.startsWith("image/") ? ImageIcon : FileText;
                    return (
                      <li key={e.docId} className="min-w-0 max-w-full">
                        <a
                          href={rutaEvidenciaPlataforma(s.id, e.docId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`Abrir ${e.nombre} en otra pestaña`}
                          className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-xl border border-[var(--rule-base)] px-3 text-sm font-semibold text-[var(--accent-ink)] hover:bg-[var(--surface-sunken)] dark:text-[var(--accent)]"
                        >
                          <Icono className="h-4 w-4 shrink-0" aria-hidden />
                          <span className="min-w-0 truncate">{e.nombre}</span>
                          <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
                        </a>
                      </li>
                    );
                  })}
                </ul>
              ) : !evidencia && docs.length ? (
                <p className="mt-1 flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
                  <Paperclip className="h-4 w-4 shrink-0" aria-hidden />
                  {docs.length === 1 ? "1 foto o PDF" : `${docs.length} fotos o PDF`} en los papeles de la guía (Archivo del negocio, etiqueta de la guía {s.guiaNumero}).
                </p>
              ) : (
                <p className="mt-1 text-sm text-[var(--text-tertiary)]">Sin foto ni PDF.</p>
              )}
            </section>

            {s.resolucion && (
              <section aria-label="Respuesta" className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
                <p className="text-sm font-bold text-[var(--text-primary)]">{estado === "rejected" ? "Por qué se rechazó" : "Qué se hizo"}</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-[var(--text-secondary)]">{s.resolucion}</p>
                {s.resolvedAt && (
                  <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                    {s.resolvedBy ?? "La plataforma"} · {diaDelPedido(s.resolvedAt)}
                  </p>
                )}
              </section>
            )}
          </>
        )}
      </div>

      {s && esEstadoCorreccion(estado) && (
        <div className="shrink-0 border-t border-[var(--rule-base)]">
          <ModalFooter error={error}>
            <CorreccionAcciones estado={estado} enviando={enviando} onCambiar={(e, r) => cambiar(ticket.id, e, r)} />
          </ModalFooter>
        </div>
      )}
    </div>
  );
}
