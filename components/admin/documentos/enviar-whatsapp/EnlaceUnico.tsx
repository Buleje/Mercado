"use client";

import { Link2, Loader2, Check, Copy } from "@buleje/design-system/icons";
import type { EstadoEnviar } from "./use-enviar-whatsapp";
export default function EnlaceUnico({ arch }: { arch: EstadoEnviar }) {
  const { via, multi, isSign, creating, linkError, link, copyLink, copied } = arch;
  return (
    <>
      {via === "enlace" && !multi && (
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            <Link2 className="h-3.5 w-3.5" />{" "}
            {isSign ? "Enlace de firma (30 días)" : "Enlace de acceso (30 días)"}
          </div>
          {creating ? (
            <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <Loader2 className="h-4 w-4 animate-spin" /> Generando enlace…
            </p>
          ) : linkError ? (
            <p className="text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
              No se pudo generar el enlace: {linkError}
            </p>
          ) : (
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md bg-[var(--surface-raised)] px-2 py-1.5 text-xs text-[var(--text-secondary)]">
                {link}
              </code>
              <button
                onClick={copyLink}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--rule-base)] px-2 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:border-primary hover:text-primary"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{" "}
                {copied ? "Copiado" : "Copiar"}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
