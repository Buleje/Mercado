"use client";

import { ArrowRight, Copy, FolderX, PencilLine, Sparkles, Trash2, type LucideIcon } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import type { Propuesta, TipoPropuesta } from "@/lib/documentos/ordenar-archivo";

/**
 * Un bloque del modal «Ordenar mi Archivo» (Nombres, Basura, Carpetas vacías,
 * Repetidos, Lo que sugirió la IA): cada fila «antes → después» con su casilla.
 */

export const SECCIONES: Record<TipoPropuesta, { titulo: string; icono: LucideIcon; que: string; ejemplo: string }> = {
  nombre: {
    titulo: "Nombres claros",
    icono: PencilLine,
    que: "Quita la ruta pegada de una subida vieja, los guiones bajos, la extensión repetida y las MAYÚSCULAS sostenidas (las siglas como GTF, DNI o RUC quedan). A los nombres de cámara les pone lo que el análisis ya leyó.",
    ejemplo: "«CCNN CHIVIS/denuncia_extravio_gtf.docx» → «Denuncia extravio GTF.docx»",
  },
  basura: {
    titulo: "Basura",
    icono: Trash2,
    que: "Archivos temporales de Word y de Windows, o vacíos. Van a la papelera: se pueden recuperar.",
    ejemplo: "«~$rta de emision.docx» (162 bytes) lo deja Word al abrir un archivo",
  },
  carpeta: {
    titulo: "Carpetas vacías",
    icono: FolderX,
    que: "Sin papeles, sin subcarpetas y sin nada en la papelera. Se borran (las carpetas no van a la papelera): «Deshacer» las vuelve a crear mientras esta ventana siga abierta. Nunca las que crea el sistema (Cámaras, WhatsApp, Guías, Libro TH, Equipo, Terceros, Trámites) ni las de hoy.",
    ejemplo: "«09» adentro de «CCNN Santa Rosa», que quedó vacía",
  },
  duplicado: {
    titulo: "Repetidos",
    icono: Copy,
    que: "El mismo archivo, byte a byte, y que ve la misma gente. Queda el más nuevo (o el que está atado a una guía o a un cliente, o el que tiene vencimiento); los demás van a la papelera.",
    ejemplo: "«GTF 3.pdf» subido dos veces al importar la carpeta",
  },
  ia: {
    titulo: "Lo que sugirió la IA",
    icono: Sparkles,
    que: "La carpeta o el vencimiento que la IA leyó al subir el papel. Sólo a lo que está suelto o sin vencimiento.",
    ejemplo: "«Factura ACME.pdf» → mover a «Facturas» · vence el 15/01/2027",
  },
};

/** Lo que sale del Archivo: los papeles a la papelera, las carpetas se borran. */
const SE_VA = new Set<TipoPropuesta>(["basura", "duplicado", "carpeta"]);

export function SeccionPropuestas({
  tipo,
  propuestas,
  elegidas,
  onAlternar,
  onMarcarTodas,
  deshabilitada,
}: {
  tipo: TipoPropuesta;
  propuestas: readonly Propuesta[];
  elegidas: ReadonlySet<string>;
  onAlternar: (id: string) => void;
  onMarcarTodas: (tipo: TipoPropuesta, marcar: boolean) => void;
  deshabilitada?: boolean;
}) {
  const s = SECCIONES[tipo];
  const Icono = s.icono;
  const marcadas = propuestas.filter((p) => elegidas.has(p.id)).length;
  const todas = marcadas === propuestas.length;
  return (
    <section aria-labelledby={`orden-${tipo}`} className="rounded-xl border border-[var(--rule-base)]">
      <header className="flex flex-wrap items-center gap-2 border-b border-[var(--rule-soft)] px-3 py-2">
        <Icono className="h-5 w-5 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
        <CardTitle as="h3" id={`orden-${tipo}`} className="text-sm font-bold text-[var(--text-primary)]">
          {s.titulo}
        </CardTitle>
        <span className="rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-xs font-bold tabular-nums text-[var(--text-secondary)]">
          {marcadas === propuestas.length ? propuestas.length : `${marcadas} de ${propuestas.length}`}
        </span>
        <InfoTip title={s.titulo} what={s.que} example={s.ejemplo} side="bottom" />
        <button
          type="button"
          disabled={deshabilitada}
          onClick={() => onMarcarTodas(tipo, !todas)}
          className="ml-auto min-h-11 rounded-lg px-2 text-sm font-semibold text-[var(--accent-ink)] hover:bg-[var(--surface-sunken)] disabled:opacity-60 dark:text-[var(--accent)]"
        >
          {todas ? "Quitar todas" : "Marcar todas"}
        </button>
      </header>
      <ul className="divide-y divide-[var(--rule-soft)]">
        {propuestas.map((p) => (
          <li key={p.id}>
            <label className={cn("flex min-h-11 cursor-pointer items-start gap-3 px-3 py-2.5", deshabilitada && "cursor-default")}>
              <input
                type="checkbox"
                checked={elegidas.has(p.id)}
                disabled={deshabilitada}
                onChange={() => onAlternar(p.id)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent)]"
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm [overflow-wrap:anywhere]">
                  <span className={cn("text-[var(--text-secondary)]", SE_VA.has(p.tipo) && "line-through decoration-[var(--text-tertiary)]")}>
                    {p.antes}
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-label="pasa a" />
                  <span
                    className={cn(
                      "font-semibold",
                      SE_VA.has(p.tipo) ? "text-[var(--data-error-ink)]" : "text-[var(--text-primary)]",
                    )}
                  >
                    {p.despues}
                  </span>
                </span>
                <span className="mt-0.5 block text-xs text-[var(--text-tertiary)] [overflow-wrap:anywhere]">
                  {p.donde} · {p.motivo}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
