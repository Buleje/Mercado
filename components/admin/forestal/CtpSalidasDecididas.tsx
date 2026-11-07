"use client";

/**
 * Lo que la revisión de «Guías sin registrar» ya dejó decidido (ADR-446): los
 * Anexos 04 reemplazados, las guías que el dueño dijo que salieron dos veces,
 * los anexos sin N° de guía y las guías que ya están en Despacho. Lo que se
 * puede volver atrás trae su botón; nada se borra.
 */
import type { RespuestaPendientes } from "@/lib/db/forest-ctp-guia-desde-anexo.db";
import type { RevisionDeSalidas } from "@/hooks/use-revision-de-salidas";
import { Loader2, Undo2 } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

const DESHACER = button({ variant: "secondary", className: "rounded-xl" });

export default function CtpSalidasDecididas({
  datos: d,
  revision,
  bloqueado,
}: {
  datos: RespuestaPendientes;
  revision: RevisionDeSalidas;
  bloqueado: boolean;
}) {
  const contestadas = d.contestadas ?? [];
  if (d.reemplazados.length === 0 && contestadas.length === 0 && d.sinGuia.length === 0 && d.registrados.length === 0) return null;
  const registrados = new Set(d.registrados.map((r) => r.anexoId));
  const ocupado = bloqueado || revision.enviando != null;

  return (
    <ul aria-label="Lo que ya quedó decidido" className="space-y-1 text-xs text-[var(--text-tertiary)]">
      {d.reemplazados.map((x) => {
        /* Con el papel que vale ya en Despacho (en la misma guía), deshacer pide anular antes. */
        const sePuede = x.marcado && !(registrados.has(x.por) && !x.porGtf);
        const clave = `deshacer:${x.anexoId}`;
        return (
          <li key={x.anexoId} className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1">
              {x.porGtf
                ? `El Anexo ${x.numero || "s/n"} de la ${x.gtf} no es de esa guía: es el de la ${x.porGtf}. No se borra ni se registra.`
                : `El Anexo ${x.numero || "s/n"} de la ${x.gtf} queda reemplazado por el ${x.porNumero || "más nuevo"}: no se borra ni se registra.`}
            </span>
            {sePuede && (
              <button
                type="button"
                disabled={ocupado}
                onClick={() => void revision.enviar(clave, { accion: "deshacer", anexoId: x.anexoId })}
                title="Vuelve a dejar este Anexo 04 como papel de su guía (si la guía queda con dos papeles, te pregunta cuál viajó)"
                className={DESHACER}
              >
                {revision.enviando === clave ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <Undo2 aria-hidden className="h-4 w-4" />}
                Deshacer
              </button>
            )}
            {revision.error?.clave === clave && <span role="alert" className="w-full text-sm text-[var(--data-error-ink)]">{revision.error.mensaje}</span>}
          </li>
        );
      })}
      {contestadas.map((c) => (
        <li key={c.clave} className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1">
            {c.gtfs.join(" y ")}: contestaste que el mismo Anexo 04 salió dos veces (guías distintas).
          </span>
          <button
            type="button"
            disabled={ocupado}
            onClick={() => void revision.enviar(c.clave, { accion: "responder", clave: c.clave, valor: null })}
            title={`Vuelve a preguntar: ${c.pregunta}`}
            className={DESHACER}
          >
            {revision.enviando === c.clave ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <Undo2 aria-hidden className="h-4 w-4" />}
            Cambiar
          </button>
          {revision.error?.clave === c.clave && <span role="alert" className="w-full text-sm text-[var(--data-error-ink)]">{revision.error.mensaje}</span>}
        </li>
      ))}
      {d.sinGuia.length > 0 && (
        <li>{plural(d.sinGuia.length, "anexo sin N° de guía", "anexos sin N° de guía")}: no hay salida que registrar.</li>
      )}
      {d.registrados.length > 0 && (
        <li>{plural(d.registrados.length, "guía ya está", "guías ya están")} en Despacho desde su anexo.</li>
      )}
    </ul>
  );
}
