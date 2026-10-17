"use client";

/**
 * Aviso del alta cuando el celular ya es de un cliente tuyo (seguridad 17-10,
 * punto 5). El POST ya no pisa: responde 409 con el que existe y acá se elige
 * «Usar este» (queda elegido tal cual) o actualizarlo con lo escrito (PATCH).
 */
import { useState } from "react";
import { Loader2, UserCheck } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import type { ClienteGuardado } from "./ClienteFormModal";

export type ClienteExistente = {
  phone: string;
  name: string;
  documento?: string | null;
  tipoDocumento?: string | null;
  razonSocial?: string | null;
};

type Props = {
  existente: ClienteExistente;
  /** Lo que se escribió en el formulario: es lo que manda «Actualizar». */
  cuerpo: Record<string, unknown>;
  onListo: (guardado: ClienteGuardado) => void;
  onError: (mensaje: string) => void;
};

const BOTON = "flex-1 min-h-11 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60 flex items-center justify-center gap-2";

export function ClienteYaExiste({ existente, cuerpo, onListo, onError }: Props) {
  const [actualizando, setActualizando] = useState(false);
  const doc = existente.documento ? { documento: existente.documento, tipoDocumento: existente.tipoDocumento ?? undefined } : {};

  const actualizar = async () => {
    setActualizando(true);
    try {
      const res = await fetch(`/api/customers/${encodeURIComponent(existente.phone)}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(cuerpo),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        onError(typeof data.error === "string" ? data.error : "No se pudo actualizar el cliente");
        return;
      }
      const documento = typeof cuerpo.documento === "string" && cuerpo.documento ? cuerpo.documento : undefined;
      onListo({
        name: typeof cuerpo.name === "string" ? cuerpo.name : existente.name,
        phone: existente.phone,
        ...(documento ? { documento, tipoDocumento: typeof cuerpo.tipoDocumento === "string" ? cuerpo.tipoDocumento : undefined } : doc),
      });
    } catch {
      onError("No se pudo actualizar el cliente");
    } finally {
      setActualizando(false);
    }
  };

  return (
    <div role="alert" className="rounded-xl border border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-3 py-3 space-y-2.5">
      <p className="flex items-start gap-2 text-sm text-[var(--text-primary)]">
        <UserCheck className="h-4 w-4 mt-0.5 shrink-0 text-[var(--data-warning-500)]" aria-hidden />
        <span>
          Ya tienes un cliente con ese celular: <strong>{existente.name}</strong>
          {existente.documento ? ` · ${existente.tipoDocumento ?? "Doc."} ${existente.documento}` : ""}
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={actualizando}
          onClick={() => onListo({ name: existente.name, phone: existente.phone, ...doc })}
          className={`${BOTON} bg-primary text-white hover:bg-primary-dark`}
        >
          Usar este
        </button>
        <button
          type="button"
          disabled={actualizando}
          onClick={actualizar}
          className={`${BOTON} border border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]`}
        >
          {actualizando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Actualizar con lo que escribiste
        </button>
      </div>
    </div>
  );
}
