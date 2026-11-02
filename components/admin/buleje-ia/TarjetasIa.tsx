"use client";

/**
 * Las tarjetas de una respuesta de Buleje IA, con el estilo de
 * `chat-ia/TarjetasDeAprobacion.tsx`: «¿Confirmas?» (nada cambia en el negocio
 * hasta tocar Confirmar) y el papel que devolvió (Abrir / Bajar).
 */
import { AlertTriangle, Check, Download, ExternalLink, FileText, Loader2 } from "@buleje/design-system/icons";
import { Button } from "@/components/ui-system/Button";
import { button } from "@/components/ui-system/button-variants";
import type { PapelDevuelto, PendienteApp, TipoPapel } from "@/lib/ia-proveedores/tipos";
import type { Resolucion } from "./optimista";

const NOMBRE_PAPEL: Record<TipoPapel, string> = {
  cotizacion: "Cotización",
  liquidacion: "Liquidación",
  comprobante: "Comprobante",
  reporte: "Reporte",
  documento: "Documento",
  agenda: "Agenda",
};

export function TarjetaPendiente({
  pendiente: p,
  resolucion,
  onResolver,
}: {
  pendiente: PendienteApp;
  resolucion?: Resolucion;
  onResolver: (id: string, decision: "aprobar" | "rechazar") => void;
}) {
  if (resolucion?.estado === "aprobada") {
    return (
      <div className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-success-500)] bg-[var(--data-success-50)] p-3 text-sm text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]">
        <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          <strong>Hecho.</strong> {p.resumen}
        </span>
      </div>
    );
  }
  if (resolucion?.estado === "rechazada") {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3 text-sm text-[var(--text-secondary)]">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>Cancelado. No se tocó nada.</span>
      </div>
    );
  }
  const enCurso = resolucion?.estado === "enCurso";
  return (
    <div className="rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] p-4 dark:bg-[var(--data-warning-500)]/12">
      <p className="flex items-center gap-2 text-sm font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        ¿Confirmas? Esto cambia tus datos
      </p>
      <p className="mt-1.5 text-sm font-medium text-[var(--text-primary)]">{p.resumen}</p>
      {resolucion?.estado === "error" && (
        <p role="alert" className="mt-2 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          No se pudo: {resolucion.detalle}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" disabled={enCurso} onClick={() => onResolver(p.id, "aprobar")}>
          {enCurso && resolucion.decision === "aprobar" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Check className="h-4 w-4" aria-hidden />
          )}
          Confirmar
        </Button>
        <Button variant="secondary" disabled={enCurso} onClick={() => onResolver(p.id, "rechazar")}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

export function TarjetaPapel({ papel }: { papel: PapelDevuelto }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
      <FileText className="h-6 w-6 shrink-0 text-[var(--accent)]" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-[var(--text-tertiary)]">{NOMBRE_PAPEL[papel.tipo] ?? "Papel"}</p>
        <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{papel.titulo}</p>
        {papel.resumen && <p className="text-xs text-[var(--text-secondary)]">{papel.resumen}</p>}
      </div>
      <div className="flex gap-2">
        <a href={papel.url} target="_blank" rel="noopener noreferrer" className={button({ variant: "secondary" })}>
          <ExternalLink className="h-4 w-4" aria-hidden /> Abrir
        </a>
        {/* Misma ruta que Abrir: `download` (mismo origen, con la sesión) la baja en vez de abrirla. */}
        <a href={papel.url} download className={button({ variant: "secondary" })}>
          <Download className="h-4 w-4" aria-hidden /> Bajar
        </a>
      </div>
    </div>
  );
}
