"use client";

/**
 * Clientes › Opiniones › Moderar: aprobar, rechazar y responder las reseñas de
 * tu tienda y del marketplace (`/api/reviews?all=1`, todas las del negocio
 * menos los comentarios de producto).
 *
 * Era Marketplace › Reseñas (19-10, «juntar pestañas gemelas»): leía el mismo
 * endpoint que Opiniones, una para el análisis y otra para moderar. Ahora es
 * una sección de Opiniones. Sus cifras propias (por moderar y respondidas)
 * van en la fila del filtro; promedio y satisfacción ya están en los
 * indicadores de Opiniones. Por reseña, la acción que toca a la vista
 * (Aprobar si espera, Responder si no) y el resto en «⋯».
 */
import { ErrorAlert } from "@buleje/design-system";
import { Check, MessageSquare, MoreHorizontal, Star, X } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { useMarketplaceReviews, type ReviewItem } from "@/components/admin/marketplace/hooks/use-marketplace-reviews";
import { TableSkeleton } from "@/components/admin/marketplace/shared";
import { diaDe, SelectFiltro, VacioDeUnaFrase, type OpcionFiltro } from "@/components/admin/marketplace/tabs/cabecera-vista";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";

type Filtro = "all" | "pending" | "approved" | "rejected";

const ESTADO: Record<string, { rotulo: string; clase: string }> = {
  pending: { rotulo: "Por moderar", clase: "bg-[var(--data-warning-100)] text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]" },
  approved: { rotulo: "Aprobada", clase: "bg-[var(--data-success-100)] text-[var(--data-success-ink)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]" },
  rejected: { rotulo: "Rechazada", clase: "bg-[var(--data-error-100)] text-[var(--data-error-ink)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]" },
};
function Estrellas({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${n} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Star key={s} aria-hidden className={cn("h-4 w-4", s <= n ? "fill-[var(--data-warning-500)] text-[var(--data-warning-500)]" : "text-[var(--rule-base)] dark:text-[var(--rule-strong)]")} />
      ))}
    </span>
  );
}

interface Props {
  /** Se aprobó, rechazó o respondió una: el resumen de Opiniones vuelve a leer. */
  onCambio?: () => void;
}

export default function ModerarResenas({ onCambio }: Props) {
  const r = useMarketplaceReviews();
  const { reviews, filtered, loading, filter, setFilter, replyingTo, setReplyingTo, replyText, setReplyText, saving, pendingCount, error } = r;

  const total = reviews.length;
  const aprobadas = reviews.filter((x) => x.status === "approved");
  const respondidas = aprobadas.filter((x) => x.adminReply).length;
  const cuenta = (s: string) => reviews.filter((x) => x.status === s).length;

  const handleStatusChange = async (id: string, status: string) => {
    await r.handleStatusChange(id, status);
    onCambio?.();
  };
  const handleReply = async (id: string) => {
    await r.handleReply(id);
    onCambio?.();
  };

  const opciones: OpcionFiltro<Filtro>[] = [
    { valor: "all", rotulo: "Todos los estados", cuenta: total },
    { valor: "pending", rotulo: "Por moderar", cuenta: cuenta("pending") },
    { valor: "approved", rotulo: "Aprobadas", cuenta: cuenta("approved") },
    { valor: "rejected", rotulo: "Rechazadas", cuenta: cuenta("rejected") },
  ];

  const abrirRespuesta = (x: ReviewItem) => {
    setReplyingTo(x.id);
    setReplyText(x.adminReply ?? "");
  };
  const accionesDe = (x: ReviewItem): MenuAccion[] => [
    { id: "responder", label: x.adminReply ? "Editar respuesta" : "Responder", icon: MessageSquare, onSelect: () => abrirRespuesta(x) },
    ...(x.status !== "approved" ? [{ id: "aprobar", label: "Aprobar", hint: "Se ve en tu tienda", icon: Check, onSelect: () => void handleStatusChange(x.id, "approved") }] : []),
    ...(x.status !== "rejected" ? [{ id: "rechazar", label: "Rechazar", hint: "Deja de verse en tu tienda", icon: X, tone: "danger" as const, onSelect: () => void handleStatusChange(x.id, "rejected") }] : []),
  ];

  return (
    <div className="space-y-3">
      {error && <ErrorAlert title="No se pudo completar" description={error} />}
      {total > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <SelectFiltro opciones={opciones} activo={filter} onCambiar={setFilter} etiqueta="Estado de la reseña" />
          <p className="text-sm text-[var(--text-secondary)]">
            <span className={cn("font-semibold tabular-nums", pendingCount > 0 && "text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]")}>{pendingCount} por moderar</span>
            {aprobadas.length > 0 && <> · {respondidas} de {aprobadas.length} aprobadas con tu respuesta</>}
          </p>
        </div>
      )}

      {loading && total === 0 ? (
        <TableSkeleton />
      ) : filtered.length === 0 ? (
        error && total === 0 ? null : <VacioDeUnaFrase>{total === 0 ? "Sin reseñas todavía: aparecen cuando un cliente califica tu tienda." : "Ninguna reseña en ese estado."}</VacioDeUnaFrase>
      ) : (
        <ul className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
          {filtered.map((x) => {
            const est = ESTADO[x.status] ?? { rotulo: x.status, clase: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]" };
            const respondiendo = replyingTo === x.id;
            const ocupado = saving === x.id;
            return (
              <li key={x.id} className="space-y-2 px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-sm font-bold text-[var(--text-primary)]">{x.name || "Anónimo"}</span>
                  <Estrellas n={x.rating} />
                  <span className="text-sm text-[var(--text-secondary)]">{diaDe(x.date)}</span>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-sm font-semibold", est.clase)}>{est.rotulo}</span>
                  <div className="ml-auto flex items-center gap-1">
                    {x.status === "pending" ? (
                      <button type="button" disabled={ocupado} onClick={() => void handleStatusChange(x.id, "approved")} className={button({ variant: "secondary", className: "h-12 rounded-xl px-4 text-sm" })}>
                        <Check className="h-4 w-4" aria-hidden /> Aprobar
                      </button>
                    ) : (
                      !respondiendo && (
                        <button type="button" onClick={() => abrirRespuesta(x)} className={button({ variant: "ghost", className: "h-12 rounded-xl px-4 text-sm" })}>
                          <MessageSquare className="h-4 w-4" aria-hidden /> {x.adminReply ? "Editar respuesta" : "Responder"}
                        </button>
                      )
                    )}
                    <ActionMenu label="Acciones" icon={MoreHorizontal} soloIcono size="md" className="w-12" title={`Más acciones de la reseña de ${x.name || "Anónimo"}`} actions={accionesDe(x)} disabled={ocupado} />
                  </div>
                </div>
                {x.text && <p className="text-sm text-[var(--text-primary)]">{x.text}</p>}
                {x.adminReply && !respondiendo && (
                  <p className="border-l-2 border-primary/40 pl-3 text-sm text-[var(--text-secondary)]">
                    <span className="font-semibold text-[var(--text-primary)]">Tu respuesta: </span>
                    {x.adminReply}
                  </p>
                )}
                {respondiendo && (
                  <div className="space-y-2">
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      rows={2}
                      autoFocus
                      aria-label={`Respuesta a ${x.name || "Anónimo"}`}
                      placeholder="Gracias por tu compra…"
                      className="w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-primary"
                    />
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => { setReplyingTo(null); setReplyText(""); }} className={button({ variant: "ghost", className: "h-12 rounded-xl px-4 text-sm" })}>
                        Cancelar
                      </button>
                      <button type="button" disabled={!replyText.trim() || ocupado} onClick={() => void handleReply(x.id)} className={button({ variant: "primary", className: "h-12 rounded-xl px-4 text-sm" })}>
                        {ocupado ? "Guardando…" : "Guardar respuesta"}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
