import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { PANTALLAS_SUPERADMIN, buscarPantallas } from "@/components/superadmin/command-palette-pantallas";

/** Páginas reales de app/superadmin: sin [param], sin login y sin las que sólo redirigen. */
function paginasReales(dir = join(process.cwd(), "app/superadmin"), ruta = "/superadmin"): string[] {
  const out: string[] = [];
  for (const nombre of readdirSync(dir)) {
    const abs = join(dir, nombre);
    if (statSync(abs).isDirectory()) {
      if (nombre.startsWith("[") || nombre.startsWith("(") || nombre.startsWith("_")) continue;
      out.push(...paginasReales(abs, `${ruta}/${nombre}`));
    } else if (nombre === "page.tsx") {
      const src = readFileSync(abs, "utf8");
      if (ruta === "/superadmin/login" || /\bredirect\(/.test(src)) continue;
      out.push(ruta);
    }
  }
  return out;
}

describe("Ctrl+K del superadmin — todas las pantallas", () => {
  const hrefs = PANTALLAS_SUPERADMIN.map((p) => p.href);
  const paginas = paginasReales();

  it("cada página real tiene su entrada (una pantalla nueva sin entrada pone esto rojo)", () => {
    expect(paginas.length).toBeGreaterThanOrEqual(50);
    expect(paginas.filter((p) => !hrefs.includes(p))).toEqual([]);
  });

  it("cada entrada apunta a una página que existe y no se repite", () => {
    expect(hrefs.filter((h) => !paginas.includes(h))).toEqual([]);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("encuentra por nombre, módulo o palabra, sin tildes y con varias palabras", () => {
    expect(buscarPantallas("rescate")[0]?.href).toBe("/superadmin/rescue");
    expect(buscarPantallas("errores negocio").map((p) => p.href)).toContain("/superadmin/tenant-errors");
    expect(buscarPantallas("auditoria").map((p) => p.href)).toContain("/superadmin/audit-log");
    expect(buscarPantallas("piezas a medida")[0]?.href).toBe("/superadmin/specializations");
    expect(buscarPantallas("zzzz")).toEqual([]);
  });

  it("el nombre que empieza igual va primero", () => {
    expect(buscarPantallas("uso")[0]?.label.toLowerCase().startsWith("uso")).toBe(true);
  });
});
