"use client";

import type { EstadoEnviar } from "./use-enviar-whatsapp";
export default function CampoMensaje({ arch }: { arch: EstadoEnviar }) {
  const { via, message, setMessage, errorEnvio } = arch;
  return (
    <>
      {/* Mensaje — opcional cuando va el archivo: el pedido es que llegue el
              documento, no un texto. */}
      <div>
        <label className="mb-1.5 block text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
          Mensaje{" "}
          {via !== "enlace" && (
            <span className="normal-case text-[var(--text-tertiary)]">(opcional)</span>
          )}
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={via === "enlace" ? 3 : 2}
          placeholder={via === "enlace" ? "" : "Sin texto: llega sólo el archivo"}
          className="w-full resize-none rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-primary"
        />
        <p className="mt-1 text-[length:var(--ts-2xs,11px)] text-[var(--text-tertiary)]">
          {via === "enlace"
            ? "El enlace se agrega automáticamente al final del mensaje."
            : "Si lo dejas vacío, el archivo va solo."}
        </p>
      </div>

      {errorEnvio && (
        <p className="rounded-xl border-2 border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] px-3 py-2.5 text-sm font-semibold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
          {errorEnvio}
        </p>
      )}
    </>
  );
}
