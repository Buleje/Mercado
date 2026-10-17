import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/components/cms/registro-bloques", () => ({
  BLOQUES_POR_TIPO: {
    hero: ({ title }: { title?: string }) => <section data-tipo="hero">{title}</section>,
    cta: ({ title }: { title?: string }) => <section data-tipo="cta">{title}</section>,
  },
}));

import RenderBloques from "@/components/cms/RenderBloques";

const html = (bloques: Parameters<typeof RenderBloques>[0]["bloques"]) =>
  renderToStaticMarkup(<RenderBloques bloques={bloques} />);

describe("RenderBloques", () => {
  it("dibuja sólo los visibles y en orden", () => {
    const out = html([
      { id: "b", type: "cta", order: 2, visible: true, props: { title: "segundo" } },
      { id: "a", type: "hero", order: 1, visible: true, props: { title: "primero" } },
      { id: "c", type: "hero", order: 3, visible: false, props: { title: "oculto" } },
    ]);
    expect(out.indexOf("primero")).toBeGreaterThan(-1);
    expect(out.indexOf("primero")).toBeLessThan(out.indexOf("segundo"));
    expect(out).not.toContain("oculto");
  });

  it("omite un tipo sin componente en vez de tumbar la página", () => {
    const out = html([
      { id: "x", type: "no-existe", order: 1, visible: true, props: {} },
      { id: "y", type: "hero", order: 2, visible: true, props: { title: "ok" } },
    ]);
    expect(out).toContain("ok");
    expect(out).not.toContain("no-existe");
  });

  it("sin bloques no dibuja nada", () => {
    expect(html([])).toBe("");
  });

  it("no reordena el arreglo que recibe", () => {
    const entrada = [
      { id: "b", type: "cta", order: 2, visible: true, props: {} },
      { id: "a", type: "hero", order: 1, visible: true, props: {} },
    ];
    html(entrada);
    expect(entrada.map((b) => b.id)).toEqual(["b", "a"]);
  });
});
