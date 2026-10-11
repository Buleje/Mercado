"use client";

import { CardTitle } from "@buleje/design-system";
import { CheckCheck, ChevronDown } from "@buleje/design-system/icons";
import { formatTime } from "@/lib/format";
import type { Destinatario } from "./shared";

interface Props {
  /** Los primeros clientes del segmento, para elegir con cuál ver el mensaje. */
  ejemplos: Destinatario[];
  elegido: Destinatario | null;
  onElegir: (telefono: string) => void;
  texto: string;
}

/** El mensaje como lo ve el cliente en su WhatsApp: cabecera con su nombre y burbuja saliente. */
export function VistaPreviaWhatsApp({ ejemplos, elegido, onElegir, texto }: Props) {
  const inicial = (elegido?.name ?? "?").trim().charAt(0).toUpperCase();
  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Así lo verá el cliente</CardTitle>
        {ejemplos.length > 0 && (
          <div className="relative min-w-0 max-w-[60%]">
            <select
              value={elegido?.phone ?? ""}
              onChange={(e) => onElegir(e.target.value)}
              aria-label="Cliente de ejemplo para la vista previa"
              className="h-12 w-full appearance-none truncate rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] pl-3 pr-9 text-sm text-[var(--text-primary)] focus:border-primary focus:outline-none"
            >
              {ejemplos.map((c) => (
                <option key={c.phone || c.name} value={c.phone}>{c.name}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)]">
        <div className="flex items-center gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 py-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-sm font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden>{inicial}</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-[var(--text-primary)]">{elegido?.name ?? "Sin destinatarios"}</p>
            <p className="truncate text-sm text-[var(--text-secondary)]">{elegido?.phone ? `+51 ${elegido.phone}` : "sin número"}</p>
          </div>
        </div>
        <div className="min-h-40 p-4">
          <div className="ml-auto max-w-[88%] rounded-xl rounded-tr-none border border-[var(--rule-soft)] bg-[var(--accent-soft)] px-3.5 py-2.5 shadow-[var(--shadow-sm)]">
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--text-primary)]">{texto || "Escribe tu mensaje…"}</p>
            <p className="mt-1 flex items-center justify-end gap-1 text-sm text-[var(--text-secondary)]">
              {formatTime(new Date())}
              <CheckCheck className="h-4 w-4 text-[var(--data-info-500)]" aria-hidden />
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
