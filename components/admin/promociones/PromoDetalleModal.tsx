"use client";

import Image from "next/image";
import { Send, Percent, Phone } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Promociones } from "@/components/admin/promociones/hooks/use-promociones";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";

/** Ventana con el detalle de una promoción. Pieza de PromotionsTab: recibe `usePromociones` entero. */
export default function PromoDetalleModal({ prm }: { prm: Promociones }) {
  const { customers, detailPromo, setDetailPromo, closeDetailModal, openEdit, openSendModal } = prm;
  return (
    <>
      {/* ── Promo Detail Modal ────────────────────────────────────────────── */}
      {detailPromo && (
        <AdminModal
          open
          onClose={closeDetailModal}
          title={detailPromo.name}
          size="md"
          claveVentana="promociones-detalle"
          footer={
            <ModalFooter>
              <button
                type="button"
                onClick={() => {
                  setDetailPromo(null);
                  openEdit(detailPromo);
                }}
                className={button({ variant: "secondary" })}
              >
                Editar
              </button>
              <button
                type="button"
                onClick={() => {
                  setDetailPromo(null);
                  openSendModal(detailPromo);
                }}
                className={button({ variant: "primary" })}
              >
                <Send className="h-4 w-4" /> Enviar por WhatsApp
              </button>
            </ModalFooter>
          }
        >
          <div className={`space-y-4 ${MODAL_BODY}`}>
            {detailPromo.imageUrl && (
              <div className="relative rounded-xl overflow-hidden bg-[var(--rule-soft)] dark:bg-accent h-48">
                <Image
                  src={detailPromo.imageUrl}
                  alt={detailPromo.name}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 50vw"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <span
                className={cn(
                  "inline-flex px-2.5 py-1 rounded-full text-sm font-bold",
                  detailPromo.active
                    ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                    : "bg-[var(--rule-soft)] dark:bg-accent text-[var(--text-secondary)] dark:text-muted",
                )}
              >
                {detailPromo.active ? "Activa" : "Inactiva"}
              </span>
              {detailPromo.discountPercent > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-bold bg-[var(--data-error-100)] text-[var(--data-error-500)]">
                  <Percent className="h-3 w-3" /> {detailPromo.discountPercent}% OFF
                </span>
              )}
              <span
                className={cn(
                  "inline-flex px-2.5 py-1 rounded-full text-sm font-bold",
                  detailPromo.targetType === "all"
                    ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                    : detailPromo.targetType === "group"
                      ? "bg-[var(--surface-sunken)] text-[var(--text-primary)]"
                      : "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]",
                )}
              >
                {detailPromo.targetType === "all"
                  ? "Todos los clientes"
                  : detailPromo.targetType === "group"
                    ? "Grupo seleccionado"
                    : "Individual"}
              </span>
            </div>
            {detailPromo.description && (
              <div>
                <p className="text-sm font-bold text-[var(--text-tertiary)] dark:text-muted">
                  Descripción
                </p>
                <p className="text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] mt-1">
                  {detailPromo.description}
                </p>
              </div>
            )}
            {detailPromo.minPurchase && (
              <div>
                <p className="text-sm font-bold text-[var(--text-tertiary)] dark:text-muted">
                  Compra mínima
                </p>
                <p className="text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] mt-1">
                  {formatCurrency(detailPromo.minPurchase)}
                </p>
              </div>
            )}
            {detailPromo.message && (
              <div>
                <p className="text-sm font-bold text-[var(--text-tertiary)] dark:text-muted">
                  Mensaje WhatsApp
                </p>
                <div className="bg-primary/10 rounded-xl p-3 mt-1 text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] whitespace-pre-wrap border border-[var(--data-success-500)]/30">
                  {detailPromo.message}
                </div>
              </div>
            )}
            {detailPromo.targetPhones && (
              <div>
                <p className="text-sm font-bold text-[var(--text-tertiary)] dark:text-muted">
                  Clientes objetivo
                </p>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {detailPromo.targetPhones
                    .split(",")
                    .filter(Boolean)
                    .map((ph) => {
                      const cust = customers.find((c) => c.phone === ph);
                      return (
                        <span
                          key={ph}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-sm bg-[var(--rule-soft)] dark:bg-accent text-[var(--text-primary)] dark:text-[var(--text-primary)] font-medium"
                        >
                          <Phone className="h-3 w-3" /> {cust ? cust.name : ph}
                        </span>
                      );
                    })}
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-3 text-sm text-[var(--text-tertiary)] dark:text-muted">
              <span>ID: {detailPromo.id}</span>
              <span>Creada: {formatDate(detailPromo.createdAt)}</span>
              {detailPromo.expiresAt && <span>Expira: {formatDate(detailPromo.expiresAt)}</span>}
            </div>
          </div>
        </AdminModal>
      )}
    </>
  );
}
