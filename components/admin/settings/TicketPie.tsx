"use client";

/**
 * «Tu ticket» (Configuración › Datos del negocio): el texto al pie del ticket
 * (`Settings.invoiceFooterText`) con la vista previa de cómo sale. Idea de
 * Loyverse («pie del recibo»): la columna ya existía en la base y en
 * `/api/settings`, pero ninguna pantalla la editaba. Arriba del ticket van el
 * nombre, la razón social, el RUC y la dirección que llenas en este mismo
 * formulario: la vista previa los toma de acá, así ves lo que falta.
 */
import { useId } from "react";
import { cn } from "@/lib/utils";
import { ReceiptText } from "@buleje/design-system/icons";
import { FieldLabel, TextArea } from "./campos";
import { PIE_TICKET_MAX } from "./use-ajustes";

export function TicketPie({ pie, onPie, nombre, razonSocial, ruc, direccion }: {
  pie: string;
  onPie: (v: string) => void;
  nombre: string;
  razonSocial: string;
  ruc: string;
  direccion: string;
}) {
  const id = useId();
  const quedan = PIE_TICKET_MAX - pie.length;
  return (
    <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
      <div>
        <FieldLabel htmlFor={id} icon={<ReceiptText className="h-3.5 w-3.5" />}>Texto al pie del ticket</FieldLabel>
        <TextArea
          id={id}
          value={pie}
          onChange={(v) => onPie(v.slice(0, PIE_TICKET_MAX))}
          rows={3}
          maxLength={PIE_TICKET_MAX}
          placeholder={"Gracias por tu compra\nCambios hasta 7 días con tu ticket"}
        />
        <p className={cn("mt-1 text-sm", quedan <= 20 ? "text-[var(--data-warning-ink)]" : "text-[var(--text-tertiary)]")} aria-live="polite">
          {pie.length} de {PIE_TICKET_MAX} letras
        </p>
      </div>

      {/* Vista previa: papel de térmica (58 mm ≈ 32 letras por línea). */}
      <figure aria-label="Vista previa del ticket" className="mx-auto w-full max-w-[17rem] rounded-lg border border-dashed border-[var(--rule-strong)] bg-[var(--surface-sunken)] px-3 py-2.5 font-mono text-sm leading-snug text-[var(--text-primary)]">
        <div className="text-center">
          <p className="font-bold uppercase break-words">{nombre || "Tu negocio"}</p>
          {razonSocial && <p className="break-words">{razonSocial}</p>}
          {ruc && <p>RUC {ruc}</p>}
          {direccion
            ? <p className="break-words">{direccion}</p>
            : <p className="text-[var(--text-tertiary)]">(sin dirección)</p>}
        </div>
        {/* El cuerpo del ticket en una línea: lo que cambia entre ventas no se previsualiza. */}
        <p className="my-1.5 border-y border-dashed border-[var(--rule-strong)] py-1 text-center text-[var(--text-tertiary)]">tus productos y el total</p>
        {pie.trim()
          ? <p className="text-center whitespace-pre-line break-words">{pie.trim()}</p>
          : <p className="text-center text-[var(--text-tertiary)]">(sin texto al pie)</p>}
        <figcaption className="sr-only">Así salen el encabezado y el pie de tus tickets</figcaption>
      </figure>
    </div>
  );
}
