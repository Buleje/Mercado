"use client";

/**
 * Lo que contestó el padrón (RENIEC o SUNAT), debajo del DNI o RUC: quién es,
 * de dónde salió el dato y si está verificado. Un dato de demostración se dice
 * en coral y con qué arreglar: un dato inventado disfrazado de SUNAT es peor
 * que no tener ninguno, porque termina impreso en un comprobante.
 */
import { AlertTriangle, Building2, Info, Loader2, RefreshCw, ShieldCheck, User } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import type { EstadoLookup } from "@/hooks/use-lookup-documento";
import { avisoDeSunat } from "@/lib/documento/tipos";
import { cn } from "@/lib/utils";
import { Aviso } from "./piezas";

const PILDORA = "inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold text-[var(--text-primary)]";

export default function TarjetaPadron({
  estado,
  nombreEscrito,
  onReintentar,
  onUsarNombre,
}: {
  estado: EstadoLookup;
  nombreEscrito: string;
  onReintentar: () => void;
  onUsarNombre: (nombre: string) => void;
}) {
  if (estado.fase === "quieto") return null;

  if (estado.fase === "consultando") {
    return (
      <p
        role="status"
        className="flex min-h-12 items-center gap-2 rounded-xl bg-[var(--surface-sunken)] px-3.5 text-sm font-semibold text-[var(--text-secondary)]"
      >
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
        Consultando {estado.tipo === "DNI" ? "RENIEC" : "SUNAT"}…
      </p>
    );
  }

  const r = estado.resultado;
  if (!r.encontrado) {
    return (
      <Aviso
        accion={
          r.tipo ? (
            <button type="button" onClick={onReintentar} className={button({ variant: "secondary" })}>
              <RefreshCw className="h-4 w-4" aria-hidden /> Reintentar
            </button>
          ) : null
        }
      >
        {r.motivo}
      </Aviso>
    );
  }

  const avisoSunat = avisoDeSunat(r);
  const otroNombre =
    !!nombreEscrito.trim() && nombreEscrito.trim().localeCompare(r.nombre, "es", { sensitivity: "base" }) !== 0;
  const Icono = r.demo ? Info : r.tipo === "RUC" ? Building2 : User;
  /* Clases enteras (no armadas): Tailwind sólo genera las que lee tal cual. */
  const tono = r.demo
    ? "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10"
    : "border-[var(--data-success)]/40 bg-[var(--data-success)]/10";

  return (
    <div className="space-y-3">
      <div
        role="status"
        className={cn("flex items-start gap-3 rounded-xl border px-3.5 py-3", tono)}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface-raised)]">
          <Icono
            className={cn("h-5 w-5", r.demo ? "text-[var(--data-warning-ink)]" : "text-[var(--data-success-ink)]")}
            aria-hidden
          />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="min-w-0 break-words text-base font-bold text-[var(--text-primary)]">{r.nombre}</p>
            {r.demo ? (
              <span className={cn(PILDORA, "border-[var(--data-warning-500)]/50 bg-[var(--data-warning-500)]/10")}>
                <AlertTriangle className="h-3.5 w-3.5 text-[var(--data-warning-ink)]" aria-hidden /> Dato de prueba
              </span>
            ) : (
              <span className={cn(PILDORA, "border-[var(--data-success)]/50 bg-[var(--data-success)]/10")}>
                <ShieldCheck className="h-3.5 w-3.5 text-[var(--data-success-ink)]" aria-hidden /> Verificado
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
            Según {r.fuente} · {r.tipo} {r.numero}
            {r.estado && ` · ${r.estado}`}
            {r.condicion && ` · ${r.condicion}`}
          </p>
          {r.avisoConfig && <p className="mt-1 text-sm font-semibold text-[var(--data-warning-ink)]">{r.avisoConfig}</p>}
        </div>
      </div>
      {avisoSunat && <Aviso>{avisoSunat}</Aviso>}
      {/* No es un error (puede ser el apodo con el que se lo conoce): se ofrece, no se pisa. */}
      {otroNombre && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-[var(--surface-sunken)] px-3.5 py-2 text-sm text-[var(--text-secondary)]">
          <span className="min-w-0 flex-1">
            El nombre dice «{nombreEscrito.trim()}» y el padrón, «{r.nombre}».
          </span>
          <button type="button" onClick={() => onUsarNombre(r.nombre)} className={button({ variant: "secondary" })}>
            Usar el del padrón
          </button>
        </div>
      )}
    </div>
  );
}
