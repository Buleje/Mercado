/**
 * ADR-460 · la ficha del salón (`extensiones/pagina-bodega-buleje-test/`):
 * · `productoDeLaUrl` — sólo lo del salón; la bodega de `main` no tiene ficha acá.
 * · `rutinaDe` — misma línea primero (lo que COMPLETA antes que lo parecido),
 *   nunca el mismo producto ni un servicio.
 * · `sugeridos` — para «no lo encontramos»: lo rebajado primero.
 * · Tema: el texto con el acento en oscuro pasa a la tinta (≥4,5) sin bajar el
 *   blanco sobre el acento (≥4,5); los selectores no agarran `background-color`.
 */
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { ProductoSalon } from "@/extensiones/pagina-bodega-buleje-test/datos";
import { productoDeLaUrl, rutinaDe, sugeridos } from "@/extensiones/pagina-bodega-buleje-test/rutina";
import { CSS_GLOBAL, TEXTO_CON_ACENTO, TEXTO_EN_LINEA_CON_ACENTO } from "@/extensiones/pagina-bodega-buleje-test/tema";

const p = (id: number, nombre: string, x: Partial<ProductoSalon> = {}): ProductoSalon => ({
  id,
  nombre,
  marca: null,
  categoria: "Shampoo",
  precio: 10,
  antes: null,
  descuento: null,
  imagen: "",
  descripcion: null,
  stock: 10,
  unidad: "und",
  etiqueta: null,
  duracion: null,
  href: `/t/main/tienda/${id}`,
  ...x,
});

const shampoo = p(1, "Shampoo Reparación Intensa 300 ml", { marca: "Buleje Pro" });
const acond = p(2, "Acondicionador Reparación Intensa 250 ml", { marca: "Buleje Pro", categoria: "Acondicionador" });
const mascarilla = p(3, "Mascarilla Reconstructora 500 g", { marca: "Buleje Pro", categoria: "Tratamientos", descuento: 30 });
const otroShampoo = p(4, "Shampoo Nutritivo Sacha Inchi 400 ml", { marca: "Selva Botánica", etiqueta: "Favorito" });
const shampooPro = p(5, "Shampoo Matizador Pro 300 ml", { marca: "Buleje Pro", descuento: 20 });
const alisado = p(6, "Alisado con keratina", { categoria: "Servicios de salón", duracion: "3 h", stock: null });
const todos = [shampoo, acond, mascarilla, otroShampoo, shampooPro, alisado];

describe("productoDeLaUrl", () => {
  it("encuentra por el slug del nombre (sin tildes ni mayúsculas), también un servicio", () => {
    expect(productoDeLaUrl(todos, "shampoo-reparacion-intensa-300-ml")).toBe(shampoo);
    expect(productoDeLaUrl(todos, "Alisado-con-Keratina")).toBe(alisado);
  });

  it("lo que no es del salón (la bodega), vacío o inventado → null", () => {
    expect(productoDeLaUrl(todos, "arroz-costeno-extra-5kg")).toBeNull();
    expect(productoDeLaUrl(todos, "")).toBeNull();
    expect(productoDeLaUrl(todos, "shampoo")).toBeNull();
  });
});

describe("rutinaDe", () => {
  it("misma línea primero, y dentro de ella lo de OTRA categoría antes que otro shampoo", () => {
    expect(rutinaDe(todos, shampoo).map((x) => x.id)).toEqual([2, 3, 5, 4]);
  });

  it("nunca el mismo producto ni un servicio, y respeta el tope", () => {
    const r = rutinaDe(todos, shampoo, 2);
    expect(r.map((x) => x.id)).toEqual([2, 3]);
    expect(rutinaDe(todos, shampoo).some((x) => x.id === 1 || x.id === 6)).toBe(false);
  });

  it("sin marca: sólo lo de su categoría", () => {
    const suelto = p(9, "Shampoo suelto", {});
    expect(rutinaDe([...todos, suelto], suelto).map((x) => x.id)).toEqual([1, 4, 5]);
  });
});

describe("sugeridos", () => {
  it("rebajados de mayor a menor %, después los que tienen etiqueta del dueño", () => {
    expect(sugeridos(todos).map((x) => x.id)).toEqual([3, 5, 4]);
  });
});

// ─── Tema: contraste medido sobre los mismos colores que se pintan ───────────

function variables(bloque: "claro" | "oscuro"): Record<string, string> {
  const re = bloque === "claro" ? /:root:root\{([^}]*)\}/ : /:root:root\.dark\{([^}]*)\}/;
  const cuerpo = CSS_GLOBAL.match(re)?.[1] ?? "";
  return Object.fromEntries([...cuerpo.matchAll(/(--[\w-]+):(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
}
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

describe("tema del salón · texto con el acento", () => {
  it.each(["claro", "oscuro"] as const)("%s: tinta sobre lienzo y tarjeta ≥ 4,5 y blanco sobre el acento ≥ 4,5", (tema) => {
    const v = variables(tema);
    expect(contraste(v["--accent-ink"], v["--surface-canvas"])).toBeGreaterThanOrEqual(4.5);
    expect(contraste(v["--accent-ink"], v["--surface-raised"])).toBeGreaterThanOrEqual(4.5);
    expect(contraste("#ffffff", v["--accent"])).toBeGreaterThanOrEqual(4.5);
  });

  it("en claro la tinta es el mismo acento (nada cambia de color)", () => {
    const v = variables("claro");
    expect(v["--accent-ink"]).toBe(v["--accent"]);
  });

  it("en oscuro, el acento como texto daría < 4,5: por eso hace falta la tinta", () => {
    const v = variables("oscuro");
    expect(contraste(v["--accent"], v["--surface-canvas"])).toBeLessThan(4.5);
  });

  it("las clases de acento como texto caen en la regla; el hover no se aplica sin hover", () => {
    const sel = `:is(${TEXTO_CON_ACENTO})`;
    const el = (clase: string) => Object.assign(document.createElement("a"), { className: clase });
    expect(el("font-bold text-[var(--accent)]").matches(sel)).toBe(true);
    expect(el("text-primary").matches(sel)).toBe(true);
    expect(el("text-[var(--accent-dark)]").matches(sel)).toBe(true);
    expect(el("text-[var(--text-secondary)] hover:text-[var(--accent)]").matches(sel)).toBe(false);
    expect(el("bg-[var(--accent)] text-white").matches(sel)).toBe(false);
    expect(CSS_GLOBAL).toContain(`:root:root.dark :is(${TEXTO_CON_ACENTO}){color:var(--accent-ink)}`);
  });

  it("el color en línea (servidor y navegador) cae en la regla; un fondo con el acento, no", () => {
    const sel = `:is(${TEXTO_EN_LINEA_CON_ACENTO})`;
    const el = (estilo: string) => {
      const e = document.createElement("p");
      e.setAttribute("style", estilo);
      return e;
    };
    expect(el("color:var(--color-primary-dark, #009690)").matches(sel)).toBe(true);
    expect(el("color: var(--color-primary, #00A0A0);").matches(sel)).toBe(true);
    expect(el("font-size:12px;color:var(--accent)").matches(sel)).toBe(true);
    expect(el("background-color:var(--accent);color:white").matches(sel)).toBe(false);
    expect(el("background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%); color: white").matches(sel)).toBe(false);
    expect(el("border-color:var(--accent)").matches(sel)).toBe(false);
  });
});
