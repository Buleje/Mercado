"use client";

import dynamic from "next/dynamic";
import { CardTitle } from "@buleje/design-system";
import { Loader2, Plus, Tag, Trash2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { decodeExpenseDescription, proximoVencimiento, summarizeMeta, yaPagadoEnPeriodo } from "@/lib/expense-meta";
import { findCategory, CATEGORY_COLOR_CLASSES } from "@/lib/expense-categories";
import { getCategoryIcon } from "@/lib/expense-icons";
import { formatCurrency } from "@/lib/format";
import ConfirmarPagoModal from "@/components/admin/compras/historial/ConfirmarPagoModal";
import type { GastosFijos } from "./use-gastos-fijos";

const RecurringExpenseModal = dynamic(() => import("@/components/admin/pos/RecurringExpenseModal"), { ssr: false });

/**
 * Gastos fijos del negocio (alquiler, servicios, combustible): tarjetas que
 * abren «Registrar pago» (monto, fecha, medio y si sale de la caja).
 */
export default function CompraGastosFijos({ gastos }: { gastos: GastosFijos }) {
  const {
    expenseCatalog, expenseCatalogLoading, expenseCatalogUnico, expenseDuplicados, expenseError,
    showNewExpense, setShowNewExpense, executingTemplateId, deletingTemplateId, pagosHechos, hoyRef,
    porConfirmar, errorPago, pedirPago, cerrarPago, confirmarPago, handleDeleteTemplate, alCrear,
  } = gastos;
  return (
    <>
      <section className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl overflow-hidden mb-4">
        {/* Header del módulo */}
        <header className="px-5 py-4 border-b-2 border-[var(--rule-base)] bg-linear-to-r from-[var(--accent-soft)]/30 to-transparent dark:from-[var(--accent-muted)]/20 flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center justify-center h-11 w-11 rounded-xl bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/15 border border-[var(--data-warning-500)]/30 shrink-0">
            <Tag className="h-5 w-5 text-[var(--data-warning-500)]" strokeWidth={2.2} />
          </span>
          <div className="flex-1 min-w-0">
            {/* El rótulo decía «Artículos para Comprar» sobre un bloque de
                gastos fijos: combustible, internet y alquiler no son artículos,
                y el propio subtítulo lo desmentía. */}
            <div className="flex items-center gap-1.5">
              <CardTitle as="h2" className="text-sm font-bold text-[var(--text-primary)] truncate">
                Gastos fijos del negocio
              </CardTitle>
              <InfoTip
                title="Gastos fijos"
                what={<span>Lo que se paga todos los meses: alquiler, servicios, combustible.</span>}
                example={<span>Toca una tarjeta para registrar el pago del período.</span>}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowNewExpense(true)}
            className="inline-flex w-full sm:w-auto justify-center items-center gap-2 h-11 px-4 rounded-2xl text-sm font-semibold bg-primary text-white hover:bg-primary-dark transition-colors shadow-sm hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <Plus className="h-4 w-4" />
            Nuevo gasto recurrente
          </button>
        </header>

        {/* Body del catálogo */}
        <div className="p-4 sm:p-5">
          {expenseCatalogLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-32 rounded-2xl bg-[var(--surface-sunken)] animate-pulse" />
              ))}
            </div>
          ) : expenseCatalog.length === 0 ? (
            <div className="text-center py-10 px-4 rounded-2xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)]/50">
              <span className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/20 mb-3">
                <Tag className="h-7 w-7 text-[var(--data-warning-500)]" />
              </span>
              <p className="text-base font-bold text-[var(--text-primary)]">Aún no tienes gastos fijos cargados</p>
              <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-md mx-auto">
                Carga una vez tus pagos recurrentes (alquiler, internet, gasolina) y después solo haces <strong>click</strong> en la card cuando toca pagar.
              </p>
              <button
                type="button"
                onClick={() => setShowNewExpense(true)}
                className="mt-4 inline-flex items-center gap-2 h-12 px-5 rounded-2xl text-sm font-semibold bg-primary text-white hover:bg-primary-dark transition-colors shadow"
              >
                <Plus className="h-5 w-5" />
                Crear mi primer gasto recurrente
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {expenseDuplicados.length > 0 && (
                <div className="col-span-full rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10 px-3 py-2.5 text-sm">
                  <div className="flex items-center gap-1.5">
                    <p className="font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                      {expenseDuplicados.length === 1 ? "1 gasto repetido" : `${expenseDuplicados.length} gastos repetidos`}
                    </p>
                    <InfoTip
                      title="Gastos repetidos"
                      what={
                        <span>
                          Se muestra uno de cada uno para que no se pague dos veces:{" "}
                          {expenseDuplicados
                            .map((g) => decodeExpenseDescription(g.items[0].description ?? "").description)
                            .join(", ")}
                          .
                        </span>
                      }
                      example={<span>Para borrar los repetidos usa el botón de eliminar de cada tarjeta. El Historial de Gastos sólo lista pagos ya registrados.</span>}
                    />
                  </div>
                </div>
              )}
              {expenseCatalogUnico.map((tpl) => {
                const { description: humanDesc, meta } = decodeExpenseDescription(tpl.description || "");
                const catDef = findCategory(tpl.category, "global");
                const colorKey = meta.colorKey ?? catDef.color;
                const iconKey = meta.iconKey ?? catDef.iconKey;
                const cls = CATEGORY_COLOR_CLASSES[colorKey] ?? CATEGORY_COLOR_CLASSES.gray;
                const Icon = getCategoryIcon(iconKey);
                const isExecuting = executingTemplateId === tpl.id;
                const metaSummary = summarizeMeta(meta);
                const venc = proximoVencimiento(meta, hoyRef);
                // `id`: el pago sabe de qué plantilla salió (ADR-374), y ese
                // vínculo sobrevive a que el importe del mes venga distinto.
                const pago = yaPagadoEnPeriodo({ id: tpl.id, description: tpl.description ?? "", amount: Number(tpl.amount ?? 0) }, pagosHechos, hoyRef);
                const isDeleting = deletingTemplateId === tpl.id;
                return (
                  <div
                    key={tpl.id}
                    className={cn(
                      "group relative rounded-2xl border-2 bg-[var(--surface-raised)] hover:-translate-y-0.5 hover:shadow-lg transition-all",
                      cls.border,
                      (isExecuting || isDeleting) && cn("ring-2", cls.ring),
                      isDeleting && "opacity-60",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => pedirPago({
                        id: tpl.id,
                        nombre: humanDesc || tpl.category,
                        amount: Number(tpl.amount ?? 0),
                        resumenMeta: metaSummary || tpl.category,
                        textoVencimiento: venc.texto,
                        pagado: pago.pagado,
                        metodo: tpl.paymentMethod ?? meta.paymentMethod ?? null,
                      })}
                      disabled={isExecuting || isDeleting}
                      aria-label={`Registrar gasto ${humanDesc || tpl.category} por ${formatCurrency(tpl.amount)}`}
                      className="w-full text-left p-4 rounded-2xl disabled:cursor-wait focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      <div className="flex items-start gap-3 mb-3">
                        <span className={cn("inline-flex items-center justify-center h-10 w-10 rounded-xl shrink-0", cls.iconBg)}>
                          <Icon className={cn("h-5 w-5", cls.text)} strokeWidth={2} />
                        </span>
                        <div className="flex-1 min-w-0 pr-7">
                          <p className={cn("text-xs font-bold uppercase tracking-wider", cls.text)}>
                            {tpl.category}
                          </p>
                          <p className="text-sm font-bold text-[var(--text-primary)] line-clamp-2 leading-tight mt-0.5">
                            {humanDesc || "Sin descripción"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-end justify-between gap-2">
                        <div>
                          <p className="text-xl font-extrabold text-[var(--text-primary)] tabular-nums leading-none">
                            {formatCurrency(tpl.amount)}
                          </p>
                          {metaSummary && (
                            <p className="text-xs text-[var(--text-secondary)] mt-1 font-medium">
                              {metaSummary}
                            </p>
                          )}
                          {meta.supplierName && (
                            <p className="text-xs text-[var(--text-tertiary)] mt-0.5 truncate max-w-[16ch]">
                              {meta.supplierName}
                            </p>
                          )}
                          {/* «Mensual · Día 5» dejaba la cuenta al lector: para
                              saber si vence mañana había que mirar el calendario. */}
                          {pago.pagado ? (
                            <p className="text-xs mt-0.5 font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
                              ya pagado este período
                            </p>
                          ) : venc.estado !== "sin_fecha" && (
                            <p
                              className={cn(
                                "text-xs mt-0.5 font-bold",
                                venc.estado === "vencido" || venc.estado === "hoy"
                                  ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
                                  : venc.estado === "pronto"
                                    ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                                    : "text-[var(--text-tertiary)]",
                              )}
                            >
                              {venc.texto}
                            </p>
                          )}
                        </div>
                        <span className={cn(
                          "inline-flex items-center gap-1 h-8 px-3 rounded-xl text-xs font-bold border-2 transition-all",
                          // El color salía de `colorKey`, que es decorativo: tres
                          // botones «Pagar» en verde, rojo y violeta sin que la
                          // diferencia significara nada. Ahora lo dice el vencimiento.
                          pago.pagado
                            ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] border-[var(--data-success-500)] dark:text-[var(--data-success-500)]"
                            : venc.estado === "vencido" || venc.estado === "hoy"
                            ? "bg-[var(--data-error-500)]/12 text-[var(--data-error-700)] border-[var(--data-error-500)] dark:text-[var(--data-error-500)]"
                            : venc.estado === "pronto"
                              ? "bg-[var(--data-warning-500)]/12 text-[var(--data-warning-700)] border-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]"
                              : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] border-[var(--rule-base)]",
                          "group-hover:scale-105"
                        )}>
                          {isExecuting ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Pagando
                            </>
                          ) : (
                            <>
                              <Plus className="h-3.5 w-3.5" strokeWidth={3} />
                              Pagar
                            </>
                          )}
                        </span>
                      </div>
                    </button>
                    {/* Botón eliminar — top-right, oculto hasta hover/focus */}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(tpl, humanDesc); }}
                      disabled={isExecuting || isDeleting}
                      aria-label={`Eliminar ${humanDesc || tpl.category} del catálogo`}
                      className="absolute top-2 right-2 h-8 w-8 inline-flex items-center justify-center rounded-xl text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] dark:hover:bg-[var(--data-error-500)]/10 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--data-error-500)]"
                    >
                      {isDeleting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {expenseError && (
            <div className="mt-4 p-3 rounded-2xl bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/10 border-2 border-[var(--data-error-500)]/40 text-sm font-semibold text-[var(--data-error-500)]">
              {expenseError}
            </div>
          )}
        </div>
      </section>

      {/* El mismo «Registrar pago» del Historial; `key` para no arrastrar la
          fecha o el monto de un fijo al siguiente. */}
      <ConfirmarPagoModal
        key={porConfirmar?.id ?? "ninguno"}
        pago={porConfirmar}
        guardando={executingTemplateId != null && executingTemplateId === porConfirmar?.id}
        error={errorPago}
        onConfirmar={confirmarPago}
        onClose={cerrarPago}
      />

      {/* Modal nuevo template de gasto (componente completo) */}
      <RecurringExpenseModal
        open={showNewExpense}
        onClose={() => setShowNewExpense(false)}
        onCreated={alCrear}
        tenantSlug={typeof window !== "undefined" ? (window.location.pathname.split("/")[2] || "main") : "main"}
      />
    </>
  );
}
