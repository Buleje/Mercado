/**
 * Piezas del plan impreso (ADR-497): sección numerada, párrafo con rótulo,
 * pares dato-valor y listas. Sin interactividad: se dibujan igual en la vista
 * previa del modal y en la hoja que sale por la impresora.
 */
import type { ReactNode } from "react";
import { BlockTitle, CardTitle } from "@buleje/design-system";
import { etiquetaDia } from "@/lib/rrhh/fechas";

/** `"jueves 16/10/2026"`: en un papel que se entrega, el año siempre va. */
export function fechaDoc(key: string): string {
  return key ? `${etiquetaDia(key, key)}/${key.slice(0, 4)}` : "—";
}

export function SeccionDoc({ numero, titulo, children }: { numero: number; titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-t border-[var(--rule-base)] pt-4">
      <CardTitle as="h2" className="break-after-avoid">
        {numero}. {titulo}
      </CardTitle>
      {children}
    </section>
  );
}

export function ParrafoDoc({ rotulo, texto }: { rotulo: string; texto: string }) {
  if (!texto.trim()) return null;
  return (
    <div className="break-inside-avoid space-y-0.5">
      <BlockTitle as="h3">{rotulo}</BlockTitle>
      <p className="text-sm whitespace-pre-line text-[var(--text-primary)]">{texto}</p>
    </div>
  );
}

/** Pares rótulo-valor; los vacíos no se imprimen. */
export function DatosDoc({ filas }: { filas: ReadonlyArray<readonly [string, string]> }) {
  const llenas = filas.filter(([, v]) => v.trim() && v !== "—");
  if (llenas.length === 0) return null;
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2 print:grid-cols-2">
      {llenas.map(([r, v]) => (
        <div key={r} className="flex min-w-0 gap-2">
          <dt className="shrink-0 text-[var(--text-secondary)]">{r}:</dt>
          <dd className="min-w-0 text-[var(--text-primary)]">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ListaDoc({ items, numerada = false }: { items: readonly ReactNode[]; numerada?: boolean }) {
  if (items.length === 0) return null;
  const clases = "space-y-0.5 pl-5 text-sm text-[var(--text-primary)]";
  const filas = items.map((it, i) => <li key={i}>{it}</li>);
  return numerada ? <ol className={`list-decimal ${clases}`}>{filas}</ol> : <ul className={`list-disc ${clases}`}>{filas}</ul>;
}

export function NotaDoc({ children }: { children: ReactNode }) {
  return <span className="block text-sm text-[var(--text-secondary)]">{children}</span>;
}
