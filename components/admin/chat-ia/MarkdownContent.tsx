import { useMemo } from "react";
import { escapeHtml } from "@/lib/safe-html";

/**
 * Tamaño de cada nivel de título. Clases escritas enteras: Tailwind sólo genera
 * las que encuentra literales en el código (`text-[${n}px]` armado en runtime no
 * existía y los títulos salían del tamaño del párrafo).
 */
const CLASE_TITULO: Record<number, string> = {
  1: "text-lg",
  2: "text-base",
  3: "text-base",
};

function processInline(text: string): string {
  return text
    .replace(
      /\*\*(.+?)\*\*/g,
      '<strong class="font-extrabold text-[var(--text-primary)]">$1</strong>',
    )
    .replace(
      /`([^`]+)`/g,
      '<code class="font-mono text-sm bg-[var(--surface-sunken)] px-1.5 py-0.5 rounded border border-[var(--rule-soft)]">$1</code>',
    );
}

/**
 * Renderer minimalista y seguro de la respuesta. Soporta **negrita**, títulos
 * `#`/`##`/`###`, listas con `-`/`*` o numeradas y `código` en línea. El texto se
 * escapa con `escapeHtml` ANTES de aplicar los reemplazos: no hay XSS posible.
 */
export function MarkdownContent({ text }: { text: string }) {
  const html = useMemo(() => {
    const escaped = escapeHtml(text);
    const blocks = escaped.split(/\n\n+/);
    return blocks
      .map((block) => {
        const hMatch = block.match(/^(#{1,3})\s+(.+)$/m);
        if (hMatch) {
          const level = hMatch[1].length;
          const tag = level === 1 ? "h2" : level === 2 ? "h3" : "h4";
          return `<${tag} class="font-extrabold text-[var(--text-primary)] mt-4 mb-2 ${CLASE_TITULO[level]}">${processInline(hMatch[2])}</${tag}>`;
        }
        if (/^\s*[-*]\s+/.test(block)) {
          const items = block
            .split("\n")
            .filter((l) => /^\s*[-*]\s+/.test(l))
            .map((l) => l.replace(/^\s*[-*]\s+/, ""))
            .map(
              (l) =>
                `<li class="text-base leading-relaxed text-[var(--text-primary)]">${processInline(l)}</li>`,
            )
            .join("");
          return `<ul class="space-y-1.5 list-disc pl-5 my-2">${items}</ul>`;
        }
        if (/^\s*\d+\.\s+/.test(block)) {
          const items = block
            .split("\n")
            .filter((l) => /^\s*\d+\.\s+/.test(l))
            .map((l) => l.replace(/^\s*\d+\.\s+/, ""))
            .map(
              (l) =>
                `<li class="text-base leading-relaxed text-[var(--text-primary)]">${processInline(l)}</li>`,
            )
            .join("");
          return `<ol class="space-y-1.5 list-decimal pl-5 my-2">${items}</ol>`;
        }
        return `<p class="text-base leading-relaxed text-[var(--text-primary)] my-2 whitespace-pre-wrap">${processInline(block)}</p>`;
      })
      .join("");
  }, [text]);

  return (
    <div
      className="prose-sm max-w-none"
      // safe: el texto se escapó antes de concatenar
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
