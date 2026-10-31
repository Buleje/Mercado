/**
 * RichText — renderiza texto plano con markdown-lite a JSX SEGURO (Brandon
 * 2026-06-28, audit #4). Soporta listas (- / * / 1.), links [texto](url) y
 * **negrita**. NO usa dangerouslySetInnerHTML → cero superficie XSS: cada token
 * se vuelve un elemento React y los href se validan (solo http/https/relativo/
 * mailto/tel). Para los textos largos del storefront (Sobre nosotros, FAQ,
 * imagen+texto). El dueño escribe en lenguaje simple; acá se interpreta.
 *
 * Server-safe (sin hooks/estado). Si el texto no tiene markup, sale igual.
 */
import type { ReactNode } from "react";

const SAFE_HREF = /^(https?:\/\/|\/|mailto:|tel:)/i;

/** Parsea inline: [texto](url) y **negrita** → nodos React seguros. */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  // Primero links, luego negrita dentro de los segmentos de texto plano.
  const linkRe = /\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  const pushPlain = (s: string, k: string) => {
    // **negrita** dentro del texto plano
    const parts = s.split(/(\*\*[^*]+\*\*)/g);
    parts.forEach((p, j) => {
      if (!p) return;
      if (/^\*\*[^*]+\*\*$/.test(p)) out.push(<strong key={`${k}-b${j}`}>{p.slice(2, -2)}</strong>);
      else out.push(<span key={`${k}-t${j}`}>{p}</span>);
    });
  };
  while ((m = linkRe.exec(text)) !== null) {
    if (m.index > last) pushPlain(text.slice(last, m.index), `${keyBase}-p${i}`);
    const label = m[1];
    const url = m[2];
    if (SAFE_HREF.test(url)) {
      const ext = /^https?:\/\//i.test(url);
      out.push(
        <a key={`${keyBase}-l${i}`} href={url} target={ext ? "_blank" : undefined} rel={ext ? "noopener noreferrer" : undefined} className="font-semibold underline" style={{ color: "var(--tenant-primary, var(--accent))" }}>
          {label}
        </a>,
      );
    } else {
      // href inseguro → render solo el label como texto (sin link).
      pushPlain(label, `${keyBase}-u${i}`);
    }
    last = m.index + m[0].length;
    i++;
  }
  if (last < text.length) pushPlain(text.slice(last), `${keyBase}-pf`);
  return out;
}

export default function RichText({ text, className }: { text: string; className?: string }) {
  const lines = (text || "").split("\n");
  const blocks: ReactNode[] = [];
  let listBuf: { ordered: boolean; items: string[] } | null = null;
  const flush = (k: number) => {
    if (!listBuf) return;
    const Tag = listBuf.ordered ? "ol" : "ul";
    blocks.push(
      <Tag key={`list-${k}`} className={listBuf.ordered ? "list-decimal pl-5 space-y-1" : "list-disc pl-5 space-y-1"}>
        {listBuf.items.map((it, j) => <li key={j}>{inline(it, `li-${k}-${j}`)}</li>)}
      </Tag>,
    );
    listBuf = null;
  };
  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const ordered = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (bullet) {
      if (!listBuf || listBuf.ordered) { flush(idx); listBuf = { ordered: false, items: [] }; }
      listBuf.items.push(bullet[1]);
    } else if (ordered) {
      if (!listBuf || !listBuf.ordered) { flush(idx); listBuf = { ordered: true, items: [] }; }
      listBuf.items.push(ordered[1]);
    } else {
      flush(idx);
      if (line.trim()) blocks.push(<p key={`p-${idx}`}>{inline(line, `p-${idx}`)}</p>);
    }
  });
  flush(lines.length);

  return <div className={className}>{blocks}</div>;
}
