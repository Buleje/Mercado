/**
 * __tests__/metas-catalogo.test.ts — ADR-488. GUARDIÁN.
 *
 * Las tres listas de categorías y períodos (CHECK de la base en el .sql, Zod y
 * catálogo) son la misma: si una se adelanta, la base rechaza lo que la
 * pantalla ofrece (o al revés). Además: área, unidad y enlace de cada meta, y
 * las reglas del esquema (avance sólo a mano, unidad del catálogo).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CATEGORIAS_META, PERIODOS_META, metaCrearSchema, metaEditarSchema, reglaMetaRota } from "@/lib/admin/metas-tareas";
import {
  AREAS_META,
  CATALOGO_METAS,
  areaDe,
  categoriaDe,
  categoriasDelArea,
  hrefDeMeta,
  normalizarUnidad,
  unidadPermitida,
} from "@/lib/admin/metas-catalogo";

/** Los valores del `IN (...)` del CHECK, tal como está en el archivo de migración. */
function valoresDelCheck(sql: string, nombre: string): string[] {
  const m = sql.match(new RegExp(`ADD CONSTRAINT "${nombre}" CHECK \\("\\w+" IN \\(([^)]*)\\)`));
  if (!m) throw new Error(`no encontré ${nombre}`);
  return [...m[1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]!);
}

describe("catálogo de metas", () => {
  const sql = readFileSync(path.join(process.cwd(), "prisma/migrations/adr-488-metas-por-area.sql"), "utf8");

  it("el CHECK de la base, el Zod y el catálogo tienen las mismas categorías y períodos", () => {
    expect(valoresDelCheck(sql, "AdminGoal_category_chk")).toEqual([...CATEGORIAS_META]);
    expect(valoresDelCheck(sql, "AdminGoal_period_chk")).toEqual([...PERIODOS_META]);
    expect(Object.keys(CATALOGO_METAS).sort()).toEqual([...CATEGORIAS_META].sort());
  });

  it("la lista nueva contiene a la de ADR-415: ninguna meta guardada queda fuera", () => {
    for (const vieja of ["ventas", "pedidos", "clientes", "productos", "caja", "ticket_promedio", "retencion"]) {
      expect(CATEGORIAS_META).toContain(vieja);
    }
    for (const vieja of ["diario", "semanal", "mensual"]) expect(PERIODOS_META).toContain(vieja);
  });

  it("cada categoría dice su área, su unidad y a qué módulo lleva", () => {
    const areas = new Set(AREAS_META.map((a) => a.id));
    for (const c of Object.values(CATALOGO_METAS)) {
      expect(areas.has(c.area)).toBe(true);
      expect(c.queMide.length).toBeGreaterThan(0);
      expect(c.plantilla.target).toBeGreaterThan(0);
      if (c.id !== "manual") expect(c.unidades.length).toBeGreaterThan(0);
      for (const u of c.unidades) expect(u.length).toBeLessThanOrEqual(20); // CHECK AdminGoal_unit_chk
      expect(AREAS_META.find((a) => a.id === c.area)!.color).toMatch(/^var\(--[\w-]+\)$/);
    }
    expect(AREAS_META.every((a) => categoriasDelArea(a.id).length > 0)).toBe(true);
  });

  it("los enlaces van al módulo de origen; a mano y lo desconocido no llevan a ningún lado", () => {
    expect(hrefDeMeta("compras")).toBe("/admin?tab=compras");
    expect(hrefDeMeta("gastos")).toBe("/admin?tab=plata&vista=gastos");
    expect(hrefDeMeta("despacho")).toBe("/admin?tab=ctp-libro-operaciones&vista=despacho");
    expect(hrefDeMeta("loth_tala")).toBe("/admin?tab=loth-libro-operaciones&vista=secciones");
    expect(hrefDeMeta("manual")).toBeNull();
    expect(hrefDeMeta("inventada")).toBeNull();
    expect(categoriaDe("__proto__")).toBeNull();
    expect(areaDe("inventada").id).toBe("manual");
    expect(areaDe("cubicacion").nombre).toBe("Aserradero (CTP)");
  });

  it("unidadPermitida: m³ o PT en producción, sólo S/ en ventas, cualquiera a mano", () => {
    expect(unidadPermitida("produccion", "PT")).toBe(true);
    expect(unidadPermitida("produccion", " m³ ")).toBe(true);
    expect(unidadPermitida("ventas", "m³")).toBe(false);
    expect(unidadPermitida("manual", "paredes")).toBe(true);
  });

  it("la unidad la fija el catálogo; en «a mano» es libre", () => {
    expect(normalizarUnidad("cubicacion")).toBe("m³");
    expect(normalizarUnidad("cubicacion", "PT")).toBe("PT");
    expect(normalizarUnidad("ventas", "m³")).toBe("S/");
    expect(normalizarUnidad("manual", " paredes ")).toBe("paredes");
    expect(normalizarUnidad("manual")).toBe("unid.");
  });
});

describe("reglas del esquema (ADR-488)", () => {
  it("tipear el avance fuera de «a mano» da el issue avance_solo_manual; a mano se acepta", () => {
    const mala = metaCrearSchema.safeParse({ name: "Vender", target: 100, category: "ventas", current: 5 });
    expect(mala.success).toBe(false);
    expect(reglaMetaRota(mala.error?.issues ?? [])).toBe("avance_solo_manual");
    expect(mala.error?.issues[0]?.path).toEqual(["current"]);
    expect(metaCrearSchema.safeParse({ name: "Vender", target: 100, category: "ventas", current: 0 }).success).toBe(true);
    expect(metaCrearSchema.safeParse({ name: "Pintar", target: 10, category: "manual", current: 5, unit: "paredes" }).success).toBe(true);
  });

  it("una unidad ajena a la categoría da unidad_no_valida, también al editar con la categoría", () => {
    const crear = metaCrearSchema.safeParse({ name: "Despachar", target: 10, category: "despacho", unit: "S/" });
    expect(reglaMetaRota(crear.error?.issues ?? [])).toBe("unidad_no_valida");
    const editar = metaEditarSchema.safeParse({ category: "gastos", unit: "kg" });
    expect(reglaMetaRota(editar.error?.issues ?? [])).toBe("unidad_no_valida");
    // Sin categoría en el cuerpo no hay contra qué medir: lo decide AdminGoalsDB con la guardada.
    expect(metaEditarSchema.safeParse({ unit: "kg", current: 5 }).success).toBe(true);
  });

  it("un error de forma no se confunde con una regla del catálogo", () => {
    const r = metaCrearSchema.safeParse({ name: "", target: 10 });
    expect(r.success).toBe(false);
    expect(reglaMetaRota(r.error?.issues ?? [])).toBeNull();
  });
});
