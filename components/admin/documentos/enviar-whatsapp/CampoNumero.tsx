"use client";

import type { EstadoEnviar } from "./use-enviar-whatsapp";
export default function CampoNumero({ arch }: { arch: EstadoEnviar }) {
  const { via, phone, setPhone, normalized } = arch;
  return (
    <>
      {/* Número — obligatorio para mandar el archivo desde el negocio */}
      {via !== "dispositivo" && (
        <div>
          <label className="mb-1.5 block text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Número de WhatsApp{" "}
            {via === "archivo" && <span className="text-[var(--data-error-600)]">*</span>}
          </label>
          <div className="flex items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 focus-within:border-primary">
            <span className="shrink-0 text-sm font-bold text-[var(--text-tertiary)]">+51</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              placeholder="929 340 532"
              className="min-w-0 flex-1 bg-transparent h-11 text-sm text-[var(--text-primary)] outline-none"
            />
            {normalized && (
              <span className="shrink-0 text-xs tabular-nums text-[var(--text-tertiary)]">
                → {normalized}
              </span>
            )}
          </div>
          <p className="mt-1 text-[length:var(--ts-2xs,11px)] text-[var(--text-tertiary)]">
            {via === "archivo"
              ? "El archivo se manda a este número desde el WhatsApp del negocio."
              : "Perú (+51) por defecto. Dejalo vacío para elegir el contacto dentro de WhatsApp."}
          </p>
        </div>
      )}
    </>
  );
}
