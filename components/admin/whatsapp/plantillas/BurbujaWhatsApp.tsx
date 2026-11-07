import { cn } from "@/lib/utils";

/** Parte el texto en trozos normales y `{variables}`. */
export function partesConVariables(texto: string): { t: string; variable: boolean }[] {
  return texto
    .split(/(\{[^}]+\})/g)
    .filter(Boolean)
    .map((t) => ({ t, variable: t.startsWith("{") && t.endsWith("}") }));
}

/** Las variables de un texto, sin repetir: «Hola {nombre}, S/{monto}» → [nombre, monto]. */
export function variablesDe(texto: string): string[] {
  return [...new Set([...texto.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))];
}

/** El texto con sus `{variables}` marcadas (lo que cambias antes de mandar). */
export function TextoConVariables({ texto, className }: { texto: string; className?: string }) {
  return (
    <span className={className}>
      {partesConVariables(texto).map((p, i) =>
        p.variable ? (
          <mark key={i} className="rounded bg-[var(--data-warning-500)]/15 px-0.5 font-semibold text-[var(--data-warning-ink)]">
            {p.t}
          </mark>
        ) : (
          <span key={i}>{p.t}</span>
        ),
      )}
    </span>
  );
}

/**
 * Vista previa tipo WhatsApp: el mensaje como sale, en su globo, sobre el fondo
 * del chat. Decorativo salvo el texto: el globo es sólo la forma.
 */
export function BurbujaWhatsApp({ texto, className }: { texto: string; className?: string }) {
  return (
    <div className={cn("rounded-xl bg-[var(--surface-sunken)] p-3", className)}>
      <div className="ml-auto w-fit max-w-[85%] rounded-xl rounded-tr-sm border border-[var(--data-success-500)]/25 bg-[var(--data-success-500)]/12 px-3 py-2 text-sm leading-relaxed text-[var(--text-primary)] shadow-sm">
        {texto.trim() ? (
          <TextoConVariables texto={texto} className="whitespace-pre-wrap break-words" />
        ) : (
          <span className="text-[var(--text-secondary)]">Tu mensaje aparece acá.</span>
        )}
      </div>
    </div>
  );
}
