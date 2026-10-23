"use client";

/**
 * Menú ⋯ de cada fila de la tabla de adelantos. Antes: editar el motivo y
 * anular. Desde el 23-10 también el recibo: firmar aquí (firma o huella),
 * mandar el enlace para firmar, tomar la foto, el PDF y mandarlo por WhatsApp.
 * `stopPropagation`: la fila entera abre el detalle y el menú no compite.
 */

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Ban, Camera, FileDown, MessageCircle, MoreHorizontal, Pencil, PenLine, Send } from "@buleje/design-system/icons";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
import { MOTIVO_RECIBO_SOLO_DUENO } from "@/lib/adelantos/recibo-whatsapp";

export type AccionFila = "firmar" | "mandar" | "foto" | "pdf" | "whatsapp" | "notas" | "anular";

const ITEM =
  "flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-sm font-semibold text-[var(--text-primary)] outline-none data-[highlighted]:bg-[var(--surface-sunken)]";
const ICONO = "h-4 w-4 shrink-0 text-[var(--text-secondary)]";

export default function FilaAcciones({
  adelanto,
  mandaRecibo = true,
  onAccion,
}: {
  adelanto: DbAdelanto;
  /** `false` = el rol no entra a la carpeta privada de la persona (encargado): el ítem sale apagado con el motivo. */
  mandaRecibo?: boolean;
  onAccion: (accion: AccionFila) => void;
}) {
  const anulado = adelanto.status === "CANCELADO";
  /* Mismo criterio que `AdelantosDB.cancel` (ADR-413): uno liquidado ya salió
     por una liquidación y se corrige anulando ESA liquidación, no el adelanto. */
  const bloqueado = anulado || adelanto.status === "LIQUIDADO";
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label="Más acciones"
          title="Más acciones"
          data-fila-acciones
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
        >
          <MoreHorizontal className="h-4.5 w-4.5" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          onClick={(e) => e.stopPropagation()}
          className="z-50 min-w-[14rem] overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-1.5 shadow-[var(--shadow-xl)]"
        >
          {/* Un adelanto anulado no se firma ni se manda: su recibo ya no vale. */}
          {!anulado && (
            <>
              <DropdownMenu.Item onSelect={() => onAccion("firmar")} className={ITEM}>
                <PenLine className={ICONO} /> Firmar aquí (firma o huella)
              </DropdownMenu.Item>
              <DropdownMenu.Item onSelect={() => onAccion("mandar")} className={ITEM}>
                <Send className={ICONO} /> Mandar para firmar
              </DropdownMenu.Item>
              {/* Una foto por adelanto (el voucher no se cambia): sólo si falta. */}
              {!adelanto.comprobanteUrl && (
                <DropdownMenu.Item onSelect={() => onAccion("foto")} className={ITEM}>
                  <Camera className={ICONO} /> Tomar foto
                </DropdownMenu.Item>
              )}
            </>
          )}
          <DropdownMenu.Item onSelect={() => onAccion("pdf")} className={ITEM}>
            <FileDown className={ICONO} /> Recibo PDF
          </DropdownMenu.Item>
          {!anulado &&
            (mandaRecibo ? (
              <DropdownMenu.Item onSelect={() => onAccion("whatsapp")} className={ITEM}>
                <MessageCircle className={ICONO} /> Enviar recibo por WhatsApp
              </DropdownMenu.Item>
            ) : (
              <DropdownMenu.Item disabled className={`${ITEM} cursor-default items-start data-[disabled]:opacity-100`} data-recibo-sin-permiso>
                <MessageCircle className={`${ICONO} mt-0.5 opacity-60`} />
                <span className="min-w-0">
                  <span className="block text-[var(--text-tertiary)]">Enviar recibo por WhatsApp</span>
                  <span className="block max-w-[15rem] text-xs font-normal text-[var(--text-secondary)]">{MOTIVO_RECIBO_SOLO_DUENO}</span>
                </span>
              </DropdownMenu.Item>
            ))}
          <DropdownMenu.Separator className="my-1 h-px bg-[var(--rule-soft)]" />
          <DropdownMenu.Item onSelect={() => onAccion("notas")} className={ITEM}>
            <Pencil className={ICONO} /> Editar motivo / notas
          </DropdownMenu.Item>
          {!bloqueado && (
            <DropdownMenu.Item
              onSelect={() => onAccion("anular")}
              className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-sm font-semibold text-[var(--data-error)] outline-none data-[highlighted]:bg-[var(--data-error)]/10"
            >
              <Ban className="h-4 w-4 shrink-0" /> Anular adelanto
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
