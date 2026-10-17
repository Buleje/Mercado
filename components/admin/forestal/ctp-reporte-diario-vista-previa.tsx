"use client";

/**
 * La vista previa de un reporte diario (ADR-439), lado a lado: el correo tal
 * como llega (en un iframe SIN permisos: el html viene del servidor, pero una
 * vista previa no ejecuta nada) y el WhatsApp como burbuja, con sus negritas.
 */
import { Fragment } from "react";
import { CardTitle } from "@buleje/design-system";
import { Eye, Loader2, Mail, MessageCircle } from "@buleje/design-system/icons";
import { TOPE_WHATSAPP } from "@/lib/forestal/reporte-diario-armado";
import { SECCION_META } from "@/lib/forestal/reporte-diario";
import type { VistaPrevia } from "./hooks/use-reportes-diarios";
import { Btn } from "./ctp-shared";

/** `*negrita*` de WhatsApp → <strong>. Sólo eso: el texto ya viene sin HTML. */
function LineaWhatsapp({ linea }: { linea: string }) {
  const partes = linea.split(/(\*[^*\n]+\*)/g);
  return (
    <>
      {partes.map((p, i) =>
        p.startsWith("*") && p.endsWith("*") && p.length > 2 ? <strong key={i}>{p.slice(1, -1)}</strong> : <Fragment key={i}>{p}</Fragment>,
      )}
    </>
  );
}

export default function ReporteDiarioVistaPrevia({
  previa,
  cargando,
  error,
  onPedir,
}: {
  previa: VistaPrevia | null;
  cargando: boolean;
  error: string | null;
  onPedir: () => void;
}) {
  return (
    <section aria-labelledby="reporte-previa-titulo" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <CardTitle as="h3" id="reporte-previa-titulo" className="mr-auto flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
          <Eye className="h-4 w-4" /> Vista previa con los datos de hoy
        </CardTitle>
        <Btn size="sm" onClick={onPedir} disabled={cargando}>
          {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
          {previa ? "Actualizar" : "Ver cómo llega"}
        </Btn>
      </div>
      {error && <p className="text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>}
      {!previa && !error && (
        <p className="text-sm text-[var(--text-secondary)]">Arma el reporte con lo que hay hoy en el libro, sin mandar nada.</p>
      )}
      {previa && (
        <>
          {previa.fallidas.length > 0 && (
            <p className="text-sm text-[var(--data-warning-700)]">
              No se pudo leer: {previa.fallidas.map((s) => SECCION_META[s].nombre).join(", ")}.
            </p>
          )}
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="min-w-0 space-y-1.5">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)]">
                <Mail className="h-4 w-4 shrink-0" />
                <span className="truncate" title={previa.asunto}>
                  {previa.asunto}
                </span>
              </p>
              <iframe
                title="Vista previa del correo"
                sandbox=""
                srcDoc={previa.html}
                className="h-[28rem] w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]"
              />
            </div>
            <div className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)]">
                <MessageCircle className="h-4 w-4" /> WhatsApp
                <span className="ml-auto text-sm font-normal tabular-nums text-[var(--text-tertiary)]">
                  {previa.texto.length} / {TOPE_WHATSAPP}
                </span>
              </p>
              <div className="h-[28rem] overflow-y-auto rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
                <div className="rounded-2xl rounded-tl-sm bg-[var(--surface-raised)] p-3 text-sm leading-relaxed text-[var(--text-primary)] shadow-[var(--shadow-sm)]">
                  {previa.texto.split("\n").map((l, i) => (
                    <span key={i} className="block min-h-[1em] break-words">
                      <LineaWhatsapp linea={l} />
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
