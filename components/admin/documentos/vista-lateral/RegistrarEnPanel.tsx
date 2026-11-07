"use client";

/**
 * Repaso de «Por registrar» en el panel (31-10, Brandon): el código del papel grande para copiarlo,
 * «Ya lo anoté» lo marca y pasa al siguiente, «Saltar» pasa sin marcar. Sin ventanas: la fila entera
 * de pendientes se pasa con la vista al costado. Enter = «Ya lo anoté» cuando el foco no está en un campo.
 */

import { useEffect, useState } from "react";
import { Check, Copy, Hash, Printer, SkipForward, X } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { codigoFisicoPendiente, formatoCodigoDocumento } from "@/lib/documentos/codigo-documento";
import { abrirEtiquetas } from "@/lib/documentos/etiquetas-evento";
import type { DbDocument } from "@/lib/types/documents";
import type { ModeloArchivo } from "../archivo/use-archivo";
import { marcarRegistradoConAviso } from "../menu-registrado";

const SALIR = button({ variant: "ghost", className: "shrink-0 gap-1 px-2" });
const PRIMARIO = button({ variant: "primary", className: "flex-1 gap-1.5" });
const SECUNDARIO = button({ variant: "secondary", className: "flex-1 gap-1.5" });

export const hechosTexto = (n: number) => (n === 1 ? "1 hecho" : `${n} hechos`);
export const anotasteTexto = (n: number) => (n === 1 ? "anotaste 1 papel" : `anotaste ${n} papeles`);

/** «Registrando 3 de 139 · 2 hechos», Terminar e imprimir las etiquetas de los que faltan. */
export function CabeceraRegistro({ arch }: { arch: ModeloArchivo }) {
  const { panelPrevia: p, registroHechos, setRepasoRegistro, displayDocs } = arch;
  const ids = displayDocs.filter(codigoFisicoPendiente).map((d) => d.id);
  return (
    <div className="space-y-2 rounded-lg bg-[var(--data-warning-100)] px-2 py-1.5 text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/15">
      <div className="flex items-center gap-2">
        <Hash className="h-4 w-4 shrink-0" aria-hidden />
        <p className="min-w-0 flex-1 text-sm font-bold">
          Registrando{p.posicion && <span data-qa="repaso-posicion"> {p.posicion.actual} de {p.posicion.total}</span>}
          <span data-qa="repaso-hechos"> · {hechosTexto(registroHechos)}</span>
        </p>
        <button type="button" onClick={() => setRepasoRegistro(false)} className={SALIR} title="Terminar el repaso">
          <X className="h-4 w-4" /> Terminar
        </button>
      </div>
      {ids.length > 0 && (
        <button type="button" onClick={() => abrirEtiquetas(ids)} className={button({ variant: "ghost", className: "gap-1.5 px-2 text-sm text-[var(--data-warning-ink)] hover:bg-transparent hover:underline" })} data-qa="repaso-etiquetas">
          <Printer className="h-4 w-4" aria-hidden /> Imprimir etiquetas de estos {ids.length}
        </button>
      )}
    </div>
  );
}

export default function RegistrarEnPanel({ arch, doc }: { arch: ModeloArchivo; doc: DbDocument }) {
  const { panelPrevia: p, marcarCodigoFisico } = arch;
  const codigo = formatoCodigoDocumento(doc.codigo);
  const [copiado, setCopiado] = useState(false);
  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(false), 1500);
    return () => clearTimeout(t);
  }, [copiado]);

  const copiar = () => {
    if (!codigo) return;
    navigator.clipboard?.writeText(codigo).then(() => setCopiado(true)).catch((err) => console.warn("[documentos] no pude copiar el código", err));
  };
  const anotar = () => {
    marcarRegistradoConAviso(doc, marcarCodigoFisico, true);
    p.avanzarRegistro(true);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("input, textarea, select, button, a, [contenteditable='true'], [role='dialog'], [role='menu']")) return;
      e.preventDefault();
      anotar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // `anotar` se rehace por papel: el panel remonta por doc.id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

  if (!codigo || !codigoFisicoPendiente(doc)) {
    return <button type="button" onClick={() => p.avanzarRegistro(false)} className={SECUNDARIO}><SkipForward className="h-4 w-4" /> Saltar</button>;
  }
  return (
    <div className="space-y-2" data-qa="registrar-en-panel">
      <button
        type="button"
        onClick={copiar}
        title="Clic para copiar el código"
        aria-label={`Código ${codigo}. Copiar`}
        data-qa="codigo-grande"
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--data-warning-500)] bg-[var(--data-warning-100)] px-3 py-4 font-mono text-3xl font-bold tabular-nums text-[var(--data-warning-ink)] hover:brightness-95 dark:bg-[var(--data-warning-500)]/15"
      >
        {copiado ? <Check className="h-6 w-6" aria-hidden /> : <Copy className="h-6 w-6" aria-hidden />}
        {copiado ? "Copiado" : codigo}
      </button>
      <div className="flex gap-2">
        <button type="button" onClick={anotar} className={PRIMARIO} data-qa="ya-lo-anote">
          <Check className="h-4 w-4" aria-hidden /> Ya lo anoté
        </button>
        <button type="button" onClick={() => p.avanzarRegistro(false)} className={SECUNDARIO} data-qa="saltar-registro">
          <SkipForward className="h-4 w-4" aria-hidden /> Saltar
        </button>
      </div>
    </div>
  );
}
