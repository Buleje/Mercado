"use client";

/**
 * Dominio propio (Configuración › Plan › «Dominio propio», plegado). Salió de
 * `PlanTab` tal cual funcionaba: guardar, quitar y verificar el CNAME contra
 * `/api/tenant/custom-domain`. Los avisos van por el toast del panel.
 */
import { useState } from "react";
import { toast } from "sonner";
import { button } from "@/components/ui-system/button-variants";
import { csrfHeaders } from "@/lib/csrf-client";
import { CLASE_CAMPO } from "@/components/admin/settings/campos";
import { cn } from "@/lib/utils";
import { CheckCircle2, Link, Loader2, RefreshCw, Trash2, XCircle } from "@buleje/design-system/icons";

export function DominioPropio({ dominio, onDominio }: {
  /** El dominio guardado (`null` = ninguno). */
  dominio: string | null;
  onDominio: (d: string | null) => void;
}) {
  const [texto, setTexto] = useState(dominio ?? "");
  const [guardando, setGuardando] = useState(false);
  const [quitando, setQuitando] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [verificado, setVerificado] = useState<boolean | null>(null);
  const [mensaje, setMensaje] = useState("");

  const guardar = async () => {
    const domain = texto.trim().toLowerCase();
    if (!domain) return;
    setGuardando(true);
    try {
      const res = await fetch("/api/tenant/custom-domain", {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ domain }),
      });
      const data = await res.json() as { customDomain?: string; error?: string };
      if (!res.ok) { toast.error(data.error ?? "No se pudo guardar el dominio"); return; }
      onDominio(data.customDomain ?? domain);
      setVerificado(null);
      setMensaje("");
      toast.success("Dominio guardado", { description: "Configura el CNAME para activarlo." });
    } catch {
      toast.error("Error de red. Prueba de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  const quitar = async () => {
    setQuitando(true);
    try {
      const res = await fetch("/api/tenant/custom-domain", { method: "DELETE", headers: csrfHeaders() });
      if (!res.ok) { toast.error("No se pudo quitar el dominio"); return; }
      onDominio(null);
      setTexto("");
      setVerificado(null);
      toast.success("Dominio quitado");
    } catch {
      toast.error("Error de red. Prueba de nuevo.");
    } finally {
      setQuitando(false);
    }
  };

  const verificar = async () => {
    setVerificando(true);
    setVerificado(null);
    try {
      const res = await fetch("/api/tenant/custom-domain/verify");
      const data = await res.json() as { verified: boolean; target?: string; expected?: string; error?: string };
      setVerificado(data.verified);
      if (data.verified) setMensaje("¡CNAME verificado! Tu dominio ya apunta bien.");
      else if (data.error) setMensaje(data.error);
      else setMensaje(`El CNAME apunta a «${data.target}» y debería apuntar a «${data.expected}».`);
    } catch {
      setVerificado(false);
      setMensaje("No se pudo verificar: revisa tu conexión.");
    } finally {
      setVerificando(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <Link className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
          <input
            type="text"
            aria-label="Tu dominio"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="www.mitienda.com"
            className={cn("w-full pl-9", CLASE_CAMPO)}
          />
        </div>
        <button type="button" onClick={guardar} disabled={guardando || !texto.trim()} className={button({ variant: "primary", className: "rounded-xl" })}>
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
          Guardar
        </button>
        {dominio && (
          <button
            type="button"
            onClick={quitar}
            disabled={quitando}
            title="Quitar dominio"
            aria-label="Quitar dominio"
            className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-[var(--data-error-500)] text-[var(--data-error-ink)] hover:bg-[var(--data-error-50)] dark:hover:bg-[var(--data-error-500)]/15 disabled:opacity-50"
          >
            {quitando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
          </button>
        )}
      </div>

      {dominio && (
        <div className="space-y-3 rounded-xl bg-[var(--surface-sunken)] p-4">
          <p className="text-sm text-[var(--text-secondary)]">En el panel de tu proveedor de dominio, agrega este registro (tarda hasta 48 horas en propagarse):</p>
          <dl className="grid grid-cols-1 gap-2 rounded-lg bg-[var(--surface-raised)] p-3 font-mono text-sm sm:grid-cols-3">
            <div><dt className="text-[var(--text-secondary)]">Tipo</dt><dd className="font-bold">CNAME</dd></div>
            <div><dt className="text-[var(--text-secondary)]">Nombre</dt><dd className="font-bold">{dominio.split(".")[0]}</dd></div>
            <div className="min-w-0"><dt className="text-[var(--text-secondary)]">Apunta a</dt><dd className="truncate font-bold">{process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "bodegasaas.com"}</dd></div>
          </dl>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={verificar} disabled={verificando} className={button({ variant: "secondary", className: "rounded-xl" })}>
              {verificando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
              Verificar CNAME
            </button>
            {verificado === true && <span className="flex items-center gap-1 text-sm font-medium text-[var(--data-success-ink)]"><CheckCircle2 className="h-4 w-4" aria-hidden /> Verificado</span>}
            {verificado === false && <span className="flex items-center gap-1 text-sm text-[var(--data-error-ink)]"><XCircle className="h-4 w-4" aria-hidden /> No verificado</span>}
          </div>
          {mensaje && <p className={`text-sm ${verificado ? "text-[var(--data-success-ink)]" : "text-[var(--data-error-ink)]"}`}>{mensaje}</p>}
        </div>
      )}
    </div>
  );
}
