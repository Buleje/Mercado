"use client";

/**
 * Marketplace › Reseñas: aprobar, rechazar y responder las reseñas de tu
 * puesto del marketplace (`/api/reviews?all=1`, las que traen `storeId`).
 *
 * No duplica a Clientes › Opiniones: aquélla lee el mismo endpoint pero sólo
 * para el análisis (promedio, tendencia, sin acciones); ésta es la de
 * moderar. Patrón del panel (11-10): cabecera en una fila con Indicadores
 * (antes, un héroe con las mismas cifras que los chips de abajo), estados
 * como chips pegados a la lista y, por reseña, la acción que toca a la vista
 * (Aprobar si espera, Responder si no) y el resto en «⋯».
 */
import { MessageSquare, MoreHorizontal, Star, ThumbsUp, Check, X, BarChart3 } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { useMarketplaceReviews, type ReviewItem } from "@/components/admin/marketplace/hooks/use-marketplace-reviews";
import { TableSkeleton } from "@/components/admin/marketplace/shared";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { useAccionesDeVista } from "@/components/admin/marketplace/acciones-de-vista";
import { diaDe, FilaDeVista, SelectFiltro, TarjetaCifra, VacioDeUnaFrase, type OpcionFiltro } from "./cabecera-vista";

type Filtro = "all" | "pending" | "approved" | "rejected";

const ESTADO: Record<string, { rotulo: string; clase: string }> = {
  pending: { rotulo: "Por moderar", clase: "bg-[var(--data-warning-100)] text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]" },
  approved: { rotulo: "Aprobada", clase: "bg-[var(--data-success-100)] text-[var(--data-success-ink)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]" },
  rejected: { rotulo: "Rechazada", clase: "bg-[var(--data-error-100)] text-[var(--data-error-ink)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]" },
};
const HREF_OPINIONES = "/admin?tab=clientes&vista=resenas";

function Estrellas({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${n} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Star key={s} aria-hidden className={cn("h-4 w-4", s <= n ? "fill-[var(--data-warning-500)] text-[var(--data-warning-500)]" : "text-[var(--rule-base)] dark:text-[var(--rule-strong)]")} />
      ))}
    </span>
  );
}

export function MarketplaceResenasTab() {
  const r = useMarketplaceReviews();
  const { reviews, filtered, loading, filter, setFilter, replyingTo, setReplyingTo, replyText, setReplyText, saving, pendingCount, handleStatusChange, handleReply } = r;

  const total = reviews.length;
  const promedio = total > 0 ? reviews.reduce((s, x) => s + x.rating, 0) / total : 0;
  const aprobadas = reviews.filter((x) => x.status === "approved");
  const respondidas = aprobadas.filter((x) => x.adminReply).length;
  const cuenta = (s: string) => reviews.filter((x) => x.status === s).length;

  const kpis = useKpisPlegables({
    claveMemoria: "marketplace-resenas",
    alto: "md",
    compactoEnMovil: true,
    anchoFijo: true,
    sinDatosAun: loading && total === 0,
    resumen: total > 0 ? `${promedio.toFixed(1)} ★ · ${pendingCount} por moderar` : "Sin reseñas",
    tarjetas: [
      <TarjetaCifra key="p" rotulo="Promedio" valor={total > 0 ? `${promedio.toFixed(1)} de 5` : "—"} icono={Star} ayuda={`De ${total} reseñas de tu puesto, también las que esperan.`} />,
      <TarjetaCifra key="m" rotulo="Por moderar" valor={pendingCount} icono={MessageSquare} destacado={pendingCount > 0} ayuda="No se ven en el marketplace hasta que las apruebes." />,
      <TarjetaCifra key="r" rotulo="Respondidas" valor={aprobadas.length > 0 ? `${respondidas} de ${aprobadas.length}` : "—"} icono={ThumbsUp} ayuda="De las aprobadas, cuántas tienen tu respuesta." />,
    ],
  });

  const acciones: MenuAccion[] = [
    { id: "opiniones", label: "Análisis de opiniones", hint: "Clientes › Opiniones: promedio y tendencia de todas", icon: BarChart3, onSelect: () => irAEnlace(HREF_OPINIONES) },
  ];
  /* Al «⋯ Más» del hub; «Actualizar» ya lo pone el hub. */
  useAccionesDeVista(acciones);
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
    ...(x.status !== "approved" ? [{ id: "aprobar", label: "Aprobar", hint: "Se ve en el marketplace", icon: Check, onSelect: () => void handleStatusChange(x.id, "approved") }] : []),
    ...(x.status !== "rejected" ? [{ id: "rechazar", label: "Rechazar", hint: "Deja de verse en el marketplace", icon: X, tone: "danger" as const, onSelect: () => void handleStatusChange(x.id, "rejected") }] : []),
  ];

  return (
    <div className="space-y-3 sm:space-y-4">
      <FilaDeVista
        titulo="Reseñas"
        ayuda={{
          what: "Lo que opinan quienes te compraron por el marketplace. Aquí las apruebas, las rechazas y las respondes.",
          affects: "Sólo las aprobadas se ven en tu puesto del marketplace, con tu respuesta debajo. El promedio y la tendencia de todas están en Clientes › Opiniones.",
          example: "«Faltó una lata de leche» → respondes «Ya quedó corregido» y la apruebas.",
        }}
        derecha={kpis.boton}
      >
        {total > 0 && <SelectFiltro opciones={opciones} activo={filter} onCambiar={setFilter} etiqueta="Estado de la reseña" />}
      </FilaDeVista>
      {kpis.panel}

      {loading && total === 0 ? (
        <TableSkeleton />
      ) : filtered.length === 0 ? (
        <VacioDeUnaFrase>{total === 0 ? "Sin reseñas todavía: aparecen cuando alguien califica tu puesto del marketplace." : "Ninguna reseña en ese estado."}</VacioDeUnaFrase>
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
