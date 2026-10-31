/**
 * «Documento GTF» — los casilleros de la guía como una hoja en miniatura: un
 * anillo con cuánto está lleno y, por sección del formato, una fila de celdas
 * (llena = tinta de marca, vacía = punteada). Abrir una sección muestra sus
 * casilleros; vacío se dibuja vacío (ADR-350) y lo tipeado a mano se ve
 * distinto de lo que dice el papel (ADR-392).
 */

import { ChevronRight, FileText } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { SeccionFicha } from "@/lib/forestal/guia-ficha";
import { formatDateNumeric } from "@/lib/format";
import { BOTON_BLOQUE, BloqueFicha } from "./comun";

function Anillo({ llenos, total }: { llenos: number; total: number }) {
  const pct = total > 0 ? llenos / total : 0;
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-20 w-20 shrink-0" role="img" aria-label={`${llenos} de ${total} casilleros llenos`}>
      <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="36" cy="36" r={r} fill="none" stroke="var(--surface-sunken)" strokeWidth="8" />
        <circle
          cx="36"
          cy="36"
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          className="transition-[stroke-dasharray] duration-[var(--motion-deliberate)]"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center leading-none">
        <span className="font-mono text-base font-bold tabular-nums text-[var(--text-primary)]">
          {llenos}
          <span className="text-xs font-semibold text-[var(--text-tertiary)]">/{total}</span>
        </span>
      </div>
    </div>
  );
}

export default function BloqueDocumentoGtf({
  secciones,
  llenos,
  total,
  onVerDocumento,
  ocupado,
  indice,
}: {
  secciones: SeccionFicha[];
  llenos: number;
  total: number;
  onVerDocumento: () => void;
  ocupado: boolean;
  indice: number;
}) {
  const faltan = total - llenos;
  return (
    <BloqueFicha
      titulo="Documento GTF"
      plegable
      icono={FileText}
      indice={indice}
      info={
        <InfoTip
          title="Casilleros de la guía"
          what="Cada sección del formato con sus casilleros: la celda llena tiene dato, la punteada está vacía. Abre una sección para ver qué dice cada casillero."
          affects="Los vacíos se completan editando el ingreso. Recepcionar no los exige; emitir la guía de salida sí."
          example="«a mano» = lo escribió una persona, no vino del papel."
        />
      }
      extra={
        <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]" title="Casilleros llenos">
          {llenos}/{total}
        </span>
      }
      pie={
        <button type="button" onClick={onVerDocumento} disabled={ocupado} className={BOTON_BLOQUE}>
          <FileText className="h-4 w-4" aria-hidden /> Ver el documento
        </button>
      }
    >
      <div className="mb-3 flex items-center gap-3">
        <Anillo llenos={llenos} total={total} />
        <div className="min-w-0 text-sm">
          <p className="font-semibold text-[var(--text-primary)]">{faltan === 0 ? "Completo" : `Faltan ${faltan} casilleros`}</p>
          <p className="text-[var(--text-tertiary)]">{secciones.length} secciones del formato</p>
        </div>
      </div>

      <div className="space-y-1">
        {secciones.map((s) => {
          const n = s.campos.filter((c) => c.valor != null).length;
          return (
            <details key={s.titulo} className="group rounded-lg open:bg-[var(--surface-sunken)]/60">
              <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-muted)] [&::-webkit-details-marker]:hidden">
                <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-transform group-open:rotate-90" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text-primary)]" title={s.rango}>
                  {s.titulo}
                </span>
                <span aria-hidden className="hidden gap-0.5 sm:flex">
                  {s.campos.map((c) => (
                    <span
                      key={c.label}
                      className={`h-3 w-2 rounded-[2px] ${
                        c.valor == null
                          ? "border border-dashed border-[var(--text-tertiary)]"
                          : c.manual
                            ? "bg-[var(--data-info-500)]"
                            : "bg-[var(--accent)]"
                      }`}
                    />
                  ))}
                </span>
                <span className={`w-10 shrink-0 text-right font-mono text-xs tabular-nums ${n === s.campos.length ? "text-[var(--text-secondary)]" : "font-bold text-[var(--data-warning-ink)]"}`}>
                  {n}/{s.campos.length}
                </span>
              </summary>
              <dl className="grid gap-y-2 px-2 pb-3 pt-1">
                {s.campos.map((c) => (
                  <div key={c.label} className="min-w-0">
                    <dt className="text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                      {c.casillero && <span className="mr-1 font-mono">({c.casillero})</span>}
                      {c.label}
                    </dt>
                    <dd
                      className={`break-words text-sm ${
                        c.manual ? "font-medium text-[var(--data-info-ink)]" : c.valor ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]"
                      }`}
                      title={
                        c.manual
                          ? `Completado a mano${c.manual.por ? ` por ${c.manual.por}` : ""}${c.manual.el ? ` el ${formatDateNumeric(c.manual.el)}` : ""}`
                          : undefined
                      }
                    >
                      {c.valor ?? "—"}
                      {c.manual && <span className="ml-1.5 align-middle text-xs font-bold uppercase tracking-[var(--ls-wider)] opacity-70">a mano</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
          );
        })}
      </div>
    </BloqueFicha>
  );
}
