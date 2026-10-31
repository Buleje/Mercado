"use client";

import { Lock, Loader2 } from "@buleje/design-system/icons";
import type { EstadoEnviar } from "./use-enviar-whatsapp";
export default function EnlaceConClave({ arch }: { arch: EstadoEnviar }) {
  const { via, isSign, conClave, setConClave, setClave, clave, generarConClave, creating, links } =
    arch;
  return (
    <>
      {/* Enlaces (sólo en la vía enlace) */}
      {via === "enlace" && !isSign && (
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
          <div className="flex items-start gap-2.5">
            <input
              id="enlace-con-clave"
              type="checkbox"
              checked={conClave}
              onChange={(e) => {
                setConClave(e.target.checked);
                if (!e.target.checked) setClave("");
              }}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent)]"
            />
            <div className="min-w-0">
              <label
                htmlFor="enlace-con-clave"
                className="flex cursor-pointer items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]"
              >
                <Lock className="h-3.5 w-3.5" /> Pedir una clave para abrirlo
              </label>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                Sin clave, cualquiera que reciba el enlace ve el archivo. Pasale la clave por otro
                lado (una llamada, otro chat).
              </p>
            </div>
          </div>

          {conClave && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                placeholder="Clave (mínimo 4 caracteres)"
                className="h-11 min-w-[190px] flex-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] focus:border-primary focus:outline-none"
              />
              <button
                onClick={generarConClave}
                disabled={creating || clave.trim().length < 4}
                className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-40"
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Lock className="h-4 w-4" />
                )}
                {links.size > 0 ? "Rehacer con clave" : "Generar el enlace"}
              </button>
              {links.size > 0 && (
                <p className="w-full text-[length:var(--ts-2xs,11px)] text-[var(--data-warning)]">
                  El enlace anterior sigue activo: cortalo desde la vista{" "}
                  <span className="font-bold">Enlaces</span> del drive.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
