/**
 * El codemod `tabla-estilo` (ADR-489, Brandon 2026-10-11: «un solo estilo de
 * tabla para todos»): saca de th/td/tr lo que ya pone `DataTable` y deja lo que
 * es de la celda (alineación, ancho, nowrap, sticky, el color de un monto, lo
 * que lleva `!`).
 */
import { describe, it, expect } from "vitest";
import { transformar } from "../scripts/codemods/tabla-estilo.mjs";

const tabla = (cabecera: string, cuerpo: string, clase = "w-full text-sm") =>
  `import { DataTable } from "@buleje/design-system";
export function T(){return <DataTable className="${clase}"><thead>${cabecera}</thead><tbody>${cuerpo}</tbody></DataTable>}`;

describe("tabla-estilo", () => {
  it("cabecera: se va letra, padding, peso, mayúsculas, color y raya; quedan alineación y ancho", () => {
    const r = transformar(
      tabla(
        `<tr className="border-b border-[var(--rule-base)] text-left text-xs uppercase tracking-wide text-[var(--text-tertiary)]"><th className="w-24 px-3 py-2 text-right font-bold whitespace-nowrap">Monto</th></tr>`,
        `<tr><td>1</td></tr>`,
      ),
      "components/admin/x/T.tsx",
    );
    expect(r.texto).toContain(`<th className="w-24 text-right whitespace-nowrap">Monto</th>`);
    expect(r.texto).toContain("<thead><tr>");
    expect(r.texto).toContain(`<DataTable className="w-full">`);
  });

  it("celda: se van letra, padding y el negro de la tabla; quedan peso, mono, el rojo del monto y lo que lleva «!»", () => {
    const r = transformar(
      tabla(`<tr><th>A</th></tr>`, `<tr className="border-b border-[var(--rule-soft)] hover:bg-[var(--surface-sunken)]"><td className="px-2! py-2 text-xs font-bold font-mono text-[var(--data-error-ink)] text-[var(--text-primary)]">-5</td></tr>`),
      "components/admin/x/T.tsx",
    );
    expect(r.texto).toContain(`<td className="px-2! font-bold font-mono text-[var(--data-error-ink)]">`);
    expect(r.texto).toContain("<tbody><tr>");
  });

  it("una raya lateral conserva su color (sin él sale en currentColor)", () => {
    const r = transformar(tabla(`<tr><th className="border-l border-[var(--rule-base)] px-3">A</th></tr>`, `<tr><td>1</td></tr>`), "components/admin/x/T.tsx");
    expect(r.texto).toContain(`<th className="border-l border-[var(--rule-base)]">`);
  });

  it("template y constante: limpia lo fijo y respeta lo de ${…}", () => {
    const t = `const TD = "px-3 py-2 text-right tabular-nums";
${tabla(`<tr><th>A</th></tr>`, `<tr><td className={\`\${TD} text-xs \${rojo ? "text-[var(--data-error-ink)]" : ""}\`}>1</td></tr>`)}`;
    const r = transformar(t, "components/admin/x/T.tsx");
    expect(r.texto).toContain(`const TD = "text-right tabular-nums"`);
    expect(r.texto).toContain('className={`${TD} ${rojo ? "text-[var(--data-error-ink)]" : ""}`}');
  });

  it("no toca: la grilla del cubicador, Mi Plata (otro carril) ni un archivo con <table> a mano", () => {
    const t = tabla(`<tr><th className="px-3 text-xs">A</th></tr>`, `<tr><td className="px-3">1</td></tr>`);
    expect(transformar(t, "components/admin/forestal/CubicadorMadera.tsx").cambios).toBe(0);
    expect(transformar(t, "components/admin/unified/finanzas/X.tsx").cambios).toBe(0);
    const aMano = transformar(`export const X = () => <table className="w-full"><tbody><tr><td className="px-3">1</td></tr></tbody></table>;`, "components/admin/x/T.tsx");
    expect(aMano).toMatchObject({ cambios: 0, revisar: 1 });
  });

  it("el className de DataTable: se van los pisotones de la cabecera, queda la densidad «COMPACTA»", () => {
    const r = transformar(tabla(`<tr><th>A</th></tr>`, `<tr><td>1</td></tr>`, "w-full text-xs [&_thead_th]:text-sm! [&_thead_th]:normal-case [&_thead_th]:px-2!"), "components/admin/x/T.tsx");
    expect(r.texto).toContain(`<DataTable className="w-full [&_thead_th]:px-2!">`);
  });
});
